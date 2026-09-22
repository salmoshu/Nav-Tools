// GNSS-Raw 数据模型：RTCM 流解码事件与列式数据集类型。
// 事件接口镜像 robo-gnss-wasm（Robo-GNSS，rtklibexplorer/RTKLIB demo5 分支）的
// index.d.ts —— 仅 Worker 边界模块直接引用 wasm 包，其余模块只依赖本文件，
// 这样分析/数据集逻辑可以在无 WASM 环境下单测。

/** 星座 id（与 robo-gnss-wasm 的 SYS 一致） */
export const GNSS_SYS = Object.freeze({
  NONE: 0,
  GPS: 1,
  GLO: 2,
  GAL: 3,
  BDS: 4,
  QZS: 5,
  SBS: 6,
  IRN: 7,
} as const)

export const GNSS_SYS_NAME: readonly string[] = ['—', 'GPS', 'GLO', 'GAL', 'BDS', 'QZS', 'SBS', 'IRN']

export const GNSS_SYS_COLOR: readonly string[] = [
  '#9ca3af',
  '#22c55e', // GPS 绿
  '#ef4444', // GLO 红
  '#3b82f6', // GAL 蓝
  '#f59e0b', // BDS 琥珀
  '#a855f7', // QZS 紫
  '#14b8a6', // SBS 青
  '#84cc16', // IRN 黄绿
]

/** 频点槽位（每星最多 3 个）的观测值 */
export interface GnssFreqObs {
  /** 观测码 id（0 = 无），名称经 codeName(code) 查询 */
  code: number
  /** 失锁指示 */
  lli: number
  /** 载噪比 dBHz（0 = 无） */
  snr: number
  /** 多普勒 Hz */
  d: number
  /** 伪距 m（0 = 无） */
  p: number
  /** 载波相位 周（0 = 无） */
  l: number
}

export interface GnssEpochSat {
  /** RTKLIB 内部卫星号（稳定标识） */
  sat: number
  /** GNSS_SYS id */
  sys: number
  prn: number
  /** GLONASS 频点通道（-7..+6，-8 未知，0 不适用） */
  fcn: number
  obs: GnssFreqObs[]
}

export interface GnssEpochEvent {
  kind: 'epoch'
  /** unix 秒（UTC） */
  timeS: number
  /** 历元标志（0 = 正常） */
  flag: number
  sats: GnssEpochSat[]
}

export interface GnssEphEvent {
  kind: 'eph'
  msgType: number
  sys: number
  isGlo: boolean
  sat: number
  prn: number
  iode: number
  iodc: number
  week: number
  /** unix 秒 */
  toeS: number
  tocS: number
  /** 收到时的流时间（unix 秒，0 = 未知） */
  recvS: number
  /** 拟合区间 h（GLO 为 age） */
  fitH: number
  /** 钟差 af0 s（GLO: taun） */
  f0: number
  /** 钟漂 af1 s/s（GLO: gamn） */
  f1: number
}

export interface GnssStaEvent {
  kind: 'sta'
  msgType: number
  staid: number
  /** ECEF m */
  pos: [number, number, number]
  hgt: number
  del: [number, number, number]
}

export interface GnssNmeaEvent {
  kind: 'nmea'
  text: string
}

export type GnssEvent = GnssEpochEvent | GnssEphEvent | GnssStaEvent | GnssNmeaEvent

export interface GnssStreamStats {
  bytes: number
  framesOk: number
  framesCrcErr: number
  nmeaLines: number
  epochs: number
  ephEvents: number
  staEvents: number
  /** CRC 正确但译码失败的帧数（如 GLO 字符串译码失败） */
  decodeFail: number
  /** 稀疏表：RTCM 报文类型 -> 成功帧数 */
  msgOk: Record<number, number>
  /** 稀疏表：RTCM 报文类型 -> 失败帧数 */
  msgFail: Record<number, number>
}

// —— 列式数据集（Worker 构建，面板与分析函数消费） ——

/** 单星单频点时间序列（与 series.times 对齐；NaN 表示该历元缺失） */
export interface GnssSlotSeries {
  /** 该槽位出现过的观测码 id（首个非零值，0 = 从未使用） */
  code: number
  /** 载波频率 Hz（由 codeFreq 查询；0 = 未知） */
  freqHz: number
  snr: number[]
  /** 伪距 m */
  p: number[]
  /** 载波相位 周 */
  l: number[]
}

export interface GnssSatSeries {
  sys: number
  prn: number
  /** 该星出现历元的时间轴（unix 秒） */
  times: number[]
  /** 最多 3 个频点槽位 */
  slots: GnssSlotSeries[]
}

/** 每历元按星座计数的行（索引 = sysid 0..7） */
export type GnssEpochSysCounts = number[]

export interface GnssRawDataset {
  /** 全部历元时间轴（unix 秒） */
  epochTimes: number[]
  epochFlags: number[]
  /** 与 epochTimes 对齐的每星座卫星数 */
  epochSysCounts: GnssEpochSysCounts[]
  /** key = `${sys}:${prn}` */
  sats: Record<string, GnssSatSeries>
  ephEvents: GnssEphEvent[]
  staEvents: GnssStaEvent[]
  stats: GnssStreamStats | null
}

export function emptyGnssRawDataset(): GnssRawDataset {
  return {
    epochTimes: [],
    epochFlags: [],
    epochSysCounts: [],
    sats: {},
    ephEvents: [],
    staEvents: [],
    stats: null,
  }
}

export function gnssSatKey(sys: number, prn: number): string {
  return `${sys}:${prn}`
}
