import { describe, expect, it } from 'vitest'
import { buildSignalBarLayout, type SignalBarSample } from '@/core/gnss/SignalBarLayout'
import { SKY_CONSTELLATION_COLORS } from '@/core/gnss/ConstellationColors'

function sample(constellation: string, prn: string | number, snr = 40): SignalBarSample {
  return { constellation, prn, snr, elevation: 45, azimuth: 90, timestamp: '' }
}

describe('signal bar channels', () => {
  it('keeps constellations together, sorts PRNs numerically and leaves space between groups', () => {
    const layout = buildSignalBarLayout([
      sample('BEIDOU', '12'),
      sample('GPS', '10'),
      sample('GPS', '2'),
    ])
    expect(layout.slots.map((slot) => slot?.label ?? null)).toEqual(['G02', 'G10', null, 'C12'])
    expect(
      layout.groups.map((group) => [group.constellation, group.count, group.first, group.last]),
    ).toEqual([
      ['GPS', 2, 0, 1],
      ['BEIDOU', 1, 3, 3],
    ])
  })

  it('keeps recent peaks above current values and handles missing or invalid signal measurements', () => {
    const layout = buildSignalBarLayout(
      [sample('GPS', 1, 25), sample('GPS', '2', Number.NaN), sample('GPS', '3', -1)],
      new Map([
        ['GPS-1', 48],
        ['GPS-2', Number.NaN],
      ]),
    )
    expect(layout.slots.map((slot) => [slot?.value, slot?.peak])).toEqual([
      [25, 48],
      [0, 0],
      [0, 0],
    ])
    expect(layout.maximum).toBe(48)
    expect(buildSignalBarLayout([]).slots).toEqual([])
  })

  it('keeps the bars and the legend close to the Sky Plot palette', () => {
    const palette = Object.entries(SKY_CONSTELLATION_COLORS).filter(([name]) => name !== 'UNKNOWN')
    const layout = buildSignalBarLayout(palette.map(([name], index) => sample(name, index + 1)))
    const channels = (color: string) =>
      [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16))
    for (const [constellation, original] of palette) {
      const bar = layout.slots.find((slot) => slot?.sample.constellation === constellation)!
      const baseRgb = channels(original)
      const barRgb = channels(bar.color)
      expect(barRgb.reduce((sum, channel) => sum + channel, 0)).toBeLessThan(
        baseRgb.reduce((sum, channel) => sum + channel, 0),
      )
      const baseRange = Math.max(...baseRgb) - Math.min(...baseRgb)
      const barRange = Math.max(...barRgb) - Math.min(...barRgb)
      expect(barRange / baseRange).toBeGreaterThanOrEqual(0.8)
      for (let index = 0; index < baseRgb.length; index++) {
        expect((barRgb[index] - Math.min(...barRgb)) / barRange).toBeCloseTo(
          (baseRgb[index] - Math.min(...baseRgb)) / baseRange,
          1,
        )
      }
      expect(layout.groups.find((group) => group.constellation === constellation)?.color).toBe(
        bar.color,
      )
    }
    expect(new Set(layout.slots.flatMap((slot) => (slot ? [slot.labelColor] : [])))).toEqual(
      new Set(['#ffffff']),
    )
  })
})
