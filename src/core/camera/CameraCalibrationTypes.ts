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

export interface CameraCalibrationConfig {
  height: number
  fov: number
  initialOffset: number
  minOffset: number
  maxOffset: number
  step: number
  minStep: number
  nearDistance: number
  farDistance: number
  biasMinCm: number
  biasMaxCm: number
  nearSide: 'left' | 'right'
  personClassId: number
  sampleCount: number
  windowMs: number
  maxSpreadM: number
  settleMs: number
  staleMs: number
  maxWrites: number
  maxDurationMs: number
  fullCountConfirmed: boolean
  initialParamsConfirmed: boolean
  persistentWritesConfirmed: boolean
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
  near: number
  far: number
  nearErrorCm: number
  farErrorCm: number
  accepted: boolean
}

export interface CameraCalibrationProgress {
  phase: CameraCalibrationPhase
  reason: string
  offset: number | null
  writeCount: number
  sampleCount: number
  reportedCount: number | null
  distances: [number, number] | null
  spreads: [number, number] | null
  history: CameraCalibrationMeasurement[]
}

export interface CameraCalibrationSnapshot extends CameraCalibrationProgress {
  observing: boolean
  busy: boolean
  sourceSessionId: string | null
  sourceHost: string | null
  config: CameraCalibrationConfig | null
  lastFrame: InssegFrame | null
  validFrames: number
  invalidFrames: number
  rawLines: string[]
  originalParams: string | null
  lastSentParams: string | null
}


export function isCalibrationRunning(phase: CameraCalibrationPhase): boolean {
  return ['sampling', 'verifying', 'writing', 'settling', 'paused'].includes(phase)
}

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
    sourceSessionId: null,
    sourceHost: null,
    config: null,
    lastFrame: null,
    validFrames: 0,
    invalidFrames: 0,
    rawLines: [],
    originalParams: null,
    lastSentParams: null,
  }
}
