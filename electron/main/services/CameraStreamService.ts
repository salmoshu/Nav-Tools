import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { JpegStreamParser } from '../../../src/core/camera/JpegStreamParser'

export type CameraStreamStatus = 'connecting' | 'playing' | 'stopped' | 'error'

type RtspTransport = 'udp' | 'tcp'

export interface CameraStreamTarget {
  isDestroyed(): boolean
  send(channel: string, payload: unknown): void
}

interface CameraStreamSession {
  process: ChildProcessWithoutNullStreams
  parser: JpegStreamParser
  target: CameraStreamTarget
  url: string
  transport: RtspTransport
  errorOutput: string
  receivedFrame: boolean
  stopping: boolean
  watchdog?: NodeJS.Timeout
}

export interface CameraStreamStartResult {
  ok: boolean
  message?: string
}

export class CameraStreamService {
  private readonly sessions = new Map<number, CameraStreamSession>()

  // 与 VLC 一致:先尝试 UDP,失败或超时未收到视频帧再回退 TCP
  private static readonly transports: readonly RtspTransport[] = ['udp', 'tcp']
  private static readonly frameWatchdogMs = 10_000

  public constructor(private readonly ffmpegExecutable: string) {}

  public start(id: number, rawUrl: unknown, target: CameraStreamTarget): CameraStreamStartResult {
    const validation = validateRtspUrl(rawUrl)
    if (!validation.ok) return validation

    this.stop(id)
    this.attempt(id, validation.url!, target, 0)
    return { ok: true }
  }

  private attempt(id: number, url: string, target: CameraStreamTarget, transportIndex: number): void {
    const transport = CameraStreamService.transports[transportIndex]
    const process = spawn(this.ffmpegExecutable, [
      '-hide_banner',
      '-loglevel', 'warning',
      '-rtsp_transport', transport,
      '-fflags', 'nobuffer',
      '-flags', 'low_delay',
      '-i', url,
      '-an',
      '-vf', 'fps=15',
      '-q:v', '2',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      'pipe:1',
    ], { windowsHide: true })

    const session: CameraStreamSession = {
      process,
      parser: new JpegStreamParser(),
      target,
      url,
      transport,
      errorOutput: '',
      receivedFrame: false,
      stopping: false,
    }
    this.sessions.set(id, session)
    this.sendStatus(session, 'connecting', '正在连接相机…')

    // 看门狗:UDP 可能出现 SETUP 成功但 RTP 包被网络吞掉的情况,超时未收到帧则回退
    session.watchdog = setTimeout(() => {
      if (this.sessions.get(id) !== session || session.receivedFrame) return
      this.retryOrFail(id, session, transportIndex, '连接超时:未收到视频帧')
    }, CameraStreamService.frameWatchdogMs)

    process.stdout.on('data', (chunk: Buffer) => {
      if (this.sessions.get(id) !== session || target.isDestroyed()) return
      for (const frame of session.parser.push(chunk)) {
        if (!session.receivedFrame) {
          session.receivedFrame = true
          if (session.watchdog) clearTimeout(session.watchdog)
          this.sendStatus(session, 'playing', '直播中')
        }
        target.send('camera-stream-frame', frame)
      }
    })

    process.stderr.on('data', (chunk: Buffer) => {
      session.errorOutput = `${session.errorOutput}${chunk.toString('utf8')}`.slice(-3000)
    })

    process.on('error', error => {
      if (this.sessions.get(id) !== session) return
      this.sessions.delete(id)
      if (session.watchdog) clearTimeout(session.watchdog)
      this.sendStatus(session, 'error', formatProcessError(error.message, this.ffmpegExecutable))
    })

    process.on('close', code => {
      if (this.sessions.get(id) !== session) return
      if (session.watchdog) clearTimeout(session.watchdog)
      if (session.stopping) {
        this.sessions.delete(id)
        this.sendStatus(session, 'stopped', '已停止')
        return
      }

      const detail = cleanFfmpegError(session.errorOutput)
      this.retryOrFail(
        id,
        session,
        transportIndex,
        detail || `视频流已断开${code === null ? '' : `（FFmpeg ${code}）`}`,
      )
    })
  }

  private retryOrFail(
    id: number,
    session: CameraStreamSession,
    transportIndex: number,
    message: string,
  ): void {
    this.sessions.delete(id)
    if (!session.process.killed) session.process.kill()

    const nextIndex = transportIndex + 1
    if (!session.receivedFrame && nextIndex < CameraStreamService.transports.length) {
      this.attempt(id, session.url, session.target, nextIndex)
      return
    }

    const transport = session.transport.toUpperCase()
    this.sendStatus(session, 'error', `${message}（已尝试 ${transport} 传输）`)
  }

  public stop(id: number): void {
    const session = this.sessions.get(id)
    if (!session) return

    this.sessions.delete(id)
    session.stopping = true
    session.parser.reset()
    if (!session.process.killed) session.process.kill()
    this.sendStatus(session, 'stopped', '已停止')
  }

  public stopAll(): void {
    for (const id of [...this.sessions.keys()]) this.stop(id)
  }

  private sendStatus(session: CameraStreamSession, status: CameraStreamStatus, message: string): void {
    if (!session.target.isDestroyed()) {
      session.target.send('camera-stream-status', { status, message })
    }
  }
}

export function validateRtspUrl(rawUrl: unknown): CameraStreamStartResult & { url?: string } {
  if (typeof rawUrl !== 'string' || rawUrl.length > 2048) {
    return { ok: false, message: '请输入有效的 RTSP 地址' }
  }

  try {
    const url = new URL(rawUrl.trim())
    if (url.protocol !== 'rtsp:' || !url.hostname) {
      return { ok: false, message: '地址必须以 rtsp:// 开头' }
    }
    return { ok: true, url: url.toString() }
  } catch {
    return { ok: false, message: 'RTSP 地址格式不正确' }
  }
}

function cleanFfmpegError(output: string): string {
  const lines = output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
  // 跳过 "Error number -135 occurred"、"Error opening input file..." 这类无信息量的包装行,取其前的具体原因
  const informative = [...lines].reverse().find(line => !/^Error (number|opening input)/i.test(line))
  const message = informative ?? lines.at(-1) ?? ''
  return message.length > 220 ? `${message.slice(0, 217)}…` : message
}

function formatProcessError(message: string, executable: string): string {
  if (/ENOENT/i.test(message)) {
    return `未找到 FFmpeg：${executable}`
  }
  return `无法启动视频解码器：${message}`
}
