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
    c.personClassId, c.sampleCount,
    c.windowMs, c.maxSpreadM, c.settleMs, c.staleMs, c.maxWrites, c.maxDurationMs]
  if (!numbers.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error('请填写所有数值，包括人工确认的 OFFSET 安全范围和人形类别编号')
  }
  if (!Array.isArray(c.targets) || c.targets.length < 1 || c.targets.length > 2) {
    throw new Error('目标数目必须为 1 或 2，请为每个目标填写参考距离与合格区间')
  }
  for (const target of c.targets) {
    const targetNumbers = [target.distance, target.biasMinCm, target.biasMaxCm]
    if (!targetNumbers.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      throw new Error('请为每个目标填写参考距离与偏差区间')
    }
    if (!(target.distance > 0) || !(target.biasMinCm <= target.biasMaxCm) ||
      target.distance + target.biasMinCm / 100 <= 0) {
      throw new Error('目标的参考距离或偏差区间无效')
    }
  }
  if (!(c.height > 0 && c.fov > 0 && c.fov < 180 && c.minOffset < c.maxOffset &&
    c.maxOffset < 0 && c.initialOffset >= c.minOffset && c.initialOffset <= c.maxOffset)) {
    throw new Error('高度、FOV 或 OFFSET 范围无效；OFFSET 必须为负且初值在安全范围内')
  }
  if (!(c.minStep > 0 && c.step >= c.minStep && c.step <= c.maxOffset - c.minOffset)) {
    throw new Error('调参步长无效')
  }
  if (!['left', 'right'].includes(c.nearSide) || !Number.isSafeInteger(c.personClassId) || c.personClassId < 0) {
    throw new Error('请确认目标方位和人形类别编号')
  }
  if (!Number.isInteger(c.sampleCount) || c.sampleCount < 3 || c.sampleCount > 1000 ||
    c.windowMs < 200 || c.windowMs > 10000 || c.maxSpreadM <= 0 || c.maxSpreadM > 1 ||
    c.settleMs < 500 || c.settleMs > 10000 || c.staleMs < 500 || c.staleMs > 10000 ||
    !Number.isInteger(c.maxWrites) || c.maxWrites < 1 || c.maxWrites > 30 ||
    c.maxDurationMs < 1000 || c.maxDurationMs > 120000) {
    throw new Error('采样或运行限制无效（最多 30 次写入、120 秒）')
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** 按画面左右把帧内目标对应到配置序号（targets[0] 在 nearSide 一侧） */
function assignTargets(frame: InssegFrame, config: CameraCalibrationConfig): InssegFrame['targets'] {
  const sorted = [...frame.targets].sort((a, b) => (a.left + a.right) - (b.left + b.right))
  return config.nearSide === 'left' ? sorted : sorted.reverse()
}

export class CameraCalibration {
  private readonly config: CameraCalibrationConfig
  private progress: CameraCalibrationProgress
  private readonly startedAt: number
  private lastValidAt: number
  private lastIndex: number | undefined
  private identity: string | undefined
  private samples: Array<{ at: number; distances: number[] }> = []
  private verifying = false
  private settleUntil = 0
  private pending: number | undefined
  private lower: number | undefined
  private upper: number | undefined

  public constructor(config: CameraCalibrationConfig, now: number) {
    validateCalibrationConfig(config)
    this.config = { ...config, targets: config.targets.map((target) => ({ ...target })) }
    this.startedAt = now
    this.lastValidAt = now
    this.progress = { ...createCalibrationProgress(), phase: 'sampling', offset: config.initialOffset,
      reason: `等待稳定的 ${config.targets.length} 个目标；启动参数已经 read_params 回读核对` }
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
    const expected = this.config.targets.length
    if (frame.targets.length !== expected ||
      frame.targets.some((t) => t.classId !== this.config.personClassId)) {
      this.invalidate(`必须恰好上报 ${expected} 个指定类别的人形目标，已暂停调参`, now)
      return
    }
    const assigned = assignTargets(frame, this.config)
    if (assigned.some((t) => !Number.isFinite(t.distance) || t.distance <= 0) ||
      (expected === 2 && (assigned[0].trackId === assigned[1].trackId ||
        assigned[0].left + assigned[0].right === assigned[1].left + assigned[1].right))) {
      this.invalidate('目标身份或左右位置不明确', now)
      return
    }
    const identity = assigned.map((t) => t.trackId).join(':')
    if (this.identity !== undefined && identity !== this.identity) this.invalidate('目标发生变化，重新采样', now)
    this.identity = identity
    this.lastValidAt = now
    if (this.pending !== undefined || now < this.settleUntil) return
    this.progress.phase = this.verifying ? 'verifying' : 'sampling'
    this.progress.reason = this.verifying
      ? '区间合格，正在独立复验'
      : `正在采集稳定的 ${expected} 个目标样本`
    this.samples.push({ at: now, distances: assigned.map((t) => t.distance) })
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
    this.progress.reason = '参数已写入并经回读核对，等待测量稳定'
    this.settleUntil = now + this.config.settleMs
  }

  public fail(reason: string): void {
    this.finish('failed', reason)
  }

  public stop(reason = '已停止；正在恢复标定前参数'): void {
    this.finish('stopped', reason)
  }

  private evaluate(now: number): number | undefined {
    const perTarget = this.config.targets.map((_, index) =>
      this.samples.map((sample) => sample.distances[index]))
    const distances = perTarget.map((values) => median(values))
    const spreads = perTarget.map((values) => Math.max(...values) - Math.min(...values))
    this.samples = []
    this.progress.sampleCount = 0
    if (spreads.some((spread) => spread > this.config.maxSpreadM + EPSILON)) {
      this.invalidate('测距波动过大，重新采样', now)
      return
    }
    this.progress.distances = distances
    this.progress.spreads = spreads
    const errorsCm = distances.map((measured, index) =>
      (measured - this.config.targets[index].distance) * 100)
    const tooFarList = errorsCm.map((error, index) =>
      error > this.config.targets[index].biasMaxCm + EPSILON)
    const tooNearList = errorsCm.map((error, index) =>
      error < this.config.targets[index].biasMinCm - EPSILON)
    const accepted = !tooFarList.some(Boolean) && !tooNearList.some(Boolean)
    const offset = this.progress.offset!
    const previous = this.progress.history.at(-1)
    // 窗口阶段以评估时刻为准：verifying=true 说明本窗是复验窗，否则是初验采样窗
    const isVerifyWindow = this.verifying
    this.progress.history.push({ offset, distances, errorsCm, accepted, verification: isVerifyWindow })
    if (previous && offset !== previous.offset) {
      const sign = Math.sign(offset - previous.offset)
      const diverged = distances.some((measured, index) =>
        sign * (measured - previous.distances[index]) < -this.config.maxSpreadM)
      if (diverged) {
        this.fail('测距变化与预期调整方向相反，请检查目标及参数定义')
        return
      }
    }
    if (accepted) {
      if (this.verifying) this.finish('succeeded', '所有目标距离均通过独立窗口复验；标定参数保持并已回读核对')
      else {
        this.verifying = true
        this.progress.phase = 'verifying'
        this.progress.reason = '所有目标距离已合格，保持参数并独立复验'
      }
      return
    }
    this.verifying = false
    const tooFar = tooFarList.some(Boolean)
    const tooNear = tooNearList.some(Boolean)
    if (tooFar && tooNear) {
      this.fail('部分目标偏远而部分偏近，单一 OFFSET 无共同单调解')
      return
    }
    if (this.progress.writeCount >= this.config.maxWrites) {
      this.fail('达到最大参数写入次数，未满足全部目标的容差')
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
