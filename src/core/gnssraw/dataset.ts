// 由解码事件流增量构建列式数据集：纯函数 + 可变构建器，Worker 内使用。
import {
  emptyGnssRawDataset,
  gnssSatKey,
  type GnssEvent,
  type GnssRawDataset,
  type GnssSatSeries,
  type GnssSlotSeries,
  type GnssStreamStats,
} from './types'

const MAX_SLOTS = 3

/** 观测码 -> 载波频率 Hz 查询（Worker 侧由 WASM codeFreq 提供） */
export type CodeFreqLookup = (sys: number, code: number, fcn: number) => number

/**
 * 增量数据集构建器。push 事件、finalize 收尾。
 * 频率查询是可选的：不提供时 freqHz 记 0（分析层退化处理）。
 */
export class GnssRawDatasetBuilder {
  private readonly dataset: GnssRawDataset = emptyGnssRawDataset()

  public constructor(private readonly codeFreq?: CodeFreqLookup) {}

  public push(events: readonly GnssEvent[]): void {
    for (const event of events) {
      if (event.kind === 'epoch') this.pushEpoch(event)
      else if (event.kind === 'eph') this.dataset.ephEvents.push(event)
      else if (event.kind === 'sta') this.dataset.staEvents.push(event)
    }
  }

  public setStats(stats: GnssStreamStats): void {
    this.dataset.stats = stats
  }

  public result(): GnssRawDataset {
    return this.dataset
  }

  private pushEpoch(epoch: {
    timeS: number
    flag: number
    sats: Array<{
      sat: number
      sys: number
      prn: number
      fcn: number
      obs: Array<{ code: number; snr: number; p: number; l: number }>
    }>
  }): void {
    const counts = new Array<number>(8).fill(0)
    this.dataset.epochTimes.push(epoch.timeS)
    this.dataset.epochFlags.push(epoch.flag)
    for (const sat of epoch.sats) {
      if (sat.sys >= 0 && sat.sys < 8) counts[sat.sys]++
      const key = gnssSatKey(sat.sys, sat.prn)
      let series = this.dataset.sats[key]
      if (!series) {
        series = { sys: sat.sys, prn: sat.prn, times: [], slots: [] }
        this.dataset.sats[key] = series
      }
      series.times.push(epoch.timeS)
      for (let slot = 0; slot < MAX_SLOTS; slot++) {
        const obs = sat.obs[slot]
        const used =
          obs !== undefined && (obs.code !== 0 || obs.p !== 0 || obs.l !== 0 || obs.snr !== 0)
        if (!used) {
          // 槽位从未建立就跳过；已建立的槽位需要补 NaN 保持对齐
          const slotSeries = series.slots[slot]
          if (slotSeries) {
            slotSeries.snr.push(NaN)
            slotSeries.p.push(NaN)
            slotSeries.l.push(NaN)
          }
          continue
        }
        const slotSeries = ensureSlot(series, slot, sat.sys, obs.code, sat.fcn, this.codeFreq)
        slotSeries.snr.push(obs.snr > 0 ? obs.snr : NaN)
        slotSeries.p.push(obs.p !== 0 ? obs.p : NaN)
        slotSeries.l.push(obs.l !== 0 ? obs.l : NaN)
      }
    }
    this.dataset.epochSysCounts.push(counts)
  }
}

function ensureSlot(
  series: GnssSatSeries,
  slot: number,
  sys: number,
  code: number,
  fcn: number,
  codeFreq?: CodeFreqLookup,
): GnssSlotSeries {
  let slotSeries = series.slots[slot]
  if (!slotSeries) {
    slotSeries = {
      code: 0,
      freqHz: 0,
      // 该槽位首次出现时，前面的历元需要补 NaN 对齐
      snr: new Array<number>(series.times.length - 1).fill(NaN),
      p: new Array<number>(series.times.length - 1).fill(NaN),
      l: new Array<number>(series.times.length - 1).fill(NaN),
    }
    series.slots[slot] = slotSeries
  }
  if (slotSeries.code === 0 && code !== 0) {
    slotSeries.code = code
    slotSeries.freqHz = codeFreq ? codeFreq(sys, code, fcn) : 0
  }
  return slotSeries
}
