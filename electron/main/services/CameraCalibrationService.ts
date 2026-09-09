import { CameraCalibration } from '../../../src/core/camera/CameraCalibration'
import { InssegParser } from '../../../src/core/camera/InssegParser'
import {
  createCalibrationSnapshot, isCalibrationRunning,
  type CameraCalibrationConfig, type CameraCalibrationSnapshot,
} from '../../../src/core/camera/CameraCalibrationTypes'

type Endpoint = { host: string; port: number }
export interface CameraCalibrationHost {
  now(): number
  tcpTarget(): Endpoint | undefined
  writeParams(content: string): Promise<void>
}

export class CameraCalibrationService {
  private state = createCalibrationSnapshot()
  private readonly parser = new InssegParser()
  private engine: CameraCalibration | undefined
  private owner: number | undefined
  private endpoint: Endpoint | undefined
  private lastFrameAt = -Infinity
  private rawBuffer = ''
  private writing = false
  private manualWrites = 0
  private publish: (state: CameraCalibrationSnapshot) => void = () => undefined
  private sshHost: (sessionId: string) => string = () => { throw new Error('SSH 模块尚未就绪') }

  public constructor(private readonly host: CameraCalibrationHost) {}

  public configure(sshHost: (sessionId: string) => string, publish: (state: CameraCalibrationSnapshot) => void): void {
    this.sshHost = sshHost
    this.publish = publish
  }

  public snapshot(): CameraCalibrationSnapshot {
    return structuredClone({ ...this.state, ...this.engine?.snapshot(), busy: this.writing || this.manualWrites > 0 })
  }

  public async manual<T>(action: () => Promise<T>): Promise<T> {
    if (this.writing || isCalibrationRunning(this.snapshot().phase)) throw new Error('自动标定占用控制通道，请先停止标定')
    this.manualWrites++
    this.emit()
    try { return await action() } finally { this.manualWrites--; this.emit() }
  }

  public observe(owner: number, sessionId: string): CameraCalibrationSnapshot {
    if (this.owner !== undefined && this.owner !== owner) throw new Error('另一窗口正在观测或标定')
    if (this.writing || this.manualWrites || isCalibrationRunning(this.snapshot().phase)) throw new Error('请先停止标定并等待发送结束')
    const sourceHost = this.sshHost(sessionId)
    this.owner = owner
    this.engine = undefined
    this.endpoint = undefined
    this.parser.reset()
    this.rawBuffer = ''
    this.lastFrameAt = -Infinity
    this.state = { ...createCalibrationSnapshot(), observing: true, sourceSessionId: sessionId,
      sourceHost, phase: 'observing', reason: '只订阅此 SSH 终端的新输出，不自动运行脚本或写参数' }
    return this.emit()
  }

  public start(owner: number, config: CameraCalibrationConfig): CameraCalibrationSnapshot {
    this.requireOwner(owner)
    if (this.writing || this.manualWrites || isCalibrationRunning(this.snapshot().phase)) throw new Error('控制通道忙')
    if (!this.state.observing || this.host.now() - this.lastFrameAt > 1500) throw new Error('请先取得实时 INSSEG 数据')
    const endpoint = this.host.tcpTarget()
    if (!endpoint || endpoint.host.trim().toLowerCase() !== this.state.sourceHost?.trim().toLowerCase()) {
      throw new Error('TCP 与 SSH 必须连接同一相机，请使用一致的主机地址')
    }
    const last = this.state.lastFrame
    if (!last || last.targets.length !== 2 || last.targets.some((t) => t.classId !== config.personClassId)) {
      throw new Error('当前必须恰好上报两个指定类别的人形')
    }
    const engine = new CameraCalibration(config, this.host.now())
    this.endpoint = { ...endpoint }
    this.ensureEndpoint()
    this.engine = engine
    this.parser.reset()
    this.state.config = { ...config }
    this.state.originalParams = `${config.height},${config.fov},${config.initialOffset}`
    this.state.lastSentParams = null
    return this.emit()
  }

  public receive(sessionId: string, data: string): void {
    if (!this.state.observing || this.state.sourceSessionId !== sessionId) return
    this.rawBuffer = (this.rawBuffer + data).slice(-32768)
    const lines = this.rawBuffer.split('\n')
    this.rawBuffer = lines.pop() ?? ''
    this.state.rawLines = [...this.state.rawLines, ...lines.filter((line) => line.startsWith('$ESTAR,INSSEG,'))].slice(-20)
    let candidate: number | undefined
    for (const result of this.parser.push(data)) {
      if (result.type === 'error') {
        this.state.invalidFrames++
        this.state.reason = result.message
        this.engine?.invalidate(result.message, this.host.now())
        candidate = undefined
        continue
      }
      this.state.validFrames++
      this.state.lastFrame = result.frame
      this.state.reportedCount = result.frame.targets.length
      this.lastFrameAt = this.host.now()
      const next = this.engine?.push(result.frame, this.host.now())
      if (next !== undefined) candidate = next
      if (this.engine?.snapshot().phase !== 'writing') candidate = undefined
    }
    if (candidate !== undefined && !this.writing) void this.sendCandidate(candidate)
    this.emit()
  }

  public tick(): void {
    if (this.engine && isCalibrationRunning(this.engine.snapshot().phase)) {
      try { this.ensureEndpoint() } catch (error) { this.engine.fail(String(error)) }
      this.engine.tick(this.host.now())
      this.emit()
    }
  }

  public stop(reason = '已停止；已发送参数不会自动恢复'): CameraCalibrationSnapshot {
    if (this.engine && isCalibrationRunning(this.engine.snapshot().phase)) this.engine.stop(reason)
    return this.emit()
  }

  public close(owner?: number): CameraCalibrationSnapshot {
    if (owner !== undefined && owner !== this.owner) return this.snapshot()
    this.stop('观测已结束；SSH 中手动启动的脚本需 Ctrl-C 或等待其超时')
    this.state.observing = false
    this.owner = undefined
    this.parser.reset()
    if (!this.engine) { this.state.phase = 'stopped'; this.state.reason = '已结束观测订阅' }
    return this.emit()
  }

  public async restore(owner: number): Promise<CameraCalibrationSnapshot> {
    this.requireOwner(owner)
    if (this.writing || this.manualWrites || isCalibrationRunning(this.snapshot().phase)) throw new Error('请先停止标定并等待发送结束')
    if (!this.state.originalParams) throw new Error('没有人工确认的标定前参数')
    this.ensureEndpoint()
    this.writing = true
    const content = this.state.originalParams
    this.state.lastSentParams = content
    this.emit()
    try {
      await this.writeWithTimeout(content)
      this.engine?.stop('原参数恢复请求已发送，尚未回读确认；请人工核实')
    } catch (error) {
      this.engine?.fail(`恢复发送失败，设备参数状态未知：${String(error)}`)
      throw error
    } finally { this.writing = false; this.emit() }
    return this.snapshot()
  }

  private async sendCandidate(offset: number): Promise<void> {
    const engine = this.engine
    const config = this.state.config
    if (!engine || !config || this.writing || this.manualWrites || engine.snapshot().phase !== 'writing') return
    this.writing = true
    try {
      this.ensureEndpoint()
      const content = `${config.height},${config.fov},${offset}`
      this.state.lastSentParams = content
      this.emit()
      await this.writeWithTimeout(content)
      if (engine.snapshot().phase === 'writing') engine.written(offset, this.host.now())
      else if (isCalibrationRunning(engine.snapshot().phase)) engine.fail('发送期间观测失效，参数可能已改变，请核实后重新开始')
    } catch (error) {
      engine.fail(`参数发送失败或未确认，停止自动写入：${String(error)}`)
    } finally { this.writing = false; this.emit() }
  }

  private async writeWithTimeout(content: string): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        this.host.writeParams(content),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('发送等待超过 5 秒；不能确定设备是否已应用')), 5000)
        }),
      ])
    } finally { if (timer) clearTimeout(timer) }
  }

  private requireOwner(owner: number): void {
    if (this.owner !== owner) throw new Error('请在启动观测的窗口操作')
  }

  private ensureEndpoint(): void {
    const current = this.host.tcpTarget()
    if (!current || !this.endpoint || current.host !== this.endpoint.host || current.port !== this.endpoint.port) {
      throw new Error('相机控制连接已断开或改变')
    }
    if (!this.state.sourceSessionId || this.sshHost(this.state.sourceSessionId) !== this.state.sourceHost) {
      throw new Error('相机 SSH 测量连接已断开或改变')
    }
  }

  private emit(): CameraCalibrationSnapshot {
    const state = this.snapshot()
    this.publish(state)
    return state
  }
}
