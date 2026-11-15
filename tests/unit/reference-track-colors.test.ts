// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  referenceQualityColor,
  referenceQualityColorRgb01,
  RTKPLOT_REFERENCE_COLORS,
} from '../../src/components/windows/gnss/referenceTrackColors'

describe('RTKPlot reference track colors', () => {
  it('uses solution 2 colors for each supported GNSS quality', () => {
    expect(RTKPLOT_REFERENCE_COLORS).toEqual({
      0: '#c0c0c0',
      1: '#ff8080',
      2: '#0080ff',
      4: '#004080',
      5: '#808000',
      6: '#8080ff',
    })
    expect(referenceQualityColor(4)).toBe('#004080')
    expect(referenceQualityColor(5)).toBe('#808000')
    expect(referenceQualityColor(1)).toBe('#ff8080')
    expect(referenceQualityColor(2)).toBe('#0080ff')
    expect(referenceQualityColor(6)).toBe('#8080ff')
    expect(referenceQualityColor(99)).toBe('#c0c0c0')
  })

  it('converts colors to normalized renderer components', () => {
    expect(referenceQualityColorRgb01(4)).toEqual([0, 64 / 255, 128 / 255])
  })
})
