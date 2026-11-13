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

const CONNECT_TIMEOUT_MS = 8_000
const EXEC_TIMEOUT_MS = 5_000
const TEARDOWN_TIMEOUT_MS = 3_000

// 采样不设总时限。SSH stdin 关闭时看守进程终止 strace；strace 自行退出时，
// 父 shell 会保留退出码并清理看守进程，两条路径都不留下后台采样进程。
const MEASUREMENT_COMMAND = [
  'trace_pid=; stdin_pid=',
  'cleanup() {',
  '  trap - EXIT HUP INT TERM',
  '  [ -z "$trace_pid" ] || kill -TERM "$trace_pid" 2>/dev/null || true',
  '  [ -z "$stdin_pid" ] || kill -TERM "$stdin_pid" 2>/dev/null || true',
  '  [ -z "$trace_pid" ] || wait "$trace_pid" 2>/dev/null || true',
  '  [ -z "$stdin_pid" ] || wait "$stdin_pid" 2>/dev/null || true',
  '}',
  'trap cleanup EXIT',
  "trap 'exit 0' HUP INT TERM",
  'exec 3<&0',
  'strace -f -q -y -p "$(pidof appMain)" -e trace=write -s 16384 </dev/null 2>&1 &',
  'trace_pid=$!',
  '(',
  '  trap - EXIT HUP INT TERM',
  '  while IFS= read -r line; do :; done',
  '  kill -TERM "$trace_pid" 2>/dev/null || true',
  ') <&3 &',
  'stdin_pid=$!',
  'wait "$trace_pid"',
  'result=$?',
  'exit "$result"',
].join('\n')

/**
 * 相机 INSSEG 测量通道：SSH 到相机板后持续运行 strace，
 * 旁听 appMain 写往 /dev/ttyS6 的 NMEA 报文流。
 * 不上传任何文件；关闭时先断采样流，再核实 TracerPid 归零、无 strace 残留。
 */
export class CameraSshMeasurementChannel {
  private client: Client | undefined
  private stream: ClientChannel | undefined
  private readonly extractor = new StraceFrameExtractor()
  private stopping = false
  private generation = 0

  public async start(
    access: CameraMeasurementAccess,
    handlers: CameraMeasurementHandlers,
  ): Promise<void> {
    // 防陈旧通道:上一轮未完全拆除时先补拆(幂等, 空闲时近似空操作)
    if (this.client) await this.stopAndVerify()
    const generation = ++this.generation
    this.stopping = false
    this.extractor.reset()
    handlers.onStatus('connecting', `正在连接 ${access.host}:${access.port} …`)
    const client = new Client()
    this.client = client
    const ensureCurrent = () => {
      if (this.generation !== generation || this.client !== client) {
        client.end()
        throw new Error('测量通道连接已被新的重连取代')
      }
    }
    let connected = false
    let failureReported = false
    const reportFailure = (detail: string) => {
      if (this.client !== client || this.stopping || failureReported) return
      failureReported = true
      handlers.onStatus('stopped', detail)
      handlers.onError(detail)
    }
    client.on('error', (error: Error) => {
      if (connected) reportFailure(`SSH 连接异常，测量已停止：${error.message}`)
    })
    client.on('close', () => {
      if (!connected || this.client !== client) return
      reportFailure('SSH 连接已断开，测量已停止，请重新连接')
      this.client = undefined
      this.stream = undefined
    })

    try {
      await new Promise<void>((resolve, reject) => {
        const closed = () => reject(new Error('SSH 连接在认证完成前关闭，请检查设备和登录配置'))
        client
          .once('close', closed)
          .once('ready', () => {
            connected = true
            client.off('close', closed)
            resolve()
          })
          .once('error', (error: Error) => reject(new Error(`SSH 连接失败：${error.message}`)))
          .connect({
            host: access.host,
            port: access.port,
            username: access.username,
            password: access.password,
            readyTimeout: CONNECT_TIMEOUT_MS,
            keepaliveInterval: 5_000,
            keepaliveCountMax: 3,
          })
      })
      ensureCurrent()

      await new Promise<void>((resolve, reject) => {
        let pending = true
        const timer = setTimeout(() => {
          pending = false
          reject(new Error('启动采样超时：SSH 未在 5 秒内响应，请重新连接'))
        }, EXEC_TIMEOUT_MS)
        client.exec(MEASUREMENT_COMMAND, (error, stream) => {
          if (!pending) {
            stream?.close()
            return
          }
          pending = false
          clearTimeout(timer)
          try {
            ensureCurrent()
          } catch (currentError) {
            stream?.close()
            reject(currentError)
            return
          }
          if (error) {
            reject(new Error(`启动采样失败：${error.message}`))
            return
          }
          this.stream = stream
          const receive = (chunk: Buffer) => {
            if (this.client === client && !this.stopping && !failureReported)
              handlers.onText(this.extractor.push(chunk.toString('utf8')))
          }
          stream.on('data', receive)
          stream.stderr?.on('data', receive)
          stream.on('error', (error: Error) => reportFailure(`测量采样通道异常：${error.message}`))
          stream.on('close', (code: number | undefined, signal: string | undefined) => {
            if (this.client !== client) return
            const detail = `采样进程已退出${signal ? `（信号 ${signal}）` : code === undefined ? '' : `（退出码 ${code}）`}`
            this.stream = undefined
            if (this.stopping) handlers.onStatus('stopped', '采样已结束')
            else reportFailure(detail)
          })
          handlers.onStatus('streaming', '正在旁听 ttyS6 的 INSSEG 报文流')
          resolve()
        })
      })
    } catch (error) {
      if (this.generation === generation && this.client === client) this.client = undefined
      client.end()
      throw error
    }
  }

  /** 终止采样并核实现场：无 strace 残留进程、appMain 的 TracerPid 归零 */
  public async stopAndVerify(): Promise<CameraMeasurementTeardown> {
    this.generation++
    this.stopping = true
    this.stream?.close()
    this.stream = undefined
    const client = this.client
    this.client = undefined
    if (!client) {
      return { straceCleared: true, tracerPidZero: true, tracerPid: '0', detail: '通道未建立' }
    }
    const report = await new Promise<string>((resolve) => {
      const finish = (output: string) => {
        clearTimeout(timer)
        resolve(output)
      }
      const timer = setTimeout(
        () => finish('SSH 清理核查超时（3 秒），设备侧状态未确认'),
        TEARDOWN_TIMEOUT_MS,
      )
      client.exec(
        'pkill -f "[s]trace -f -q -y -p" 2>/dev/null; sleep 0.3; ' +
          'echo "--STRACE--"; pgrep -fa "[s]trace -f -q -y -p" || true; ' +
          'echo "--TRACER--"; grep TracerPid "/proc/$(pidof appMain)/status" || echo "TracerPid: 0"',
        (error, stream) => {
          if (error) {
            finish(`SSH 清理核查失败：${error.message}`)
            return
          }
          let output = ''
          stream.on('data', (chunk: Buffer) => {
            output += chunk.toString('utf8')
          })
          stream.stderr?.on('data', (chunk: Buffer) => {
            output += chunk.toString('utf8')
          })
          stream.on('close', () => finish(output))
        },
      )
    })
    client.end()
    const straceResidual = /--STRACE--\r?\n?([\s\S]*?)--TRACER--/.exec(report)?.[1]?.trim() ?? ''
    const tracerPid = /TracerPid:\s*(\d+)/.exec(report)?.[1] ?? 'unknown'
    return {
      straceCleared:
        report.includes('--STRACE--') &&
        report.includes('--TRACER--') &&
        straceResidual.length === 0,
      tracerPidZero: tracerPid === '0',
      tracerPid,
      detail: report.trim().slice(-300),
    }
  }

  public isActive(): boolean {
    return this.client !== undefined
  }
}
