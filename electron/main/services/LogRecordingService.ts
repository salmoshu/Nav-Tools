import { open, type FileHandle } from 'node:fs/promises'

const TIME_TAG_RECORDS_OFFSET = 76

export interface LogRecordingStatus {
  state: 'recording' | 'stopped' | 'error'
  path: string
  message?: string
}

interface RecordingSender {
  isDestroyed(): boolean
  send(channel: string, ...args: unknown[]): void
}

interface RecordingSession {
  ownerId: number
  path: string
  dataHandle: FileHandle
  tagHandle: FileHandle
  sender: RecordingSender
  openedAt: number
  position: number
  tagPosition: number
  queue: Promise<void>
  closing: boolean
}

export function createRtklibTimeTagHeader(openTimeMs: number): Buffer {
  const header = Buffer.alloc(TIME_TAG_RECORDS_OFFSET)
  header.write('TIMETAG RTKLIB Nav-Tools', 0, 'ascii')
  header.writeUInt32LE(openTimeMs >>> 0, 60)
  header.writeUInt32LE(Math.floor(openTimeMs / 1000), 64)
  header.writeDoubleLE(0, 68)
  return header
}

export function createRtklibTimeTagRecord(
  tick: number,
  position: number,
  filePositionBytes: 4 | 8 = 4,
): Buffer {
  if (!Number.isSafeInteger(position) || position < 0) {
    throw new Error('日志文件位置无效')
  }
  if (filePositionBytes === 4 && position > 0xffffffff) {
    throw new Error('日志文件超过 RTKLIB 32 位时间戳格式的 4 GiB 限制')
  }

  const record = Buffer.alloc(4 + filePositionBytes)
  record.writeUInt32LE(tick >>> 0, 0)
  if (filePositionBytes === 4) record.writeUInt32LE(position, 4)
  else record.writeBigUInt64LE(BigInt(position), 4)
  return record
}

export class LogRecordingService {
  private readonly sessions = new Map<number, RecordingSession>()

  public async start(
    ownerId: number,
    value: unknown,
    sender: RecordingSender,
  ): Promise<{ ok: true }> {
    const filePath = typeof value === 'string' ? value.trim() : ''
    if (!filePath) throw new Error('日志保存路径不能为空')
    await this.stop(ownerId, false)

    const dataHandle = await open(filePath, 'w')
    let tagHandle: FileHandle | undefined
    try {
      tagHandle = await open(`${filePath}.tag`, 'w')
      const openedAt = Date.now()
      const header = createRtklibTimeTagHeader(openedAt)
      await tagHandle.write(header, 0, header.length, 0)

      const session: RecordingSession = {
        ownerId,
        path: filePath,
        dataHandle,
        tagHandle,
        sender,
        openedAt,
        position: 0,
        tagPosition: TIME_TAG_RECORDS_OFFSET,
        queue: Promise.resolve(),
        closing: false,
      }
      this.sessions.set(ownerId, session)
      this.sendStatus(session, 'recording')
      return { ok: true }
    } catch (error) {
      await dataHandle.close().catch(() => undefined)
      await tagHandle?.close().catch(() => undefined)
      throw error
    }
  }

  public write(ownerId: number, value: unknown): void {
    const session = this.sessions.get(ownerId)
    if (!session || session.closing) return
    const data = Buffer.from(String(value), 'utf8')
    if (data.length === 0) return

    session.queue = session.queue
      .then(async () => {
        if (this.sessions.get(ownerId) !== session) return
        await session.dataHandle.write(data, 0, data.length, session.position)
        session.position += data.length

        const record = createRtklibTimeTagRecord(Date.now() - session.openedAt, session.position)
        await session.tagHandle.write(record, 0, record.length, session.tagPosition)
        session.tagPosition += record.length
      })
      .catch((error) => this.fail(session, error))
  }

  public async stop(ownerId: number, notify = true): Promise<void> {
    const session = this.sessions.get(ownerId)
    if (!session) return
    session.closing = true
    await session.queue.catch(() => undefined)
    this.sessions.delete(ownerId)
    await Promise.all([
      session.dataHandle.close().catch(() => undefined),
      session.tagHandle.close().catch(() => undefined),
    ])
    if (notify) this.sendStatus(session, 'stopped')
  }

  public async stopAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((ownerId) => this.stop(ownerId, false)))
  }

  private fail(session: RecordingSession, error: unknown): void {
    if (this.sessions.get(session.ownerId) !== session) return
    session.closing = true
    this.sessions.delete(session.ownerId)
    void Promise.all([
      session.dataHandle.close().catch(() => undefined),
      session.tagHandle.close().catch(() => undefined),
    ])
    this.sendStatus(session, 'error', error instanceof Error ? error.message : String(error))
  }

  private sendStatus(
    session: RecordingSession,
    state: LogRecordingStatus['state'],
    message?: string,
  ): void {
    if (session.sender.isDestroyed()) return
    session.sender.send('log-recording-status', {
      state,
      path: session.path,
      message,
    } satisfies LogRecordingStatus)
  }
}
