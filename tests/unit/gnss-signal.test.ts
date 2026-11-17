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

  it('places bar chart above table view in the view selector', () => {
    const chart = source.indexOf(
      '<el-option :label="t(\'gnss.signal.chartView\')" value="chart" />',
    )
    const table = source.indexOf(
      '<el-option :label="t(\'gnss.signal.tableView\')" value="table" />',
    )
    expect(chart).toBeGreaterThanOrEqual(0)
    expect(table).toBeGreaterThan(chart)
    expect(source).toContain("usePersistentSelection('gnss-signal:view', 'nsat'")
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

  it('does not freeze the status column so narrow windows can scroll past it', () => {
    expect(source).not.toContain('fixed="right"')
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
    expect(parent).toContain('clearSatelliteCountHistory')
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
    expect(chart).toContain('visibleConstellationSeries')
    expect(chart).toContain('(sample.counts[series.id] ?? 0) > 0')
  })

  it('matches the sky-plot constellation colors', () => {
    // 星座曲线颜色与星空图 GnssSky.constellationColors 保持一致（OTHER 取 UNKNOWN 灰）
    const sky = readFileSync('src/components/windows/gnss/GnssSky.vue', 'utf8')
    for (const [id, color] of [
      ['GPS', '#BADC7E'],
      ['GLONASS', '#9DA007'],
      ['GALILEO', '#82C3E5'],
      ['BEIDOU', '#FF8A80'],
      ['QZSS', '#AF52DE'],
    ] as const) {
      expect(sky).toContain(`${id}: '${color}'`)
      expect(chart).toContain(`{ id: '${id}', label: '${id}', color: '${color}' }`)
    }
    expect(sky).toContain("UNKNOWN: '#757575'")
    expect(chart).toContain("{ id: 'OTHER', label: 'OTHER', color: '#757575' }")
  })

  it('falls back to the GGA satellites-used total only when GSV is absent', () => {
    const nmea = readFileSync('src/composables/gnss/useNmea.ts', 'utf8')
    expect(chart).toContain(
      'hasGsvData.value ? satelliteEpochHistory.value : satelliteCountHistory.value',
    )
    expect(chart).toContain('...visibleConstellationSeries.value')
    expect(chart).toContain("extractSeries('SATS_USED'")
    expect(nmea).toContain('hasGsvData.value = true')
    expect(nmea).toContain("commitSatelliteCountEpoch(timeParts, data.satellites, 'gga')")
    expect(nmea).toContain(
      "commitSatelliteCountEpoch(solution.time, solution.satellites, 'rtklib-pos')",
    )
    expect(chart).toContain("satelliteCountSource.value === 'rtklib-pos'")
  })

  it('toggles constellation lines by clicking legend items', () => {
    // 自研 WebGL 渲染器不走 echarts：图例点击需自带显隐状态并调 setSeriesVisible
    expect(chart).toContain('@click="toggleSeries(series.id)"')
    expect(chart).toContain('const hiddenSeries = ref(new Set<string>())')
    expect(chart).toContain('renderer?.setSeriesVisible(id, !next.has(id))')
    // setSeriesVisible 不触发绘制，切换后必须主动调度重绘（否则要等下一次鼠标事件）
    expect(chart).toMatch(/function toggleSeries[\s\S]{0,400}scheduleRender\(\)/)
    // 渲染器重建后恢复隐藏选择
    expect(chart).toContain('function applySeriesVisibility()')
    // 图例容器 pointer-events:none，仅图例项恢复可点击
    expect(chart).toMatch(/\.legend-item\s*\{[\s\S]*?pointer-events:\s*auto/)
    expect(chart).toContain('.legend-item--hidden')
  })

  it('renders every recent epoch and applies LOD only to large viewports', () => {
    expect(chart).toContain('props.slidingWindow')
    expect(chart).toContain('createInitialSatelliteCountViewport')
    expect(chart).toContain('fitSatelliteCountViewport(currentHistory().length)')
    expect(chart).toContain('gsvStore.extractSeries')
    expect(chart).toContain('Math.max(64, Math.floor(width * 2))')
    expect(chart).not.toContain('NSAT_MAX_SAMPLES')
  })

  it('supports full-history zoom, pan, fit, and epoch tooltip', () => {
    expect(chart).toContain('@wheel.prevent="handleWheel"')
    expect(chart).toContain('@dblclick="fitOverview"')
    expect(chart).toContain('zoomSatelliteCountViewport')
    expect(chart).toContain('panSatelliteCountViewport')
    expect(chart).toContain('hoverIndex.value = index')
    expect(chart).toContain('satelliteEpochHistory.value.getSample(index)')
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
    expect(chart).toContain('currentTimelineIndex(store)')
    expect(chart).toContain('fileTimeline.elapsedFor(store)')
    expect(chart).toContain('cursorIndex - 39')
  })
})
