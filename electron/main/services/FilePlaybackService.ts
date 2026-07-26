import { open, readFile, type FileHandle } from 'node:fs/promises'
import { StringDecoder } from 'node:string_decoder'

const TIME_TAG_RECORDS_OFFSET = 76
const READ_CHUNK_SIZE = 64 * 1024
const DELIVERY_BATCH_INTERVAL_MS = 25
const DELIVERY_BATCH_MAX_BYTES = 32 * 1024
const DELIVERY_BATCH_MAX_CHECKPOINTS = 256

export interface FilePlaybackRequest {
  path: string
  replaySpeed?: number
  startOffset?: number
  filePositionBytes?: 4 | 8
}

export interface FilePlaybackStatus {
  state: 'playing' | 'completed' | 'stopped' | 'error'
  path: string
  message?: string
}

export interface TimeTagEntry {
  tick: number
  position: number
}

interface PlaybackSender {
  isDestroyed(): boolean
  send(channel: string, ...args: unknown[]): void
}

interface PlaybackSession {
  ownerId: number
  path: string
  handle: FileHandle
  sender: PlaybackSender
  fileSize: number
  replaySpeed: number
  startOffsetMs: number
  entries: TimeTagEntry[]
  cancelled: boolean
  timer?: ReturnType<typeof setTimeout>
  wake?: () => void
}

interface ReplayCheckpoint {
  tick: number
  position: number
}

export function parseRtklibTimeTag(
  tag: Buffer,
  filePositionBytes: 4 | 8 = 4,
  tagPath = 'time-tag file',
): TimeTagEntry[] {
  if (tag.length < TIME_TAG_RECORDS_OFFSET) {
    throw new Error(`RTKLIB 时间戳文件长度不足: ${tagPath}`)
  }
  if (tag.subarray(0, 14).toString('ascii') !== 'TIMETAG RTKLIB') {
    throw new Error(`RTKLIB 时间戳文件头无效: ${tagPath}`)
  }

  const entries: TimeTagEntry[] = []
  const recordSize = 4 + filePositionBytes
  let previousTick = 0
  let previousPosition = 0

  for (
    let offset = TIME_TAG_RECORDS_OFFSET;
    offset + recordSize <= tag.length;
    offset += recordSize
  ) {
    const tick = tag.readUInt32LE(offset)
    const position =
      filePositionBytes === 4
        ? tag.readUInt32LE(offset + 4)
        : Number(tag.readBigUInt64LE(offset + 4))

    if (!Number.isSafeInteger(position)) {
      throw new Error(`RTKLIB 时间戳文件位置超出安全整数范围: ${tagPath}`)
    }
    if (entries.length > 0 && (tick < previousTick || position < previousPosition)) {
      throw new Error(`RTKLIB 时间戳记录必须按时间和文件位置递增: ${tagPath}`)
    }

    entries.push({ tick, position })
    previousTick = tick
    previousPosition = position
  }

  return entries
}

export function buildReplayCheckpoints(
  entries: readonly TimeTagEntry[],
  fileSize: number,
): ReplayCheckpoint[] {
  if (entries.length === 0) return [{ tick: 0, position: fileSize }]

  const checkpoints = entries.map((entry, index) => ({
    tick: index === 0 ? 0 : entries[index - 1].tick,
    position: Math.min(fileSize, entry.position),
  }))
  checkpoints.push({
    tick: entries[entries.length - 1].tick,
    position: fileSize,
  })
  return checkpoints
}

export class FilePlaybackService {
  private readonly sessions = new Map<number, PlaybackSession>()

  public async start(
    ownerId: number,
    value: unknown,
    sender: PlaybackSender,
  ): Promise<{ ok: true }> {
    const request = normalizeRequest(value)
    await this.stop(ownerId, false)

    const tagPath = `${request.path}.tag`
    const tag = await readFile(tagPath)
    const entries = parseRtklibTimeTag(tag, request.filePositionBytes, tagPath)
    const handle = await open(request.path, 'r')

    try {
      const stat = await handle.stat()
      for (const entry of entries) {
        if (entry.position > stat.size) {
          throw new Error(`RTKLIB 时间戳记录超出数据文件长度: ${tagPath}`)
        }
      }

      const session: PlaybackSession = {
        ownerId,
        path: request.path,
        handle,
        sender,
        fileSize: stat.size,
        replaySpeed: request.replaySpeed,
        startOffsetMs: request.startOffset * 1000,
        entries,
        cancelled: false,
      }
      this.sessions.set(ownerId, session)
      this.sendStatus(session, 'playing')
      void this.run(session)
      return { ok: true }
    } catch (error) {
      await handle.close().catch(() => undefined)
      throw error
    }
  }

  public async stop(ownerId: number, notify = true): Promise<void> {
    const session = this.sessions.get(ownerId)
    if (!session) return

    session.cancelled = true
    if (session.timer) clearTimeout(session.timer)
    session.wake?.()
    this.sessions.delete(ownerId)
    await session.handle.close().catch(() => undefined)
    if (notify) this.sendStatus(session, 'stopped')
  }

  public async stopAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((ownerId) => this.stop(ownerId, false)))
  }

  private async run(session: PlaybackSession): Promise<void> {
    const decoder = new StringDecoder('utf8')
    const checkpoints = buildReplayCheckpoints(session.entries, session.fileSize)
    const startedAt = Date.now()
    let position = 0
    let checkpointIndex = 0

    try {
      while (checkpointIndex < checkpoints.length) {
        // Renderer charts publish at a much lower rate than dense RTKLIB tags.
        // Release a short bounded time window per IPC event so pointer and menu
        // events can run between playback updates.
        const firstCheckpoint = checkpoints[checkpointIndex]
        const firstTargetDelay = Math.max(
          0,
          (firstCheckpoint.tick - session.startOffsetMs) / session.replaySpeed,
        )
        let checkpoint = firstCheckpoint
        let batchCheckpointCount = 1

        while (
          checkpointIndex + batchCheckpointCount < checkpoints.length &&
          batchCheckpointCount < DELIVERY_BATCH_MAX_CHECKPOINTS
        ) {
          const candidate = checkpoints[checkpointIndex + batchCheckpointCount]
          const candidateTargetDelay = Math.max(
            0,
            (candidate.tick - session.startOffsetMs) / session.replaySpeed,
          )
          if (candidateTargetDelay - firstTargetDelay > DELIVERY_BATCH_INTERVAL_MS) break
          if (candidate.position - position > DELIVERY_BATCH_MAX_BYTES) break
          checkpoint = candidate
          batchCheckpointCount += 1
        }

        const targetDelay = Math.max(
          0,
          (checkpoint.tick - session.startOffsetMs) / session.replaySpeed,
        )
        await this.wait(session, Math.max(0, startedAt + targetDelay - Date.now()))
        if (!this.isActive(session)) return

        position = await this.readUntil(session, position, checkpoint.position, decoder)
        checkpointIndex += batchCheckpointCount
      }

      const remainder = decoder.end()
      if (remainder) this.sendData(session, remainder)
      await session.handle.close()
      if (!this.isActive(session)) return
      this.sessions.delete(session.ownerId)
      this.sendStatus(session, 'completed')
    } catch (error) {
      if (session.cancelled) return
      await session.handle.close().catch(() => undefined)
      this.sessions.delete(session.ownerId)
      this.sendStatus(session, 'error', error instanceof Error ? error.message : String(error))
    }
  }

  private async readUntil(
    session: PlaybackSession,
    start: number,
    end: number,
    decoder: StringDecoder,
  ): Promise<number> {
    let position = start
    while (position < end && this.isActive(session)) {
      const length = Math.min(READ_CHUNK_SIZE, end - position)
      const buffer = Buffer.allocUnsafe(length)
      const result = await session.handle.read(buffer, 0, length, position)
      if (result.bytesRead <= 0) break
      position += result.bytesRead
      const data = decoder.write(buffer.subarray(0, result.bytesRead))
      if (data) this.sendData(session, data)
    }
    return position
  }

  private wait(session: PlaybackSession, delay: number): Promise<void> {
    if (session.cancelled) return Promise.resolve()
    if (delay <= 0) {
      // Yield even when playback is behind schedule so stop IPC and window
      // events are not starved by a long chain of resolved promises.
      return new Promise((resolve) => setImmediate(resolve))
    }
    return new Promise((resolve) => {
      const finish = () => {
        session.timer = undefined
        session.wake = undefined
        resolve()
      }
      session.wake = finish
      session.timer = setTimeout(finish, delay)
    })
  }

  private isActive(session: PlaybackSession): boolean {
    return (
      !session.cancelled &&
      this.sessions.get(session.ownerId) === session &&
      !session.sender.isDestroyed()
    )
  }

  private sendData(session: PlaybackSession, data: string): void {
    if (this.isActive(session)) session.sender.send('file-playback-data', data)
  }

  private sendStatus(
    session: PlaybackSession,
    state: FilePlaybackStatus['state'],
    message?: string,
  ): void {
    if (session.sender.isDestroyed()) return
    session.sender.send('file-playback-status', {
      state,
      path: session.path,
      message,
    } satisfies FilePlaybackStatus)
  }
}

function normalizeRequest(value: unknown): Required<FilePlaybackRequest> {
  if (!value || typeof value !== 'object') throw new Error('文件播放参数无效')
  const request = value as FilePlaybackRequest
  const filePath = typeof request.path === 'string' ? request.path.trim() : ''
  if (!filePath) throw new Error('请选择需要播放的数据文件')

  const replaySpeed = request.replaySpeed ?? 1
  if (!Number.isFinite(replaySpeed) || replaySpeed <= 0) {
    throw new Error('播放倍速必须为正数')
  }

  const startOffset = request.startOffset ?? 0
  if (!Number.isFinite(startOffset) || startOffset < 0) {
    throw new Error('起始偏移不能小于 0')
  }

  const filePositionBytes = request.filePositionBytes ?? 4
  if (filePositionBytes !== 4 && filePositionBytes !== 8) {
    throw new Error('文件位置格式只能为 4 或 8 字节')
  }

  return {
    path: filePath,
    replaySpeed,
    startOffset,
    filePositionBytes,
  }
}
