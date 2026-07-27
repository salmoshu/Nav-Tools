import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('GNSS signal SNR bar chart view', () => {
  const source = readFileSync('src/components/windows/gnss/GnssSignal.vue', 'utf8')

  it('imports echarts and renders a bar series', () => {
    expect(source).toContain("import * as echarts from 'echarts'")
    expect(source).toContain("type: 'bar'")
  })

  it('provides view toggle between table and chart', () => {
    expect(source).toContain('v-model="currentView"')
    expect(source).toContain('value="table"')
    expect(source).toContain('value="chart"')
  })

  it('adds SNR reference lines at 25/35/45 dB', () => {
    expect(source).toContain('markLine')
    expect(source).toContain('yAxis: 25')
    expect(source).toContain('yAxis: 35')
    expect(source).toContain('yAxis: 45')
  })

  it('shows satellite details in the SNR tooltip', () => {
    expect(source).toContain('data.prn')
    expect(source).toContain('data.constellation')
    expect(source).toContain('data.elevation')
    expect(source).toContain('data.azimuth')
    expect(source).toContain('data.value')
  })

  it('filters chart data by constellation', () => {
    expect(source).toContain('constellationFilter')
    expect(source).toContain('sat.constellation === constellationFilter.value')
  })

  it('adapts chart size to its container', () => {
    expect(source).toContain('ResizeObserver')
    expect(source).toContain('chartInstance.value.resize()')
  })

  it('defers theme refresh until controls have painted', () => {
    expect(source).toContain('watch(resolvedTheme, scheduleThemeRefresh)')
    expect(source.match(/themeRefreshRaf = requestAnimationFrame/g)).toHaveLength(2)
  })
})

describe('GNSS signal satellite-count view', () => {
  const parent = readFileSync('src/components/windows/gnss/GnssSignal.vue', 'utf8')
  const chart = readFileSync('src/components/windows/gnss/SatelliteCountChart.vue', 'utf8')

  it('keeps the NSat selector and delegates rendering to the WebGL component', () => {
    expect(parent).toContain('value="nsat"')
    expect(parent).toContain("import SatelliteCountChart from './SatelliteCountChart.vue'")
    expect(parent).toContain('<SatelliteCountChart')
    expect(parent).toContain(':sliding-window="nsatSlidingWindow"')
  })

  it('shows explicit latest-40 and all-data controls and defaults to all data', () => {
    expect(parent).toContain('class="nsat-window-switch"')
    expect(parent).toContain('@click="setNsatSlidingWindow(true)"')
    expect(parent).toContain('@click="setNsatSlidingWindow(false)"')
    expect(parent).toContain('const nsatSlidingWindow = ref(false)')
    expect(parent).toContain('flex-wrap: wrap')
  })

  it('keeps the satellite-history clear control', () => {
    expect(parent).toContain('clearSatelliteEpochHistory')
    expect(parent).toContain('@click="clearNsatHistory"')
    expect(parent).toContain('.nsat-controls {')
    expect(parent).toContain('margin-left: auto')
  })

  it('uses a custom WebGL time-series renderer instead of ECharts bars', () => {
    expect(chart).toContain('createSatelliteTimeSeriesRenderer')
    expect(chart).toContain('renderer.setSeriesData')
    expect(chart).toContain('renderer.render()')
    expect(chart).not.toContain("type: 'bar'")
    expect(chart).not.toContain('barGap')
    expect(chart).not.toContain("stack: 'nsat'")
  })

  it('draws six constellation lines and the total as overlapping series', () => {
    for (const constellation of ['GPS', 'GLONASS', 'BEIDOU', 'GALILEO', 'QZSS', 'OTHER']) {
      expect(chart).toContain(`id: '${constellation}'`)
    }
    expect(chart).toContain("renderer.addSeries('TOTAL'")
    expect(chart).toContain('...constellationSeries')
  })

  it('renders every recent epoch and applies LOD only to large viewports', () => {
    expect(chart).toContain('props.slidingWindow')
    expect(chart).toContain('createInitialSatelliteCountViewport')
    expect(chart).toContain('fitSatelliteCountViewport(satelliteEpochHistory.value.length)')
    expect(chart).toContain('store.extractSeries')
    expect(chart).toContain('Math.max(64, Math.floor(width * 2))')
    expect(chart).not.toContain('NSAT_MAX_SAMPLES')
  })

  it('supports full-history zoom, pan, fit, and epoch tooltip', () => {
    expect(chart).toContain('@wheel.prevent="handleWheel"')
    expect(chart).toContain('@dblclick="fitOverview"')
    expect(chart).toContain('zoomSatelliteCountViewport')
    expect(chart).toContain('panSatelliteCountViewport')
    expect(chart).toContain('hoverIndex.value = index')
    expect(chart).toContain('store.getSample')
  })

  it('schedules rendering and responds to resize and theme changes', () => {
    expect(chart).toContain('requestAnimationFrame')
    expect(chart).toContain('const OVERVIEW_RENDER_INTERVAL_MS = 1_000')
    expect(chart).toContain('scheduleRender(false)')
    expect(chart).toContain('ResizeObserver')
    expect(chart).toContain('watch(resolvedTheme')
  })

  it('disposes renderer and observers on unmount', () => {
    expect(chart).toContain('renderer?.dispose()')
    expect(chart).toContain('resizeObserver?.disconnect()')
    expect(chart).toContain('cancelAnimationFrame(renderFrame)')
  })

  it('shows the shared file-timeline cursor and follows it in latest-40 mode', () => {
    expect(chart).toContain('useFileTimeline')
    expect(chart).toContain('store.findNearestElapsedTime(fileTimeline.elapsedMilliseconds.value)')
    expect(chart).toContain('cursorIndex - 39')
  })
})
