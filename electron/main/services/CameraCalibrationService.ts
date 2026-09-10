import { CameraCalibration } from '../../../src/core/camera/CameraCalibration'
import { InssegParser } from '../../../src/core/camera/InssegParser'
import {
  parseReadParamsResponse,
  type CameraParamSnapshot,
} from '../../../src/core/camera/CameraParamReadback'
import {
  createCalibrationSnapshot, isCalibrationRunning,
  type CameraCalibrationConfig, type CameraCalibrationRecovery,
  type CameraCalibrationSnapshot,
} from '../../../src/core/camera/CameraCalibrationTypes'
import type { CameraMeasurementAccess, CameraMeasurementTeardown } from './CameraSshMeasurementChannel'

type Endpoint = { host: string; port: number }

/** 与配置表单对比 / 写入核对共用的浮点容差（应答保留三位小数） */
const READBACK_EPSILON = 0.002;

export interface CameraCalibrationHost {
  now(): number
  tcpTarget(): Endpoint | undefined
  writeParams(content: string): Promise<void>
  /** 8080 read_params 回读（裸文本应答） */
  readbackParams(): Promise<CameraParamSnapshot>
  /** 建立 SSH 测量通道，INSSEG 文本流经 onText 到达 receive() */
  startMeasurement(access: CameraMeasurementAccess): Promise<void>
  /** 拆除测量通道并核实现场（无 strace 残留、TracerPid 归零） */
  stopMeasurement(): Promise<CameraMeasurementTeardown>
}

export class CameraCalibrationService {
  private state = createCalibrationSnapshot()
  private readonly parser = new InssegParser()
  private engine: CameraCalibration | undefined
  private owner: number | undefined
  private lastFrameAt = -Infinity
  private rawBuffer = ''
  private writing = false
  private manualWrites = 0
  /** 启动时回读的设备原始参数（恢复现场的基准） */
  private originalSnapshot: CameraParamSnapshot | undefined
  private finalizing = false
  private finalized = false
  private publish: (state: CameraCalibrationSnapshot) => void = () => undefined

  public constructor(private readonly host: CameraCalibrationHost) {}

  public configure(publish: (state: CameraCalibrationSnapshot) => void): void {
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

  /** 开始观测：建立 SSH 测量通道并订阅 INSSEG 流；不动任何相机参数 */
  public async observe(owner: number, access: CameraMeasurementAccess): Promise<CameraCalibrationSnapshot> {
    if (this.owner !== undefined && this.owner !== owner) throw new Error('另一窗口正在观测或标定')
    if (this.writing || this.manualWrites || isCalibrationRunning(this.snapshot().phase)) throw new Error('请先停止标定并等待发送结束')
    this.owner = owner
    this.engine = undefined
    this.originalSnapshot = undefined
    this.finalized = false
    this.finalizing = false
    this.parser.reset()
    this.rawBuffer = ''
    this.lastFrameAt = -Infinity
    this.state = { ...createCalibrationSnapshot(), observing: true,
      ssh: { host: access.host, port: access.port, username: access.username,
        state: 'connecting', detail: '正在建立测量通道' },
      phase: 'observing', reason: '只旁听 ttyS6 的 INSSEG 报文，不写任何参数' }
    this.emit()
    try {
      // 防陈旧通道:上一轮 close/finalize 未及拆除时先补拆(通道空闲时为瞬时空操作)
      await this.host.stopMeasurement().catch(() => undefined)
      await this.host.startMeasurement(access)
    } catch (error) {
      this.state.observing = false
      this.state.ssh = { ...this.state.ssh!, state: 'error', detail: errorMessage(error) }
      this.owner = undefined
      this.state.phase = 'stopped'
      this.state.reason = '测量通道建立失败'
      this.emit()
      throw error
    }
    return this.emit()
  }

  public start(owner: number, config: CameraCalibrationConfig): Promise<CameraCalibrationSnapshot> {
    return this.startInternal(owner, config)
  }

  private async startInternal(owner: number, config: CameraCalibrationConfig): Promise<CameraCalibrationSnapshot> {
    this.requireOwner(owner)
    if (this.writing || this.manualWrites || isCalibrationRunning(this.snapshot().phase)) throw new Error('控制通道忙')
    if (!this.state.observing || this.host.now() - this.lastFrameAt > 1500) throw new Error('请先取得实时 INSSEG 数据')
    if (!this.host.tcpTarget()) throw new Error('相机控制连接已断开，请检查工具栏数据接入的 TCP 连接')

    // 回读门控：height/FOV 是几何标定常量（引擎不调它们、测距全靠它们），
    // 设备与表单不一致时拒绝启动，防止模板值盲目下发毁掉测距正确性
    const readback = await this.host.readbackParams()
    const rad = (config.fov * Math.PI) / 180
    if (Math.abs(readback.height - config.height) > READBACK_EPSILON ||
      Math.abs(readback.fov - rad) > 0.01) {
      throw new Error(
        `设备几何参数与表单不一致：设备回报 ${readback.raw}；` +
        `表单为 height=${config.height}, fov=${config.fov}(°)。` +
        `height/FOV 决定测距几何，自动标定不调整它们，请人工核对表单后再启动`)
    }
    this.originalSnapshot = readback

    const last = this.state.lastFrame
    if (!last || last.targets.length !== config.targets.length ||
      last.targets.some((t) => t.classId !== config.personClassId)) {
      const reported = last
        ? `${last.targets.length} 个目标（${last.targets
            .map((t) => `${t.distance.toFixed(2)}m`)
            .join('、')}）`
        : '尚无有效帧'
      throw new Error(
        `串口当前上报 ${reported}，与配置的 ${config.targets.length} 个人形不符。` +
        `注意：固件仅上报 1.5 m 内的非跟随目标，RTSP 画面中更远的目标不会出现在串口流里`,
      )
    }
    // 先构造引擎校验配置合法性，再进行任何写入
    const engine = new CameraCalibration(config, this.host.now())
    this.state.config = { ...config }
    // 恢复基准 = 表单 height/fov + 设备回读的 thetaOffset（自动同步前的设备原值，同通道可精确核对）
    this.state.originalParams = `${config.height},${config.fov},${readback.thetaOffset}`
    this.state.lastSentParams = null

    // OFFSET 基线自动同步：设备 thetaOffset 与表单初值不一致时无需拒绝，
    // 直接把表单值下发并回读核对，再从初值开始搜索
    if (Math.abs(readback.thetaOffset - config.initialOffset) > READBACK_EPSILON) {
      const content = `${config.height},${config.fov},${config.initialOffset}`
      this.ensureControlLink()
      this.writing = true
      this.state.lastSentParams = content
      this.emit()
      try {
        await this.writeWithTimeout(content)
        await this.confirmWritten(content)
      } catch (error) {
        throw new Error(`OFFSET 基线同步失败，未启动标定：${errorMessage(error)}`)
      } finally {
        this.writing = false
        this.emit()
      }
    }

    this.engine = engine
    this.parser.reset()
    this.finalized = false
    this.finalizing = false
    return this.emit()
  }

  public receive(data: string): void {
    if (!this.state.observing) return
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
      try { this.ensureControlLink() } catch (error) { this.engine.fail(String(error)) }
      this.engine.tick(this.host.now())
      this.emit()
      return
    }
    if (this.engine && !this.finalized && !this.finalizing) void this.finalize()
  }

  public stop(reason = '已停止；正在恢复标定前参数'): CameraCalibrationSnapshot {
    if (this.engine && isCalibrationRunning(this.engine.snapshot().phase)) this.engine.stop(reason)
    this.emit()
    if (this.engine && !this.finalized && !this.finalizing) void this.finalize()
    return this.snapshot()
  }

  public close(owner?: number): CameraCalibrationSnapshot {
    if (owner !== undefined && owner !== this.owner) return this.snapshot()
    this.stop('观测已结束；正在恢复现场')
    this.state.observing = false
    this.owner = undefined
    this.parser.reset()
    if (!this.engine) { this.state.phase = 'stopped'; this.state.reason = '已结束观测订阅' }
    this.emit()
    if (this.engine && !this.finalized && !this.finalizing) void this.finalizeThenTeardown()
    else if (!this.finalizing) void this.teardownChannelQuietly()
    return this.snapshot()
  }

  /** 窗口关闭/人为停止观测：参数恢复 → 拆除测量通道并核实现场 */
  private async finalizeThenTeardown(): Promise<void> {
    await this.finalize()
    await this.teardownChannelQuietly()
  }

  /** 无标定引擎可终结时(纯观测/已终结)也要拆除测量通道, 避免陈旧通道阻塞下次观测 */
  private async teardownChannelQuietly(): Promise<void> {
    try {
      const teardown = await this.host.stopMeasurement()
      if (this.state.ssh) {
        this.state.ssh = {
          ...this.state.ssh, state: 'stopped',
          detail: teardown.straceCleared && teardown.tracerPidZero
            ? '通道已拆除'
            : `通道拆除核查异常: TracerPid=${teardown.tracerPid}`,
        }
      }
      const base = this.state.recovery
      this.state.recovery = {
        straceCleared: teardown.straceCleared,
        tracerPidZero: teardown.tracerPidZero,
        paramsVerified: base?.paramsVerified ?? false,
        restored: base?.restored ?? false,
        expected: base?.expected ?? '',
        readback: base?.readback ?? '',
        detail:
          teardown.straceCleared && teardown.tracerPidZero
            ? (base?.detail ?? '观测已停止，现场已核查')
            : `观测已停止；设备侧核查异常: TracerPid=${teardown.tracerPid}`,
        pendingChecks: false,
      }
      this.emit()
    } catch { /* 拆除失败不阻塞, 设备端 timeout 兜底 */ }
  }

  /** 控制链路断开/更换时调用：停止标定并尝试恢复参数，观测（SSH 测量通道）保持运行 */
  public stopForControlLinkChange(reason: string): CameraCalibrationSnapshot {
    this.stop(reason)
    this.state.reason = reason
    this.emit()
    return this.snapshot()
  }

  /** 测量通道状态回报（来自 SSH 通道回调） */
  public measurementState(state: 'connecting' | 'streaming' | 'stopped', detail: string): void {
    if (!this.state.ssh) return
    this.state.ssh = { ...this.state.ssh, state, detail }
    this.emit()
  }

  /** 测量通道故障：快速失败并进入自动恢复 */
  public measurementFailed(message: string): void {
    if (!this.state.ssh) return
    this.state.ssh = { ...this.state.ssh, state: 'error', detail: message }
    this.engine?.fail(`测量通道故障：${message}`)
    this.emit()
    if (this.engine && !isCalibrationRunning(this.engine.snapshot().phase) && !this.finalized && !this.finalizing) {
      void this.finalize()
    }
  }

  public async restore(owner: number): Promise<CameraCalibrationSnapshot> {
    this.requireOwner(owner)
    if (this.writing || this.manualWrites || isCalibrationRunning(this.snapshot().phase)) throw new Error('请先停止标定并等待发送结束')
    if (!this.originalSnapshot || !this.state.originalParams) throw new Error('没有可恢复的标定前参数')
    const readback = await this.restoreParamsAndVerify()
    this.state.recovery = {
      straceCleared: this.state.recovery?.straceCleared ?? true,
      tracerPidZero: this.state.recovery?.tracerPidZero ?? true,
      paramsVerified: true,
      restored: true,
      expected: this.state.originalParams,
      readback: readback.raw,
      detail: '参数已恢复并经 read_params 回读核对',
      pendingChecks: this.state.recovery?.pendingChecks ?? true,
    }
    this.emit()
    return this.snapshot()
  }

  /** 标定结束后的现场恢复：拆测量通道 + 失败/停止时回写原参数并核对 */
  private async finalize(): Promise<void> {
    const engine = this.engine
    if (!engine || this.finalizing) return
    this.finalizing = true
    const phase = engine.snapshot().phase
    // 观测持续运行(测量通道不拆除): strace 现场核查延后到「停止观测」时执行
    const recovery: CameraCalibrationRecovery = {
      straceCleared: true, tracerPidZero: true, paramsVerified: false, restored: false,
      expected: this.state.originalParams ?? '', readback: '', detail: '',
      pendingChecks: true,
    }

    if (phase === 'failed' || phase === 'stopped') {
      try {
        const readback = await this.restoreParamsAndVerify()
        recovery.paramsVerified = true
        recovery.restored = true
        recovery.readback = readback.raw
        recovery.detail = '已恢复标定前参数并回读核对'
      } catch (error) {
        recovery.paramsVerified = false
        recovery.detail = `参数恢复失败，请人工核实：${errorMessage(error)}`
      }
    } else if (phase === 'succeeded') {
      try {
        const readback = await this.host.readbackParams()
        recovery.readback = readback.raw
        const applied = parseWrittenContent(this.state.lastSentParams)
        recovery.paramsVerified = Boolean(applied &&
          Math.abs(readback.thetaOffset - applied.thetaOffset) <= READBACK_EPSILON)
        recovery.detail = recovery.paramsVerified
          ? '标定参数已保持并回读核对'
          : '设备参数与标定结果不一致，请人工核实'
      } catch (error) {
        recovery.detail = `标定成功，但回读核对失败：${errorMessage(error)}`
      }
    }

    this.state.recovery = recovery
    this.finalized = true
    this.finalizing = false
    this.emit()
  }

  private async restoreParamsAndVerify(): Promise<CameraParamSnapshot> {
    const content = this.state.originalParams
    if (!content) throw new Error('没有可恢复的原始参数')
    this.ensureControlLink()
    this.writing = true
    this.state.lastSentParams = content
    this.emit()
    try {
      await this.writeWithTimeout(content)
      return await this.confirmWritten(content)
    } finally { this.writing = false; this.emit() }
  }

  private async sendCandidate(offset: number): Promise<void> {
    const engine = this.engine
    const config = this.state.config
    if (!engine || !config || this.writing || this.manualWrites || engine.snapshot().phase !== 'writing') return
    this.writing = true
    const content = `${config.height},${config.fov},${offset}`
    try {
      this.ensureControlLink()
      this.state.lastSentParams = content
      this.emit()
      await this.writeWithTimeout(content)
      const readback = await this.confirmWritten(content)
      if (engine.snapshot().phase === 'writing') engine.written(offset, this.host.now())
      else if (isCalibrationRunning(engine.snapshot().phase)) {
        engine.fail('发送期间观测失效，参数可能已改变，请核实后重新开始')
      }
      void readback
    } catch (error) {
      engine.fail(`参数发送或回读未确认，停止自动写入：${errorMessage(error)}`)
    } finally { this.writing = false; this.emit() }
  }

  /** 写入后经 read_params 核对设备已应用目标值 */
  private async confirmWritten(content: string): Promise<CameraParamSnapshot> {
    const expected = parseWrittenContent(content)
    if (!expected) throw new Error(`写入内容无法解析：${content}`)
    const readback = await this.host.readbackParams()
    if (Math.abs(readback.thetaOffset - expected.thetaOffset) > READBACK_EPSILON ||
      Math.abs(readback.height - expected.height) > READBACK_EPSILON) {
      throw new Error(`回读不一致：期望 offset=${expected.thetaOffset}，设备回报 ${readback.raw}`)
    }
    return readback
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

  private ensureControlLink(): void {
    if (!this.host.tcpTarget()) throw new Error('相机控制连接已断开或改变')
  }

  private requireOwner(owner: number): void {
    if (this.owner !== owner) throw new Error('请在启动观测的窗口操作')
  }

  private emit(): CameraCalibrationSnapshot {
    const state = this.snapshot()
    this.publish(state)
    return state
  }
}

function parseWrittenContent(content: string | null): { height: number; thetaOffset: number } | undefined {
  if (!content) return undefined
  const parts = content.split(',')
  if (parts.length !== 3) return undefined
  const height = Number(parts[0])
  const thetaOffset = Number(parts[2])
  if (!Number.isFinite(height) || !Number.isFinite(thetaOffset)) return undefined
  return { height, thetaOffset }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
