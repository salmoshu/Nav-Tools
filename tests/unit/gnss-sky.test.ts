import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('GNSS sky plot label stacking', () => {
  it('hides covered labels and restores them on hover emphasis', () => {
    const source = readFileSync('src/components/windows/gnss/GnssSky.vue', 'utf8')

    expect(source).toMatch(/labelLayout:\s*\{\s*hideOverlap:\s*true/)
    expect(source).toMatch(/emphasis:\s*\{[\s\S]*?label:\s*\{\s*show:\s*true/)
    expect(source).not.toContain("focus: 'self'")
    expect(source).toContain('width: satelliteSize.value')
    expect(source).toContain('height: satelliteSize.value')
  })

  it('forces the tooltip closed when the pointer leaves the plot', () => {
    const source = readFileSync('src/components/windows/gnss/GnssSky.vue', 'utf8')

    expect(source).toContain('@mouseleave="hideSkyTooltip"')
    expect(source).toContain("getZr().on('globalout', hideSkyTooltip)")
    expect(source).toContain("dispatchAction({ type: 'hideTip' })")
  })

  it('lets theme controls paint before rebuilding the chart', () => {
    const source = readFileSync('src/components/windows/gnss/GnssSky.vue', 'utf8')

    expect(source).toContain('watch(resolvedTheme, scheduleThemeRefresh)')
    expect(source.match(/themeRefreshRaf = requestAnimationFrame/g)).toHaveLength(2)
  })

  it('toggles constellation visibility by clicking legend items', () => {
    const source = readFileSync('src/components/windows/gnss/GnssSky.vue', 'utf8')

    expect(source).toContain('const hiddenConstellations = ref(new Set())')
    expect(source).toContain('@click="toggleConstellation(name)"')
    expect(source).toContain('!hiddenConstellations.value.has(sat.constellation)')
    // 下拉选具体星座时清空隐藏集合，避免两套过滤语义打架
    expect(source).toContain('function onConstellationFilterChange(value)')
  })
})
