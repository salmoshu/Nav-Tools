import { Client, type ClientChannel } from 'ssh2'
import { StraceFrameExtractor } from '../../../src/core/camera/StraceFrameExtractor'

export interface CameraMeasurementAccess {
  host: string
  port: number
  username: string
  password: string
}

export interface CameraMeasurementTeardown {
  straceCleared: boolean
  tracerPidZero: boolean
  tracerPid: string
  detail: string
}

export interface CameraMeasurementHandlers {
  /** 还原后的 ttyS6 原始文本流（含 INSSEG 报文） */
  onText(text: string): void
  onStatus(state: 'connecting' | 'streaming' | 'stopped', detail: string): void
  onError(message: string): void
}

/** strace 采样在设备端的最后期限（秒）；正常结束由上位机主动关闭，此值只兜底 */
const DEVICE_TIMEOUT_S = 300
const CONNECT_TIMEOUT_MS = 8_000

/**
 * 相机 INSSEG 测量通道：SSH 到相机板后 exec 限时 strace，
 * 旁听 appMain 写往 /dev/ttyS6 的 NMEA 报文流。
 * 不上传任何文件；关闭时先断采样流，再核实 TracerPid 归零、无 strace 残留。
 */
export class CameraSshMeasurementChannel {
  private client: Client | undefined
  private stream: ClientChannel | undefined
  private readonly extractor = new StraceFrameExtractor()
  private stopping = false

  public async start(access: CameraMeasurementAccess, handlers: CameraMeasurementHandlers): Promise<void> {
    // 防陈旧通道:上一轮未完全拆除时先补拆(幂等, 空闲时近似空操作)
    if (this.client) await this.stopAndVerify()
    this.stopping = false
    this.extractor.reset()
    handlers.onStatus('connecting', `正在连接 ${access.host}:${access.port} …`)
    const client = new Client()
    this.client = client

    try {
      await new Promise<void>((resolve, reject) => {
        client
          .once('ready', () => resolve())
          .once('error', (error: Error) => reject(new Error(`SSH 连接失败：${error.message}`)))
          .connect({
            host: access.host,
            port: access.port,
            username: access.username,
            password: access.password,
            readyTimeout: CONNECT_TIMEOUT_MS,
          })
      })

      await new Promise<void>((resolve, reject) => {
        const command =
          `timeout -k 2 ${DEVICE_TIMEOUT_S} strace -f -q -y -p "$(pidof appMain)" -e trace=write -s 16384 2>&1`
        client.exec(command, (error, stream) => {
          if (error) { reject(new Error(`启动采样失败：${error.message}`)); return }
          this.stream = stream
          stream.on('data', (chunk: Buffer) => handlers.onText(this.extractor.push(chunk.toString('utf8'))))
          stream.stderr?.on('data', (chunk: Buffer) =>
            handlers.onText(this.extractor.push(chunk.toString('utf8'))))
          stream.on('close', () => {
            handlers.onStatus('stopped', '采样已结束')
            this.stream = undefined
            if (!this.stopping) handlers.onError('采样进程提前退出（appMain 可能未运行或被占用）')
          })
          handlers.onStatus('streaming', '正在旁听 ttyS6 的 INSSEG 报文流')
          resolve()
        })
      })
    } catch (error) {
      this.client = undefined
      client.end()
      throw error
    }
  }

  /** 终止采样并核实现场：无 strace 残留进程、appMain 的 TracerPid 归零 */
  public async stopAndVerify(): Promise<CameraMeasurementTeardown> {
    this.stopping = true
    this.stream?.close()
    this.stream = undefined
    const client = this.client
    this.client = undefined
    if (!client) {
      return { straceCleared: true, tracerPidZero: true, tracerPid: '0', detail: '通道未建立' }
    }
    const report = await new Promise<string>((resolve) => {
      client.exec(
        'pkill -f "strace -f -q -y -p" 2>/dev/null; sleep 0.3; ' +
        'echo "--STRACE--"; pgrep -fa "strace -f -q -y -p" || true; ' +
        'echo "--TRACER--"; grep TracerPid "/proc/$(pidof appMain)/status" || echo "TracerPid: 0"',
        (error, stream) => {
          if (error) { resolve(''); return }
          let output = ''
          stream.on('data', (chunk: Buffer) => { output += chunk.toString('utf8') })
          stream.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString('utf8') })
          stream.on('close', () => resolve(output))
        },
      )
    })
    client.end()
    const straceResidual = /--STRACE--\r?\n?([\s\S]*?)--TRACER--/.exec(report)?.[1]?.trim() ?? ''
    const tracerPid = /TracerPid:\s*(\d+)/.exec(report)?.[1] ?? 'unknown'
    return {
      straceCleared: straceResidual.length === 0,
      tracerPidZero: tracerPid === '0',
      tracerPid,
      detail: report.trim().slice(-300),
    }
  }

  public isActive(): boolean {
    return this.client !== undefined
  }
}
