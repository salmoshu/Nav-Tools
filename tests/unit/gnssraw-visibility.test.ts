import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('GNSS-Raw visibility per-satellite timeline slider', () => {
  const source = readFileSync('src/components/windows/gnssraw/GnssRawVisibility.vue', 'utf8')

  it('keeps the vertical slider bound to the category-axis window', () => {
    expect(source).toContain("type: 'slider'")
    expect(source).toContain('yAxisIndex: 0')
    expect(source).toContain('startValue: 0')
    expect(source).toContain('endValue: maxVisible - 1')
  })

  it('disables the meaningless auto data shadow of the custom gantt series', () => {
    expect(source).toContain('showDataShadow: false')
  })

  it('styles the slider as a rounded muted track with a stronger thumb', () => {
    expect(source).toContain('backgroundColor: colors.surfaceMuted')
    expect(source).toContain('borderRadius: 5')
    expect(source).toContain('fillerColor: colors.border')
    expect(source).toContain("borderColor: 'transparent'")
  })

  it('replaces the protruding default handles with flat end caps and hides the move pill', () => {
    expect(source).toContain("handleIcon: 'path://M0,0 h10 v5 h-10 z'")
    expect(source).toContain("handleStyle: { color: colors.textMuted, borderColor: 'transparent' }")
    expect(source).toContain('moveHandleSize: 0')
    expect(source).toContain('emphasis: { handleStyle: { color: colors.text } }')
  })
})
