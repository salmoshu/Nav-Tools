import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { JpegStreamParser } from '../../../src/core/camera/JpegStreamParser'
import { LabelVoter, recognizeLabels } from '../../../src/core/camera/LabelOcr'

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
  /** 标签识别:原始 rgb24 帧缓冲与帧尺寸(取自首帧 JPEG SOF) */
  voter: LabelVoter
  ocrBuffer: Buffer
  frameWidth: number
  frameHeight: number
  lastLabelsKey: string
}

export interface CameraStreamStartResult {
  ok: boolean
  message?: string
}

/** 红字掩码(黑=文字)与绿框掩码(黑=框线)表达式,供 ffmpeg geq 使用 */
const RED_MASK_EXPR = 'if(gt(r(X,Y),100)*gt(r(X,Y),g(X,Y)+30)*gt(r(X,Y),b(X,Y)+30),0,255)'
const GREEN_MASK_EXPR = 'if(gt(g(X,Y),140)*gt(g(X,Y),r(X,Y)+40)*gt(g(X,Y),b(X,Y)+40),0,255)'

/** 从 JPEG 数据中解析帧尺寸(SOF0~SOF15,排除 DHT/DAC/RST) */
function parseJpegSize(frame: Uint8Array): { width: number; height: number } | undefined {
  for (let i = 0; i + 9 < frame.length; i++) {
    if (frame[i] !== 0xff) continue
    const marker = frame[i + 1]
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (frame[i + 5] << 8) | frame[i + 6], width: (frame[i + 7] << 8) | frame[i + 8] }
    }
  }
  return undefined
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
    // 两路输出:pipe:1 = MJPEG 显示流;pipe:3 = 红/绿掩码 rgb24 裸帧,供标签识别
    const process = spawn(this.ffmpegExecutable, [
      '-hide_banner',
      '-loglevel', 'warning',
      '-rtsp_transport', transport,
      '-fflags', 'nobuffer',
      '-flags', 'low_delay',
      '-i', url,
      '-an',
      '-filter_complex',
      `[0:v]split=2[va][vb];[va]fps=15[outv];[vb]fps=2,format=rgb24,geq=r='${RED_MASK_EXPR}':g='${GREEN_MASK_EXPR}':b='255'[outm]`,
      '-map', '[outv]',
      '-q:v', '2',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      'pipe:1',
      '-map', '[outm]',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      'pipe:3',
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe'] })

    const session: CameraStreamSession = {
      process,
      parser: new JpegStreamParser(),
      target,
      url,
      transport,
      errorOutput: '',
      receivedFrame: false,
      stopping: false,
      voter: new LabelVoter(),
      ocrBuffer: Buffer.alloc(0),
      frameWidth: 0,
      frameHeight: 0,
      lastLabelsKey: '',
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
        if (!session.frameWidth) {
          const size = parseJpegSize(frame)
          if (size) {
            session.frameWidth = size.width
            session.frameHeight = size.height
          }
        }
        target.send('camera-stream-frame', frame)
      }
    })

    const ocrStream = process.stdio[3]
    ocrStream?.on('data', (chunk: Buffer) => {
      if (this.sessions.get(id) !== session || target.isDestroyed()) return
      const { frameWidth: width, frameHeight: height } = session
      if (!width || !height) return

      session.ocrBuffer = session.ocrBuffer.length ? Buffer.concat([session.ocrBuffer, chunk]) : chunk
      const frameSize = width * height * 3
      while (session.ocrBuffer.length >= frameSize) {
        const frame = session.ocrBuffer.subarray(0, frameSize)
        session.ocrBuffer = session.ocrBuffer.subarray(frameSize)

        const labels = recognizeLabels(new Uint8Array(frame.buffer, frame.byteOffset, frameSize), width, height)
        session.voter.push(labels)
        const stable = session.voter.getStable()
        const key = stable.join('|')
        if (key !== session.lastLabelsKey) {
          session.lastLabelsKey = key
          target.send('camera-stream-labels', { labels: stable })
        }
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
