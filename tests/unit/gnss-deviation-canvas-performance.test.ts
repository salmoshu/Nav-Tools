import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('GNSS deviation canvas performance', () => {
  const source = readFileSync(
    'src/components/windows/gnss/GnssDeviationCanvas.vue',
    'utf8',
  )

  it('reuses the incremental deviation point cache', () => {
    expect(source).toContain('deviationPoints')
    expect(source).not.toContain('source.map(item =>')
    expect(source).toContain('watch(\n    plotData,')
  })

  it('defers chart recreation until theme controls have painted', () => {
    expect(source).toContain('watch(resolvedTheme, scheduleThemeRefresh)')
    expect(source.match(/themeRefreshFrame = requestAnimationFrame/g)).toHaveLength(2)
  })
})
