// GNSS-Raw 分析层：列式数据集 -> 各面板视图模型。纯函数，供面板与单测复用。
// 分析维度对齐 gnss-test 的 obs_quality（可见性/GF 漂移/伪距噪声/SNR）
// 与 eph_update（iode 异常/译码失败/星历过期）两个主题。
import {
  GNSS_SYS,
  type GnssRawDataset,
  type GnssSatSeries,
} from './types'

export const CLIGHT = 299792458

// —— 卫星可见性与采样完整率 ——

export interface SatVisibility {
  sys: number
  prn: number
  epochs: number
  firstS: number
  lastS: number
  spanS: number
  /** 出现历元数 / 文件总历元数 */
  presenceRatio: number
}

export interface SamplingInfo {
  epochCount: number
  spanS: number
  /** 相邻历元间隔中位数（秒） */
  medianIntervalS: number
  /** 按中位间隔推算的应有历元数 */
  expectedEpochs: number
  /** 完整率 = 实际 / 应有 */
  completeness: number
  /** 间隔直方图（按秒取整） */
  intervalHistogram: Array<{ intervalS: number; count: number }>
}

export interface VisibilitySummary {
  perSat: SatVisibility[]
  sampling: SamplingInfo
}

export function computeVisibility(dataset: GnssRawDataset): VisibilitySummary {
  const total = dataset.epochTimes.length
  const perSat: SatVisibility[] = []
  for (const key of Object.keys(dataset.sats)) {
    const series = dataset.sats[key]
    if (series.times.length === 0) continue
    const firstS = series.times[0]
    const lastS = series.times[series.times.length - 1]
    perSat.push({
      sys: series.sys,
      prn: series.prn,
      epochs: series.times.length,
      firstS,
      lastS,
      spanS: lastS - firstS,
      presenceRatio: total > 0 ? series.times.length / total : 0,
    })
  }
  perSat.sort((a, b) => a.sys - b.sys || a.prn - b.prn)
  return { perSat, sampling: computeSampling(dataset.epochTimes) }
}

export function computeSampling(epochTimes: readonly number[]): SamplingInfo {
  const n = epochTimes.length
  if (n === 0) {
    return {
      epochCount: 0,
      spanS: 0,
      medianIntervalS: 0,
      expectedEpochs: 0,
      completeness: 0,
      intervalHistogram: [],
    }
  }
  const spanS = epochTimes[n - 1] - epochTimes[0]
  const intervals: number[] = []
  const histogram = new Map<number, number>()
  for (let i = 1; i < n; i++) {
    const dt = epochTimes[i] - epochTimes[i - 1]
    if (dt <= 0) continue
    intervals.push(dt)
    const bucket = Math.round(dt)
    histogram.set(bucket, (histogram.get(bucket) ?? 0) + 1)
  }
  const medianIntervalS = median(intervals)
  const expectedEpochs = medianIntervalS > 0 ? Math.floor(spanS / medianIntervalS) + 1 : n
  const intervalHistogram = [...histogram.entries()]
    .map(([intervalS, count]) => ({ intervalS, count }))
    .sort((a, b) => a.intervalS - b.intervalS)
  return {
    epochCount: n,
    spanS,
    medianIntervalS,
    expectedEpochs,
    completeness: expectedEpochs > 0 ? Math.min(1, n / expectedEpochs) : 1,
    intervalHistogram,
  }
}

// —— GF 载波组合（geometry-free：λ1·L1 − λ2·L2，消除几何项，反映电离层+偏差） ——

export interface GfSeries {
  sys: number
  prn: number
  slotA: number
  slotB: number
  times: number[]
  /** GF 组合（米） */
  gf: number[]
  /** 线性拟合漂移率（米/秒） */
  driftMps: number
}

/**
 * 计算单星的 GF 组合序列。要求两个槽位都有有效载波与已知频率。
 * 返回 null 表示无法计算（频率未知或双频载波不足）。
 */
export function computeGfSeries(series: GnssSatSeries, slotA = 0, slotB = 1): GfSeries | null {
  const a = series.slots[slotA]
  const b = series.slots[slotB]
  if (!a || !b || a.freqHz <= 0 || b.freqHz <= 0) return null
  const lambdaA = CLIGHT / a.freqHz
  const lambdaB = CLIGHT / b.freqHz
  const times: number[] = []
  const gf: number[] = []
  for (let i = 0; i < series.times.length; i++) {
    const la = a.l[i]
    const lb = b.l[i]
    if (!Number.isFinite(la) || !Number.isFinite(lb) || la === 0 || lb === 0) continue
    times.push(series.times[i])
    gf.push(lambdaA * la - lambdaB * lb)
  }
  if (gf.length < 2) return null
  return {
    sys: series.sys,
    prn: series.prn,
    slotA,
    slotB,
    times,
    gf,
    driftMps: linearSlope(times, gf),
  }
}

// —— 伪距噪声（历元差分 |ΔP − λ·ΔL|：多路径+噪声代理量，载波平滑消模糊度） ——

export interface FreqBandNoise {
  sys: number
  slot: number
  /** 代表观测码 */
  code: number
  freqHz: number
  samples: number
  medianM: number
  rmsM: number
  p95M: number
  /** 粗差占比（> thresholdM） */
  outlierRatio: number
}

export function computePseudorangeNoise(dataset: GnssRawDataset, thresholdM = 2): FreqBandNoise[] {
  const bands = new Map<
    string,
    { sys: number; slot: number; code: number; freqHz: number; values: number[] }
  >()
  for (const key of Object.keys(dataset.sats)) {
    const series = dataset.sats[key]
    for (let slot = 0; slot < series.slots.length; slot++) {
      const slotSeries = series.slots[slot]
      if (!slotSeries || slotSeries.freqHz <= 0) continue
      const lambda = CLIGHT / slotSeries.freqHz
      const bandKey = `${series.sys}:${slot}`
      let band = bands.get(bandKey)
      if (!band) {
        band = {
          sys: series.sys,
          slot,
          code: slotSeries.code,
          freqHz: slotSeries.freqHz,
          values: [],
        }
        bands.set(bandKey, band)
      }
      for (let i = 1; i < series.times.length; i++) {
        const p0 = slotSeries.p[i - 1]
        const p1 = slotSeries.p[i]
        const l0 = slotSeries.l[i - 1]
        const l1 = slotSeries.l[i]
        if (!Number.isFinite(p0) || !Number.isFinite(p1)) continue
        if (!Number.isFinite(l0) || !Number.isFinite(l1) || l0 === 0 || l1 === 0) continue
        band.values.push(Math.abs(p1 - p0 - lambda * (l1 - l0)))
      }
    }
  }
  const result: FreqBandNoise[] = []
  for (const band of bands.values()) {
    if (band.values.length === 0) continue
    const sorted = [...band.values].sort((x, y) => x - y)
    result.push({
      sys: band.sys,
      slot: band.slot,
      code: band.code,
      freqHz: band.freqHz,
      samples: sorted.length,
      medianM: quantileSorted(sorted, 0.5),
      rmsM: Math.sqrt(band.values.reduce((acc, v) => acc + v * v, 0) / sorted.length),
      p95M: quantileSorted(sorted, 0.95),
      outlierRatio: band.values.filter((v) => v > thresholdM).length / sorted.length,
    })
  }
  result.sort((a, b) => a.sys - b.sys || a.slot - b.slot)
  return result
}

// —— SNR 统计 ——

export interface SnrBand {
  sys: number
  slot: number
  code: number
  samples: number
  mean: number
  min: number
  max: number
  /** 1 dB 直方图（binStart = 下边界 dBHz） */
  histogram: Array<{ binStart: number; count: number }>
}

export function computeSnrStats(dataset: GnssRawDataset): SnrBand[] {
  const bands = new Map<string, { sys: number; slot: number; code: number; values: number[] }>()
  for (const key of Object.keys(dataset.sats)) {
    const series = dataset.sats[key]
    for (let slot = 0; slot < series.slots.length; slot++) {
      const slotSeries = series.slots[slot]
      if (!slotSeries) continue
      const bandKey = `${series.sys}:${slot}`
      let band = bands.get(bandKey)
      if (!band) {
        band = { sys: series.sys, slot, code: slotSeries.code, values: [] }
        bands.set(bandKey, band)
      }
      for (const snr of slotSeries.snr) {
        if (Number.isFinite(snr) && snr > 0) band.values.push(snr)
      }
    }
  }
  const result: SnrBand[] = []
  for (const band of bands.values()) {
    if (band.values.length === 0) continue
    const histogram = new Map<number, number>()
    let sum = 0
    let min = Infinity
    let max = -Infinity
    for (const v of band.values) {
      sum += v
      if (v < min) min = v
      if (v > max) max = v
      const bin = Math.floor(v)
      histogram.set(bin, (histogram.get(bin) ?? 0) + 1)
    }
    result.push({
      sys: band.sys,
      slot: band.slot,
      code: band.code,
      samples: band.values.length,
      mean: sum / band.values.length,
      min,
      max,
      histogram: [...histogram.entries()]
        .map(([binStart, count]) => ({ binStart, count }))
        .sort((a, b) => a.binStart - b.binStart),
    })
  }
  result.sort((a, b) => a.sys - b.sys || a.slot - b.slot)
  return result
}

// —— 星历更新异常 ——

export interface EphSatSummary {
  sys: number
  prn: number
  events: number
  /** iode 发生变化次数 */
  iodeChanges: number
  /** 间隔小于 flapWindowS 的 iode 变化（异常翻动） */
  iodeFlaps: number
  firstRecvS: number
  lastRecvS: number
  lastToeS: number
  lastFitH: number
  /** 流结束时星历年龄（秒，相对最后一条 toe） */
  ageS: number
  expired: boolean
}

export interface EphAnalysis {
  perSat: EphSatSummary[]
  totalEvents: number
  iodeFlapTotal: number
  expiredCount: number
  /** 按报文类型的译码失败数（如 1020 GLO 星历） */
  decodeFailByType: Record<number, number>
}

/** 星历有效期（秒）：GLO 约 30 分钟，其余按 fit 区间（0/负值按 4h） */
export function ephValidityS(isGlo: boolean, fitH: number): number {
  if (isGlo) return 30 * 60
  return (fitH > 0 ? fitH : 4) * 3600
}

export function analyzeEphemeris(dataset: GnssRawDataset, flapWindowS = 3600): EphAnalysis {
  const endS =
    dataset.epochTimes.length > 0 ? dataset.epochTimes[dataset.epochTimes.length - 1] : 0
  const bySat = new Map<string, typeof dataset.ephEvents>()
  for (const event of dataset.ephEvents) {
    const key = `${event.sys}:${event.prn}`
    let list = bySat.get(key)
    if (!list) {
      list = []
      bySat.set(key, list)
    }
    list.push(event)
  }
  const perSat: EphSatSummary[] = []
  let iodeFlapTotal = 0
  let expiredCount = 0
  for (const [key, list] of bySat) {
    list.sort((a, b) => a.recvS - b.recvS)
    const [sysStr, prnStr] = key.split(':')
    let iodeChanges = 0
    let iodeFlaps = 0
    for (let i = 1; i < list.length; i++) {
      if (list[i].iode !== list[i - 1].iode) {
        iodeChanges++
        if (list[i].recvS - list[i - 1].recvS < flapWindowS) iodeFlaps++
      }
    }
    const last = list[list.length - 1]
    const ageS = endS > 0 && last.toeS > 0 ? endS - last.toeS : 0
    const expired = ageS > ephValidityS(last.isGlo, last.fitH)
    if (expired) expiredCount++
    iodeFlapTotal += iodeFlaps
    perSat.push({
      sys: Number(sysStr),
      prn: Number(prnStr),
      events: list.length,
      iodeChanges,
      iodeFlaps,
      firstRecvS: list[0].recvS,
      lastRecvS: last.recvS,
      lastToeS: last.toeS,
      lastFitH: last.fitH,
      ageS,
      expired,
    })
  }
  perSat.sort((a, b) => a.sys - b.sys || a.prn - b.prn)
  return {
    perSat,
    totalEvents: dataset.ephEvents.length,
    iodeFlapTotal,
    expiredCount,
    decodeFailByType: dataset.stats?.msgFail ?? {},
  }
}

// —— 报文类型命名（帧统计面板用） ——

const MSM_SYS_BY_PREFIX: Record<number, number> = {
  107: GNSS_SYS.GPS,
  108: GNSS_SYS.GLO,
  109: GNSS_SYS.GAL,
  110: GNSS_SYS.SBS,
  111: GNSS_SYS.QZS,
  112: GNSS_SYS.BDS,
  113: GNSS_SYS.IRN,
}

const MSG_TYPE_NAMES: Record<number, string> = {
  1005: 'Station RTK (stationary)',
  1006: 'Station RTK (height)',
  1007: 'Antenna descriptor',
  1008: 'Antenna serial',
  1019: 'GPS ephemeris',
  1020: 'GLO ephemeris',
  1029: 'Unicode text',
  1033: 'Receiver + antenna',
  1041: 'IRN ephemeris',
  1042: 'BDS ephemeris',
  1044: 'QZS ephemeris',
  1045: 'GAL F/NAV ephemeris',
  1046: 'GAL I/NAV ephemeris',
  1230: 'GLO code-phase bias',
}

const SYS_SHORT_NAMES = ['—', 'GPS', 'GLO', 'GAL', 'BDS', 'QZS', 'SBS', 'IRN']

export function msgTypeName(type: number): string {
  const known = MSG_TYPE_NAMES[type]
  if (known) return known
  if (type >= 1071 && type <= 1137) {
    const sys = MSM_SYS_BY_PREFIX[Math.floor(type / 10)]
    const msm = type % 10
    if (sys && msm >= 1 && msm <= 7) {
      return `${SYS_SHORT_NAMES[sys]} MSM${msm}`
    }
  }
  if (type >= 1057 && type <= 1068) return 'SSR'
  if (type >= 1240 && type <= 1263) return 'SSR (draft)'
  if (type >= 4070 && type <= 4099) return 'Proprietary'
  return `RTCM ${type}`
}

// —— 统计工具 ——

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return quantileSorted(sorted, 0.5)
}

export function quantileSorted(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const lower = sorted[base]
  const upper = sorted[Math.min(base + 1, sorted.length - 1)]
  return lower + rest * (upper - lower)
}

/** 最小二乘拟合斜率（y 对 x） */
export function linearSlope(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return 0
  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]
    sy += ys[i]
  }
  const mx = sx / n
  const my = sy / n
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    sxx += dx * dx
    sxy += dx * (ys[i] - my)
  }
  return sxx > 0 ? sxy / sxx : 0
}
