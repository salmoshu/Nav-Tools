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
    expect(source).toContain('label="table"')
    expect(source).toContain('label="chart"')
  })

  it('adds SNR reference lines at 25/35/45 dB', () => {
    expect(source).toContain('markLine')
    expect(source).toContain('yAxis: 25')
    expect(source).toContain('yAxis: 35')
    expect(source).toContain('yAxis: 45')
  })

  it('shows PRN, constellation, elevation, azimuth and SNR in tooltip', () => {
    expect(source).toContain('data.prn')
    expect(source).toContain('data.constellation')
    expect(source).toContain('data.elevation')
    expect(source).toContain('data.azimuth')
    expect(source).toContain('data.value')
  })

  it('filters chart data by constellation', () => {
    expect(source).toContain('constellationFilter')
    expect(source).toContain("sat.constellation === constellationFilter.value")
  })

  it('adapts chart size to container', () => {
    expect(source).toContain('ResizeObserver')
    expect(source).toContain('chartInstance.value.resize()')
  })

  it('defers chart recreation until theme controls have painted', () => {
    expect(source).toContain('watch(resolvedTheme, scheduleThemeRefresh)')
    expect(source.match(/themeRefreshRaf = requestAnimationFrame/g)).toHaveLength(2)
  })
})

describe('GNSS signal NSat (satellite count) view', () => {
  const source = readFileSync('src/components/windows/gnss/GnssSignal.vue', 'utf8')

  it('provides a third radio option for the NSat view', () => {
    expect(source).toContain('label="nsat"')
    expect(source).toContain('卫星数目')
    expect(source).toContain("v-show=\"currentView === 'nsat'\"")
  })

  it('tracks the six constellations including QZSS', () => {
    expect(source).toContain("'GPS', 'GLONASS', 'BEIDOU', 'GALILEO', 'QZSS', 'OTHER'")
  })

  it('renders overlapping constellation bar series with largest at back', () => {
    expect(source).toContain("type: 'bar'")
    // 各星座独立从 0 起绘制并完全重叠，不再堆叠
    expect(source).toContain("barGap: '-100%'")
    expect(source).not.toContain("stack: 'nsat'")
    // 卫星数最多的星座置于底层（最小 z），动态分配见 updateNsatChart
    expect(source).toContain('zMap')
  })

  it('uses GPS/UTC time from NMEA currentData for X axis labels without local fallback', () => {
    expect(source).toContain('currentData')
    expect(source).toContain('currentData.value.time')
    expect(source).toContain('formatNsatGpsTime')
    expect(source).toContain('lastNsatGpsTime')
    // NMEA 时间暂缺时跳过采样，不回退本地时间
    expect(source).toContain('if (!rawGpsTime) return')
  })

  it('overlays a non-stacked total line series across all constellations', () => {
    expect(source).toContain("type: 'line'")
    expect(source).toContain("NSAT_TOTAL_SERIES_NAME = '总数'")
    // 总数折线使用主题前景色，与星座配色区分
    expect(source).toContain('color: colors.text')
    // 每根柱子顶端显示该星座的卫星数
    expect(source).toContain("position: 'top'")
    // 总数折线置于最上层，不参与重叠柱
    const lineBlock = source.slice(source.indexOf("type: 'line'"))
    expect(lineBlock.slice(0, 400)).not.toContain("stack: 'nsat'")
    // legend 与 tooltip 均包含总数
    expect(source).toContain('[...nsatConstellations, NSAT_TOTAL_SERIES_NAME]')
    expect(source).toContain('总数')
  })

  it('renders the total line without smoothing on the shared y-axis', () => {
    // 单 Y 轴：柱状图与总数折线共享左轴
    expect(source).toContain("name: '卫星数'")
    expect(source).not.toContain("name: '卫星总数'")
    expect(source).not.toContain('yAxisIndex')
    // 总数折线不平滑
    expect(source).not.toContain('smooth: true')
  })

  it('hides per-bar count labels when visible column count exceeds 40, leaving tooltip on hover', () => {
    // 显示列数 > 40 时关闭柱顶数字标签
    expect(source).toContain('NSAT_LABEL_COL_THRESHOLD = 40')
    expect(source).toContain('visible.length <= NSAT_LABEL_COL_THRESHOLD')
    expect(source).toContain('label: { show: showLabels }')
    // 悬停时由 axis tooltip 显示各星座与总数
    expect(source).toContain("trigger: 'axis'")
  })

  it('uses canvas renderer for both charts to handle large datasets efficiently', () => {
    // canvas 渲染器：大量数据点(600×6)时性能远优于 SVG
    expect(source).toContain("renderer: 'canvas'")
    // 不再使用 SVG 渲染器
    expect(source).not.toContain("renderer: 'svg'")
  })

  it('enables large mode when columns exceed the label threshold for rendering performance', () => {
    // 列数 > 40 时开启 large 模式（与标签显示互斥）
    expect(source).toContain('const largeMode = !showLabels')
    expect(source).toContain('large: largeMode')
  })

  it('uses cross axis pointer with confine for reliable tooltip on overlapping bars', () => {
    // canvas 渲染器下 cross 指示器能可靠命中所有重叠 series
    expect(source).toContain("type: 'cross'")
    expect(source).toContain('confine: true')
  })

  it('formats y-axis pointer label as integer since satellite counts are integers', () => {
    // 卫星数目为整数，Y 轴指示器标签格式化为整数，避免出现小数
    expect(source).toContain('precision: 0')
  })

  it('shows satellite total in the axis tooltip on hover', () => {
    // tooltip formatter 从 nsatHistory 按 X 轴标签查找采样，确保总数可靠
    expect(source).toContain('nsatHistory.value.find')
    expect(source).toContain('axisValue')
    expect(source).toContain('NSAT_TOTAL_SERIES_NAME')
    // tooltip 末尾展示卫星总数
    expect(source).toContain('卫星总数')
    expect(source).toContain('${total}')
  })

  it('shows total count label above the total line when columns are few', () => {
    // 总数折线上方显示数字标签，与柱状图标签同步开关
    expect(source).toContain("name: NSAT_TOTAL_SERIES_NAME")
    expect(source).toContain("position: 'top'")
    expect(source).toContain('formatter: (params) => (params.value > 0 ? String(params.value)')
  })

  it('places NSat sliding-window and clear buttons on the right side', () => {
    // 滑窗与清除按钮通过 margin-left:auto 推到右侧，避免与视图切换混淆
    expect(source).toContain('.nsat-controls {')
    expect(source).toContain('margin-left: auto')
  })

  it('provides a clear button for NSat history', () => {
    expect(source).toContain('clearNsatHistory')
    expect(source).toContain('@click="clearNsatHistory"')
  })

  it('skips the first sample after clear to avoid drawing current epoch immediately', () => {
    // 清除后设置 nsatCleared 标记，下次 sampleNsat 将当前 GPS 时间记为基准并跳过
    expect(source).toContain('nsatCleared')
    expect(source).toContain('nsatCleared = true')
    // sampleNsat 中检测到清除标记时跳过采样
    expect(source).toContain('if (nsatCleared)')
    expect(source).toContain('nsatCleared = false')
  })

  it('toggles a sliding window between latest 40 epochs and full history', () => {
    expect(source).toContain('nsatSlidingWindow')
    expect(source).toContain('toggleNsatSlidingWindow')
    expect(source).toContain('nsatSlidingWindow.value')
  })

  it('shows only the latest 40 epochs via a fixed sliding window', () => {
    expect(source).toContain('NSAT_WINDOW_SIZE = 40')
    expect(source).toContain('history.slice(visibleStart, visibleEnd)')
  })

  it('uses incremental append for sliding window to optimize realtime performance', () => {
    // 滑窗满后仅 shift + append，不全量重建 series.data
    expect(source).toContain('canAppend')
    expect(source).toContain('nsatRenderedWindow')
    expect(source).toContain('currentTimes.shift()')
    expect(source).toContain('arr.push(latest.counts[name]')
    // z 排序变化时才全量更新
    expect(source).toContain('nsatLastZOrder')
    expect(source).toContain('zChanged')
  })

  it('keeps a rolling history capped at 600 samples', () => {
    expect(source).toContain('nsatHistory')
    expect(source).toContain('NSAT_MAX_SAMPLES = 600')
  })

  it('disposes NSat chart resources on unmount', () => {
    expect(source).toContain('nsatChartInstance.value.dispose()')
    expect(source).toContain('clearInterval(nsatSampleTimer)')
    expect(source).toContain('nsatResizeObserver.disconnect()')
  })
})
