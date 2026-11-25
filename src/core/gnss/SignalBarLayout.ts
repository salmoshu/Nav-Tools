import type { SatelliteDetailSample } from './SatelliteDetailEpochStore'
import { SKY_CONSTELLATION_COLORS } from './ConstellationColors'

export type SignalBarSample = SatelliteDetailSample

/** Satellite prefixes and muted colors for the satellite-count curves. */
export const SIGNAL_CONSTELLATIONS: Record<string, { prefix: string; color: string }> = {
  GPS: { prefix: 'G', color: '#4C7467' },
  GLONASS: { prefix: 'R', color: '#77694F' },
  GALILEO: { prefix: 'E', color: '#53708B' },
  BEIDOU: { prefix: 'C', color: '#8A606A' },
  QZSS: { prefix: 'J', color: '#706486' },
  SBAS: { prefix: 'S', color: '#697284' },
  NAVIC: { prefix: 'I', color: '#496E75' },
  OTHER: { prefix: 'U', color: '#66717C' },
}

// A light charcoal tint keeps the column colors close to the Sky Plot palette.
const skyColorWeight = 0.84
const charcoalChannel = 54
const barColors = Object.fromEntries(
  Object.entries(SKY_CONSTELLATION_COLORS).map(([constellation, color]) => {
    const channels = [1, 3, 5].map((offset) => {
      const channel = Number.parseInt(color.slice(offset, offset + 2), 16)
      return Math.round(channel * skyColorWeight + charcoalChannel * (1 - skyColorWeight))
    })
    const fill = `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
    return [constellation, fill]
  }),
)

export interface SignalBar {
  label: string
  value: number
  peak: number
  color: string
  labelColor: string
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
    const color = barColors[sample.constellation] ?? barColors.UNKNOWN
    let group = groups.at(-1)
    if (!group || group.constellation !== sample.constellation) {
      if (slots.length) slots.push(null)
      group = {
        constellation: sample.constellation,
        color,
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
      color,
      labelColor: '#ffffff',
      sample,
    })
    group.last = slots.length - 1
    group.count += 1
  }
  return { slots, groups, maximum }
}
