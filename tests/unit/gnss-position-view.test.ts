import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('GNSS deviation window position view', () => {
  const source = readFileSync('src/components/windows/gnss/GnssDeviation.vue', 'utf8')

  it('provides view toggle between deviation scatter and position line chart', () => {
    expect(source).toContain('v-model="currentView"')
    expect(source).toContain('label="deviation"')
    expect(source).toContain('label="position"')
    expect(source).toContain("v-show=\"currentView === 'deviation'\"")
    expect(source).toContain("v-show=\"currentView === 'position'\"")
  })

  it('renders three line series for E/N/U components', () => {
    expect(source).toContain("type: 'line'")
    expect(source).toContain('东向 E')
    expect(source).toContain('北向 N')
    expect(source).toContain('天向 U')
    expect(source).toContain('item.enuE')
    expect(source).toContain('item.enuN')
    expect(source).toContain('item.altitude')
  })

  it('uses ECharts with svg renderer and a time x-axis', () => {
    expect(source).toContain("import * as echarts from 'echarts'")
    expect(source).toContain("renderer: 'svg'")
    expect(source).toContain("type: 'time'")
  })

  it('limits history, throttles refresh and skips hidden documents', () => {
    expect(source).toContain('MAX_POSITION_POINTS = 3600')
    expect(source).toContain('POSITION_UPDATE_INTERVAL_MS = 200')
    expect(source).toContain('document.hidden')
    expect(source).toContain('schedulePositionUpdate')
  })

  it('shows fix quality text in tooltip via numberToQuality', () => {
    expect(source).toContain('numberToQuality')
    expect(source).toContain('trigger: \'axis\'')
  })

  it('rebuilds the position chart on theme change', () => {
    expect(source).toContain('watch(resolvedTheme')
    expect(source).toContain('scheduleThemeRefresh')
    expect(source).toContain('initPositionChart')
  })

  it('adapts position chart size to container', () => {
    expect(source).toContain('ResizeObserver')
    expect(source).toContain('positionChartInstance.resize()')
  })

  it('keeps the existing WebGL deviation renderer intact', () => {
    expect(source).toContain('createTrajectoryRenderer')
    expect(source).toContain('renderer?.setViewport')
    expect(source).toContain('renderer?.dispose()')
  })

  it('renders every deviation point through a frame-budgeted animation queue', () => {
    expect(source).toContain('deviationPoints: plotData')
    expect(source).toContain('RENDER_QUEUE_TARGET_FRAMES = 2')
    expect(source).toContain('RENDER_MAX_POINTS_PER_FRAME = 128')
    expect(source).toContain('RENDER_BUDGET_MS = 4')
    expect(source).toContain('getLatestRenderedPoint')
    expect(source).toContain('renderedPointCount')
    expect(source).toContain("currentView.value !== 'deviation'")
    expect(source).not.toContain('RENDER_INTERVAL_MS = 33')
    expect(source).not.toContain('renderer.addPointsBatch(points)')
    expect(source).not.toContain('previousPlotData = points.slice()')
  })
})
