import { describe, expect, it } from 'vitest'
import { buildSignalBarLayout, type SignalBarSample } from '@/core/gnss/SignalBarLayout'

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
})
