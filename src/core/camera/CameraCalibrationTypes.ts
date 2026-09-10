export interface InssegTarget {
  classId: number
  trackId: number
  left: number
  top: number
  right: number
  bottom: number
  distance: number
  azimuth: number
}

export interface InssegFrame {
  timestamp: string
  index: number
  pictureIndex: number
  targets: InssegTarget[]
}

export type InssegParseResult =
  | { type: 'frame'; frame: InssegFrame }
  | { type: 'error'; message: string }

/** 单个目标（人员）的参考距离与合格区间 */
export interface CameraCalibrationTargetConfig {
  /** 参考距离（m，布置距离，不做斜距换算） */
  distance: number
  /** 允许偏差下限（cm，测量值 - 参考距离） */
  biasMinCm: number
  /** 允许偏差上限（cm） */
  biasMaxCm: number
}

export interface CameraCalibrationConfig {
  height: number
  fov: number
  initialOffset: number
  minOffset: number
  maxOffset: number
  step: number
  minStep: number
  /** 目标配置（1~2 个）；双目标时按 nearSide 把画面左/右目标对应到数组序号 */
  targets: CameraCalibrationTargetConfig[]
  /** 双目标时 targets[0] 位于画面哪一侧 */
  nearSide: 'left' | 'right'
  personClassId: number
  sampleCount: number
  windowMs: number
  maxSpreadM: number
  settleMs: number
  staleMs: number
  maxWrites: number
  maxDurationMs: number
}

export type CameraCalibrationPhase =
  | 'idle'
  | 'observing'
  | 'sampling'
  | 'verifying'
  | 'writing'
  | 'settling'
  | 'paused'
  | 'succeeded'
  | 'stopped'
  | 'failed'

export interface CameraCalibrationMeasurement {
  offset: number
  /** 各目标的距离中位数（序号与 config.targets 对应） */
  distances: number[]
  /** 各目标的偏差（cm，测量 - 参考） */
  errorsCm: number[]
  accepted: boolean
  /** 该窗口是否为复验窗（false = 初验采样窗） */
  verification: boolean
}

export interface CameraCalibrationProgress {
  phase: CameraCalibrationPhase
  reason: string
  offset: number | null
  writeCount: number
  sampleCount: number
  reportedCount: number | null
  distances: number[] | null
  spreads: number[] | null
  history: CameraCalibrationMeasurement[]
}

export interface CameraCalibrationSshInfo {
  host: string
  port: number
  username: string
  state: 'connecting' | 'streaming' | 'stopped' | 'error'
  detail: string
}

export interface CameraCalibrationRecovery {
  /** 设备侧无 strace 残留进程 */
  straceCleared: boolean
  /** appMain 的 TracerPid 已归零 */
  tracerPidZero: boolean
  /** 参数已回读核对 */
  paramsVerified: boolean
  /** 是否执行了回写原参数（标定成功时为 false，参数保持标定结果） */
  restored: boolean
  /** 期望参数（标定前记录） */
  expected: string
  /** 设备回读的原始应答 */
  readback: string
  detail: string
  /** true = strace/TracerPid 核查待「停止观测」时执行（观测仍在运行） */
  pendingChecks: boolean
}

export interface CameraCalibrationSnapshot extends CameraCalibrationProgress {
  observing: boolean
  busy: boolean
  sourceHost: string | null
  config: CameraCalibrationConfig | null
  lastFrame: InssegFrame | null
  validFrames: number
  invalidFrames: number
  rawLines: string[]
  originalParams: string | null
  lastSentParams: string | null
  ssh: CameraCalibrationSshInfo | null
  recovery: CameraCalibrationRecovery | null
}


export function isCalibrationRunning(phase: CameraCalibrationPhase): boolean {
  return ['sampling', 'verifying', 'writing', 'settling', 'paused'].includes(phase)
}

/** 规格默认值：参数模板 0.55,62.292,-21.5；默认单目标（人员右侧 1.2 m），允许偏差 -2~+2 cm。
 *  双目标（1.2 m + 2.0 m）暂不支持：UI 下拉框已禁用该选项，引擎逻辑保留待后续启用 */
export const DEFAULT_CALIBRATION_CONFIG: Readonly<CameraCalibrationConfig> = Object.freeze({
  height: 0.55,
  fov: 62.292,
  initialOffset: -21.5,
  minOffset: -30,
  maxOffset: -10,
  step: 1,
  minStep: 0.2,
  targets: [{ distance: 1.2, biasMinCm: -2, biasMaxCm: 2 }],
  nearSide: 'right',
  personClassId: 0,
  sampleCount: 12,
  windowMs: 2000,
  maxSpreadM: 0.05,
  settleMs: 2000,
  staleMs: 3000,
  maxWrites: 12,
  maxDurationMs: 90000,
})

export function createCalibrationProgress(): CameraCalibrationProgress {
  return {
    phase: 'idle',
    reason: '',
    offset: null,
    writeCount: 0,
    sampleCount: 0,
    reportedCount: null,
    distances: null,
    spreads: null,
    history: [],
  }
}

export function createCalibrationSnapshot(): CameraCalibrationSnapshot {
  return {
    ...createCalibrationProgress(),
    observing: false,
    busy: false,
    sourceHost: null,
    config: null,
    lastFrame: null,
    validFrames: 0,
    invalidFrames: 0,
    rawLines: [],
    originalParams: null,
    lastSentParams: null,
    ssh: null,
    recovery: null,
  }
}
