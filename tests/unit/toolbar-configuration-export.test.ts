import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const toolbarSource = readFileSync('src/components/ToolBar.vue', 'utf8')
const dashboardSource = readFileSync('src/components/Dashboard.vue', 'utf8')

describe('toolbar configuration export', () => {
  it('offers an accessible export button and delegates the export request', () => {
    expect(toolbarSource).toContain("t('app.toolbar.exportConfiguration')")
    expect(toolbarSource).toContain('<Download')
    expect(toolbarSource).toContain("emitter.emit('export-configuration')")
  })

  it('saves the current layout before building the downloaded configuration', () => {
    const handlerStart = dashboardSource.indexOf('const handleExportConfiguration')
    const handlerEnd = dashboardSource.indexOf('\n}', handlerStart)
    const handler = dashboardSource.slice(handlerStart, handlerEnd)

    expect(handlerStart).toBeGreaterThan(-1)
    expect(handler).toContain('saveCurrentLayout()')
    expect(handler).toContain('buildConfigurationExport')
    expect(handler.indexOf('saveCurrentLayout()')).toBeLessThan(
      handler.indexOf('buildConfigurationExport'),
    )
  })
})
