import { describe, expect, it } from 'vitest'
import { GnssRawDatasetBuilder } from '@/core/gnssraw/dataset'
import {
  analyzeEphemeris,
  computeGfSeries,
  computePseudorangeNoise,
  computeSampling,
  computeSnrStats,
  computeVisibility,
  ephValidityS,
  linearSlope,
  median,
  msgTypeName,
  CLIGHT,
} from '@/core/gnssraw/analysis'
import {
  GNSS_SYS,
  type GnssEpochEvent,
  type GnssEphEvent,
  type GnssEvent,
} from '@/core/gnssraw/types'

const FREQ_L1 = 1575.42e6
const FREQ_L2 = 1227.6e6

function makeEpoch(timeS: number, sats: GnssEpochEvent['sats']): GnssEpochEvent {
  return { kind: 'epoch', timeS, flag: 0, sats }
}

function makeSat(
  sys: number,
  prn: number,
  slots: Array<{ code: number; snr?: number; p?: number; l?: number }>,
  sat = sys * 100 + prn,
): GnssEpochEvent['sats'][number] {
  const obs = slots.map((s) => ({
    code: s.code,
    lli: 0,
    snr: s.snr ?? 0,
    d: 0,
    p: s.p ?? 0,
    l: s.l ?? 0,
  }))
  while (obs.length < 3) obs.push({ code: 0, lli: 0, snr: 0, d: 0, p: 0, l: 0 })
  return { sat, sys, prn, fcn: 0, obs }
}

function makeEph(overrides: Partial<GnssEphEvent>): GnssEphEvent {
  return {
    kind: 'eph',
    msgType: 1019,
    sys: GNSS_SYS.GPS,
    isGlo: false,
    sat: 101,
    prn: 1,
    iode: 10,
    iodc: 10,
    week: 2000,
    toeS: 1000,
    tocS: 1000,
    recvS: 1000,
    fitH: 4,
    f0: 0,
    f1: 0,
    ...overrides,
  }
}

/** codeFreq 测试桩：code 1 -> L1，code 2 -> L2 */
function stubCodeFreq(_sys: number, code: number): number {
  if (code === 1) return FREQ_L1
  if (code === 2) return FREQ_L2
  return 0
}

describe('GnssRawDatasetBuilder', () => {
  it('builds columnar per-sat series with aligned slots', () => {
    const builder = new GnssRawDatasetBuilder(stubCodeFreq)
    const events: GnssEvent[] = [
      makeEpoch(100, [makeSat(GNSS_SYS.GPS, 1, [{ code: 1, snr: 45, p: 20e6, l: 1e8 }])]),
      makeEpoch(101, [
        makeSat(GNSS_SYS.GPS, 1, [
          { code: 1, snr: 46, p: 20.001e6, l: 1.00001e8 },
          { code: 2, snr: 40, p: 20.002e6, l: 7.8e7 },
        ]),
        makeSat(GNSS_SYS.BDS, 5, [{ code: 1, snr: 42, p: 21e6, l: 1.1e8 }]),
      ]),
    ]
    builder.push(events)
    const dataset = builder.result()

    expect(dataset.epochTimes).toEqual([100, 101])
    expect(dataset.epochSysCounts[0][GNSS_SYS.GPS]).toBe(1)
    expect(dataset.epochSysCounts[1][GNSS_SYS.GPS]).toBe(1)
    expect(dataset.epochSysCounts[1][GNSS_SYS.BDS]).toBe(1)

    const g1 = dataset.sats['1:1']
    expect(g1.times).toEqual([100, 101])
    // 第二历元才出现的 L2 槽位：第一个历元补 NaN
    expect(g1.slots).toHaveLength(2)
    expect(g1.slots[0].freqHz).toBe(FREQ_L1)
    expect(g1.slots[1].freqHz).toBe(FREQ_L2)
    expect(g1.slots[1].snr[0]).toBeNaN()
    expect(g1.slots[1].snr[1]).toBe(40)

    // 缺失槽位补 NaN：BDS 星只有 slot0
    const c5 = dataset.sats['4:5']
    expect(c5.slots).toHaveLength(1)
    expect(c5.times).toEqual([101])
  })

  it('collects ephemeris and station events plus stats', () => {
    const builder = new GnssRawDatasetBuilder()
    builder.push([
      makeEph({ prn: 3 }),
      { kind: 'sta', msgType: 1005, staid: 7, pos: [1, 2, 3], hgt: 10, del: [0, 0, 0] },
    ])
    builder.setStats({
      bytes: 1,
      framesOk: 1,
      framesCrcErr: 0,
      nmeaLines: 0,
      epochs: 0,
      ephEvents: 1,
      staEvents: 1,
      decodeFail: 0,
      msgOk: { 1019: 1 },
      msgFail: {},
    })
    const dataset = builder.result()
    expect(dataset.ephEvents).toHaveLength(1)
    expect(dataset.staEvents).toHaveLength(1)
    expect(dataset.stats?.msgOk[1019]).toBe(1)
  })
})

describe('computeSampling', () => {
  it('detects full-rate sampling', () => {
    const times = Array.from({ length: 100 }, (_, i) => 1000 + i)
    const info = computeSampling(times)
    expect(info.epochCount).toBe(100)
    expect(info.medianIntervalS).toBe(1)
    expect(info.completeness).toBe(1)
  })

  it('detects sparse sampling (11s gaps)', () => {
    // 60 个 1Hz + 40 个 11s 间隔 -> 中位间隔 1s，完整率约 0.2
    const times: number[] = []
    for (let i = 0; i < 60; i++) times.push(1000 + i)
    let t = 1059
    for (let i = 0; i < 40; i++) {
      t += 11
      times.push(t)
    }
    const info = computeSampling(times)
    expect(info.epochCount).toBe(100)
    expect(info.medianIntervalS).toBe(1)
    expect(info.completeness).toBeLessThan(0.25)
    expect(info.intervalHistogram.some((h) => h.intervalS === 11)).toBe(true)
  })

  it('handles empty input', () => {
    expect(computeSampling([]).epochCount).toBe(0)
  })
})

describe('computeVisibility', () => {
  it('summarizes per-sat presence sorted by sys/prn', () => {
    const builder = new GnssRawDatasetBuilder()
    for (let i = 0; i < 10; i++) {
      const sats = [makeSat(GNSS_SYS.BDS, 5, [{ code: 1, snr: 40 }])]
      if (i < 5) sats.push(makeSat(GNSS_SYS.GPS, 1, [{ code: 1, snr: 45 }]))
      builder.push([makeEpoch(100 + i, sats)])
    }
    const { perSat, sampling } = computeVisibility(builder.result())
    expect(perSat).toHaveLength(2)
    expect(perSat[0].sys).toBe(GNSS_SYS.GPS)
    expect(perSat[0].epochs).toBe(5)
    expect(perSat[0].presenceRatio).toBe(0.5)
    expect(perSat[1].presenceRatio).toBe(1)
    expect(sampling.epochCount).toBe(10)
  })
})

describe('computeGfSeries', () => {
  it('computes geometry-free combination in meters with drift slope', () => {
    const builder = new GnssRawDatasetBuilder(stubCodeFreq)
    const lambda1 = CLIGHT / FREQ_L1
    const lambda2 = CLIGHT / FREQ_L2
    // L 随时间线性增长 -> GF 漂移率应为正
    for (let i = 0; i < 20; i++) {
      builder.push([
        makeEpoch(100 + i, [
          makeSat(GNSS_SYS.GPS, 1, [
            { code: 1, l: 1e6 + i * 10, p: 20e6 },
            { code: 2, l: 8e5 + i * 5, p: 20e6 },
          ]),
        ]),
      ])
    }
    const series = builder.result().sats['1:1']
    const gf = computeGfSeries(series)
    expect(gf).not.toBeNull()
    expect(gf!.gf).toHaveLength(20)
    // 每历元 GF 增量 = lambda1*10 - lambda2*5
    const expectedStep = lambda1 * 10 - lambda2 * 5
    expect(gf!.gf[1] - gf!.gf[0]).toBeCloseTo(expectedStep, 9)
    expect(gf!.driftMps).toBeCloseTo(expectedStep, 9)
  })

  it('returns null when frequency unknown or dual carrier missing', () => {
    const builder = new GnssRawDatasetBuilder(() => 0)
    builder.push([
      makeEpoch(100, [makeSat(GNSS_SYS.GPS, 1, [{ code: 1, l: 1e6 }, { code: 2, l: 8e5 }])]),
    ])
    expect(computeGfSeries(builder.result().sats['1:1'])).toBeNull()
  })
})

describe('computePseudorangeNoise', () => {
  it('aggregates epoch-differenced code-minus-carrier per band', () => {
    const builder = new GnssRawDatasetBuilder(stubCodeFreq)
    const lambda1 = CLIGHT / FREQ_L1
    // 伪距含方波噪声（伪距跟随载波，ΔP−λΔL 恒为 ±1m 交替）
    for (let i = 0; i < 30; i++) {
      const l = 1e6 + i * 100
      const p = lambda1 * l + (i % 2 === 0 ? 0.5 : -0.5)
      builder.push([makeEpoch(100 + i, [makeSat(GNSS_SYS.GPS, 1, [{ code: 1, p, l }])])])
    }
    const bands = computePseudorangeNoise(builder.result())
    expect(bands).toHaveLength(1)
    expect(bands[0].sys).toBe(GNSS_SYS.GPS)
    expect(bands[0].samples).toBe(29)
    expect(bands[0].medianM).toBeCloseTo(1, 5)
    expect(bands[0].outlierRatio).toBe(0) // 阈值默认 2m
  })

  it('flags outliers above threshold', () => {
    const builder = new GnssRawDatasetBuilder(stubCodeFreq)
    const lambda1 = CLIGHT / FREQ_L1
    for (let i = 0; i < 10; i++) {
      const l = 1e6 + i * 100
      const jump = i === 5 ? 50 : 0 // 一次 50m 跳变 -> 相邻差分超限
      const p = lambda1 * l + jump
      builder.push([makeEpoch(100 + i, [makeSat(GNSS_SYS.GPS, 2, [{ code: 1, p, l }])])])
    }
    const bands = computePseudorangeNoise(builder.result(), 2)
    expect(bands[0].outlierRatio).toBeGreaterThan(0)
  })
})

describe('computeSnrStats', () => {
  it('builds per-band histograms with mean', () => {
    const builder = new GnssRawDatasetBuilder(stubCodeFreq)
    for (let i = 0; i < 10; i++) {
      builder.push([
        makeEpoch(100 + i, [
          makeSat(GNSS_SYS.GPS, 1, [
            { code: 1, snr: 44 + (i % 2) },
            { code: 2, snr: 38 },
          ]),
        ]),
      ])
    }
    const bands = computeSnrStats(builder.result())
    expect(bands).toHaveLength(2)
    expect(bands[0].mean).toBeCloseTo(44.5, 6)
    expect(bands[0].histogram.reduce((acc, h) => acc + h.count, 0)).toBe(10)
    expect(bands[1].mean).toBe(38)
  })
})

describe('analyzeEphemeris', () => {
  it('detects iode flapping within short windows', () => {
    const builder = new GnssRawDatasetBuilder()
    builder.push([makeEpoch(1000, [makeSat(GNSS_SYS.GPS, 1, [{ code: 1, snr: 40 }])])])
    builder.push([
      makeEph({ prn: 1, iode: 10, recvS: 1000, toeS: 900 }),
      makeEph({ prn: 1, iode: 11, recvS: 1200, toeS: 1100 }), // 200s 内 iode 变化 -> flap
      makeEph({ prn: 1, iode: 10, recvS: 1400, toeS: 900 }), // 再次翻动
    ])
    builder.push([makeEpoch(1500, [makeSat(GNSS_SYS.GPS, 1, [{ code: 1, snr: 40 }])])])
    const analysis = analyzeEphemeris(builder.result())
    expect(analysis.perSat).toHaveLength(1)
    expect(analysis.perSat[0].iodeChanges).toBe(2)
    expect(analysis.perSat[0].iodeFlaps).toBe(2)
    expect(analysis.iodeFlapTotal).toBe(2)
  })

  it('marks ephemeris expired when stream end exceeds fit interval', () => {
    const builder = new GnssRawDatasetBuilder()
    builder.push([makeEpoch(10000, [makeSat(GNSS_SYS.GPS, 1, [{ code: 1, snr: 40 }])])])
    builder.push([makeEpoch(10000 + 5 * 3600, [makeSat(GNSS_SYS.GPS, 1, [{ code: 1, snr: 40 }])])])
    builder.push([makeEph({ prn: 1, iode: 10, recvS: 10000, toeS: 10000, fitH: 4 })])
    const analysis = analyzeEphemeris(builder.result())
    expect(analysis.perSat[0].expired).toBe(true)
    expect(analysis.expiredCount).toBe(1)
  })

  it('treats GLO validity as 30 minutes', () => {
    expect(ephValidityS(true, 0)).toBe(1800)
    expect(ephValidityS(false, 4)).toBe(14400)
    expect(ephValidityS(false, 0)).toBe(14400)
  })
})

describe('msgTypeName', () => {
  it('names MSM and ephemeris types', () => {
    expect(msgTypeName(1075)).toBe('GPS MSM5')
    expect(msgTypeName(1125)).toBe('BDS MSM5')
    expect(msgTypeName(1019)).toBe('GPS ephemeris')
    expect(msgTypeName(1020)).toBe('GLO ephemeris')
    expect(msgTypeName(9999)).toBe('RTCM 9999')
  })
})

describe('statistics helpers', () => {
  it('median and slope', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([])).toBe(0)
    expect(linearSlope([0, 1, 2], [0, 2, 4])).toBeCloseTo(2, 9)
    expect(linearSlope([0, 1], [5, 5])).toBe(0)
  })
})
