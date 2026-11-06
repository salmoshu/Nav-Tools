import type { SatelliteDetailSample } from './SatelliteDetailEpochStore'

export type SignalBarSample = Omit<SatelliteDetailSample, 'prn'> & { prn: string | number }

export const SIGNAL_CONSTELLATIONS: Record<string, { prefix: string; color: string }> = {
  GPS: { prefix: 'G', color: '#3ba96b' },
  GLONASS: { prefix: 'R', color: '#468ddd' },
  GALILEO: { prefix: 'E', color: '#9670dc' },
  BEIDOU: { prefix: 'C', color: '#dc9b28' },
  QZSS: { prefix: 'J', color: '#2aa8a0' },
  OTHER: { prefix: 'U', color: '#8290a4' },
}

export interface SignalBar {
  label: string
  value: number
  peak: number
  color: string
  sample: SignalBarSample
}

export interface SignalBarGroup {
  constellation: string
  color: string
  first: number
  last: number
  count: number
}

/** Preserve readable satellite channels, with one empty slot between constellations. */
export function buildSignalBarLayout(
  samples: readonly SignalBarSample[],
  peaks: ReadonlyMap<string, number> = new Map(),
): { slots: Array<SignalBar | null>; groups: SignalBarGroup[]; maximum: number } {
  const order = Object.keys(SIGNAL_CONSTELLATIONS)
  const rank = (constellation: string) => {
    const index = order.indexOf(constellation)
    return index < 0 ? order.length : index
  }
  const sorted = [...samples].sort(
    (a, b) =>
      rank(a.constellation) - rank(b.constellation) ||
      a.constellation.localeCompare(b.constellation) ||
      (parseInt(String(a.prn)) || 0) - (parseInt(String(b.prn)) || 0),
  )
  const slots: Array<SignalBar | null> = []
  const groups: SignalBarGroup[] = []
  let maximum = 0
  for (const sample of sorted) {
    const style = SIGNAL_CONSTELLATIONS[sample.constellation] ?? SIGNAL_CONSTELLATIONS.OTHER
    let group = groups.at(-1)
    if (!group || group.constellation !== sample.constellation) {
      if (slots.length) slots.push(null)
      group = {
        constellation: sample.constellation,
        color: style.color,
        first: slots.length,
        last: slots.length,
        count: 0,
      }
      groups.push(group)
    }
    const value = Number.isFinite(sample.snr) ? Math.max(0, sample.snr) : 0
    const previousPeak = peaks.get(`${sample.constellation}-${sample.prn}`) ?? 0
    const peak = Math.max(value, Number.isFinite(previousPeak) ? previousPeak : 0)
    maximum = Math.max(maximum, peak)
    slots.push({
      label: `${style.prefix}${String(sample.prn).padStart(2, '0')}`,
      value,
      peak,
      color: style.color,
      sample,
    })
    group.last = slots.length - 1
    group.count += 1
  }
  return { slots, groups, maximum }
}
