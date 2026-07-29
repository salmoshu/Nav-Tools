import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FIX_STATUS_COLOR,
  FIX_STATUS_COLORS,
  fixStatusColor,
  fixStatusColorRgb01,
} from '@/components/windows/gnss/fixStatusColors'

describe('GNSS solution status colors', () => {
  it('keeps the shared Deviation palette for every supported solution quality', () => {
    expect(FIX_STATUS_COLORS).toEqual({
      0: '#808080',
      1: '#ff0000',
      2: '#0000ff',
      4: '#008000',
      5: '#ffa500',
    })
    expect(fixStatusColor(99)).toBe(DEFAULT_FIX_STATUS_COLOR)
    expect(fixStatusColorRgb01(4)).toEqual([0, 128 / 255, 0])
  })

  it('uses the same palette in GNSS Deviation and GNSS Map', () => {
    const deviation = readFileSync('src/components/windows/gnss/GnssDeviation.vue', 'utf8')
    const map = readFileSync('src/components/windows/gnss/GnssMap.vue', 'utf8')

    expect(deviation).toContain('fixStatusColorRgb01(quality)')
    expect(map).toContain('color: fixStatusColor(point.quality)')
    expect(map).toContain('fillColor: fixStatusColor(quality)')
  })
})
