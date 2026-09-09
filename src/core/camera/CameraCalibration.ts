import {
  createCalibrationProgress,
  isCalibrationRunning,
  type CameraCalibrationConfig,
  type CameraCalibrationProgress,
  type InssegFrame,
} from './CameraCalibrationTypes'

const EPSILON = 1e-9

export function validateCalibrationConfig(c: CameraCalibrationConfig): void {
  const numbers = [c.height, c.fov, c.initialOffset, c.minOffset, c.maxOffset, c.step, c.minStep,
    c.nearDistance, c.farDistance, c.biasMinCm, c.biasMaxCm, c.personClassId, c.sampleCount,
    c.windowMs, c.maxSpreadM, c.settleMs, c.staleMs, c.maxWrites, c.maxDurationMs]
  if (!numbers.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error('请填写所有数值，包括人工确认的 OFFSET 安全范围和人形类别编号')
  }
  if (!(c.height > 0 && c.fov > 0 && c.fov < 180 && c.minOffset < c.maxOffset &&
    c.maxOffset < 0 && c.initialOffset >= c.minOffset && c.initialOffset <= c.maxOffset)) {
    throw new Error('高度、FOV 或 OFFSET 范围无效；OFFSET 必须为负且初值在安全范围内')
  }
  if (!(c.minStep > 0 && c.step >= c.minStep && c.step <= c.maxOffset - c.minOffset)) {
    throw new Error('调参步长无效')
  }
  if (!(c.nearDistance > 0 && c.farDistance > c.nearDistance &&
    c.biasMinCm <= c.biasMaxCm && c.nearDistance + c.biasMinCm / 100 > 0)) {
    throw new Error('参考距离或偏差区间无效')
  }
  if (!['left', 'right'].includes(c.nearSide) || !Number.isSafeInteger(c.personClassId) || c.personClassId < 0) {
    throw new Error('请确认海报左右对应关系和人形类别编号')
  }
  if (!Number.isInteger(c.sampleCount) || c.sampleCount < 3 || c.sampleCount > 1000 ||
    c.windowMs < 200 || c.windowMs > 10000 || c.maxSpreadM <= 0 || c.maxSpreadM > 1 ||
    c.settleMs < 500 || c.settleMs > 10000 || c.staleMs < 500 || c.staleMs > 10000 ||
    !Number.isInteger(c.maxWrites) || c.maxWrites < 1 || c.maxWrites > 30 ||
    c.maxDurationMs < 1000 || c.maxDurationMs > 120000) {
    throw new Error('采样或运行限制无效（最多 30 次写入、120 秒）')
  }
  if (c.fullCountConfirmed !== true || c.initialParamsConfirmed !== true || c.persistentWritesConfirmed !== true) {
    throw new Error('必须确认完整人数、实际原参数及永久写入/无回读限制后才能启动')
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export class CameraCalibration {
  private readonly config: CameraCalibrationConfig
  private progress: CameraCalibrationProgress
  private readonly startedAt: number
  private lastValidAt: number
  private lastIndex: number | undefined
  private identity: string | undefined
  private samples: Array<{ at: number; near: number; far: number }> = []
  private verifying = false
  private settleUntil = 0
  private pending: number | undefined
  private lower: number | undefined
  private upper: number | undefined

  public constructor(config: CameraCalibrationConfig, now: number) {
    validateCalibrationConfig(config)
    this.config = { ...config }
    this.startedAt = now
    this.lastValidAt = now
    this.progress = { ...createCalibrationProgress(), phase: 'sampling', offset: config.initialOffset,
      reason: '等待两个稳定目标；当前参数来自人工确认，未由设备回读' }
  }

  public snapshot(): CameraCalibrationProgress {
    return structuredClone(this.progress)
  }

  public push(frame: InssegFrame, now: number): number | undefined {
    this.tick(now)
    if (!isCalibrationRunning(this.progress.phase)) return
    this.progress.reportedCount = frame.targets.length
    if (this.lastIndex !== undefined && frame.index <= this.lastIndex) {
      this.invalidate('重复或倒序报文，等待新的连续数据', now)
      return
    }
    if (this.lastIndex !== undefined && frame.index !== this.lastIndex + 1) {
      this.invalidate('报文序号不连续，重新采样', now)
    }
    this.lastIndex = frame.index
    if (frame.targets.length !== 2 || frame.targets.some((t) => t.classId !== this.config.personClassId)) {
      this.invalidate('必须恰好上报两个人形目标，已暂停调参', now)
      return
    }
    const targets = [...frame.targets].sort((a, b) => (a.left + a.right) - (b.left + b.right))
    if (targets[0].trackId === targets[1].trackId ||
      targets[0].left + targets[0].right === targets[1].left + targets[1].right ||
      targets.some((t) => !Number.isFinite(t.distance) || t.distance <= 0)) {
      this.invalidate('目标身份或左右位置不明确', now)
      return
    }
    const identity = targets.map((t) => t.trackId).join(':')
    if (this.identity !== undefined && identity !== this.identity) this.invalidate('目标发生变化，重新采样', now)
    this.identity = identity
    this.lastValidAt = now
    if (this.pending !== undefined || now < this.settleUntil) return
    const [near, far] = this.config.nearSide === 'left' ? targets : targets.reverse()
    this.progress.phase = this.verifying ? 'verifying' : 'sampling'
    this.progress.reason = this.verifying ? '区间合格，正在独立复验' : '正在采集稳定双目标样本'
    this.samples.push({ at: now, near: near.distance, far: far.distance })
    if (this.samples.length > 2000) this.samples.shift()
    this.progress.sampleCount = this.samples.length
    if (this.samples.length < this.config.sampleCount || now - this.samples[0].at < this.config.windowMs) return
    return this.evaluate(now)
  }

  public tick(now: number): void {
    if (!isCalibrationRunning(this.progress.phase)) return
    if (now - this.startedAt >= this.config.maxDurationMs) this.fail('达到最大标定时长')
    else if (now - this.lastValidAt >= this.config.staleMs) this.invalidate('测量数据超时，已暂停调参', now)
  }

  public invalidate(reason: string, _now: number): void {
    if (!isCalibrationRunning(this.progress.phase)) return
    this.samples = []
    this.verifying = false
    this.progress.sampleCount = 0
    this.progress.distances = null
    this.progress.spreads = null
    this.pending = undefined
    this.progress.phase = 'paused'
    this.progress.reason = reason
  }

  public written(offset: number, now: number): void {
    if (this.pending !== offset || !isCalibrationRunning(this.progress.phase)) return
    this.pending = undefined
    this.progress.offset = offset
    this.progress.writeCount++
    this.samples = []
    this.progress.sampleCount = 0
    this.progress.phase = 'settling'
    this.progress.reason = '参数已发送，等待稳定（未回读确认）'
    this.settleUntil = now + this.config.settleMs
  }

  public fail(reason: string): void {
    this.finish('failed', reason)
  }

  public stop(reason = '已停止；已发送参数不会自动撤销'): void {
    this.finish('stopped', reason)
  }

  private evaluate(now: number): number | undefined {
    const nearSamples = this.samples.map((s) => s.near)
    const farSamples = this.samples.map((s) => s.far)
    const distances: [number, number] = [median(nearSamples), median(farSamples)]
    const spreads: [number, number] = [Math.max(...nearSamples) - Math.min(...nearSamples),
      Math.max(...farSamples) - Math.min(...farSamples)]
    this.samples = []
    this.progress.sampleCount = 0
    if (spreads.some((spread) => spread > this.config.maxSpreadM + EPSILON)) {
      this.invalidate('测距波动过大，重新采样', now)
      return
    }
    this.progress.distances = distances
    this.progress.spreads = spreads
    const errors = [distances[0] - this.config.nearDistance, distances[1] - this.config.farDistance]
    const tooFar = errors.some((e) => e > this.config.biasMaxCm / 100 + EPSILON)
    const tooNear = errors.some((e) => e < this.config.biasMinCm / 100 - EPSILON)
    const accepted = !tooFar && !tooNear
    const offset = this.progress.offset!
    const previous = this.progress.history.at(-1)
    this.progress.history.push({ offset, near: distances[0], far: distances[1],
      nearErrorCm: errors[0] * 100, farErrorCm: errors[1] * 100, accepted })
    if (previous && offset !== previous.offset) {
      const sign = Math.sign(offset - previous.offset)
      if (sign * (distances[0] - previous.near) < -this.config.maxSpreadM ||
        sign * (distances[1] - previous.far) < -this.config.maxSpreadM) {
        this.fail('测距变化与预期调整方向相反，请检查目标及参数定义')
        return
      }
    }
    if (accepted) {
      if (this.verifying) this.finish('succeeded', '两个距离均通过独立窗口复验；参数未回读')
      else {
        this.verifying = true
        this.progress.phase = 'verifying'
        this.progress.reason = '两个距离已合格，保持参数并独立复验'
      }
      return
    }
    this.verifying = false
    if (tooFar && tooNear) {
      this.fail('两个目标分别超出相反边界，单一 OFFSET 无共同单调解')
      return
    }
    if (this.progress.writeCount >= this.config.maxWrites) {
      this.fail('达到最大参数写入次数，未满足双目标容差')
      return
    }
    if (tooFar) this.upper = offset
    else this.lower = offset
    let candidate = this.lower !== undefined && this.upper !== undefined
      ? (this.lower + this.upper) / 2
      : offset + (tooFar ? -this.config.step : this.config.step)
    candidate = Number(Math.max(this.config.minOffset, Math.min(this.config.maxOffset, candidate)).toFixed(6))
    if (Math.abs(candidate - offset) < this.config.minStep - EPSILON ||
      this.progress.history.some((entry) => Math.abs(entry.offset - candidate) < EPSILON)) {
      this.fail('达到参数边界或最小步长，未找到共同合格参数')
      return
    }
    this.pending = candidate
    this.progress.phase = 'writing'
    this.progress.reason = '准备发送下一组持久参数'
    return candidate
  }

  private finish(phase: 'failed' | 'stopped' | 'succeeded', reason: string): void {
    this.progress.phase = phase
    this.progress.reason = reason
    this.pending = undefined
    this.samples = []
    this.verifying = false
    this.progress.sampleCount = 0
  }
}