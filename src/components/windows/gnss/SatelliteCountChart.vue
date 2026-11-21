<template>
  <div
    ref="containerRef"
    class="satellite-count-chart"
    :data-renderer="rendererKind"
    @wheel.prevent="handleWheel"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
    @mousedown="handleMouseDown"
    @dblclick="fitOverview"
    @contextmenu.prevent
  >
    <canvas ref="plotCanvasRef" class="satellite-count-plot"></canvas>
    <canvas ref="axisCanvasRef" class="satellite-count-axis"></canvas>

    <div class="satellite-count-legend">
      <span
        v-for="series in displaySeries"
        :key="series.id"
        class="legend-item"
        :class="{
          'legend-item--total': series.id === 'TOTAL',
          'legend-item--hidden': hiddenSeries.has(series.id),
        }"
        role="button"
        tabindex="0"
        :aria-pressed="hiddenSeries.has(series.id)"
        :title="t('gnss.signal.legendToggle')"
        @click="toggleSeries(series.id)"
        @keydown.enter.prevent="toggleSeries(series.id)"
      >
        <i :style="{ backgroundColor: series.color }"></i>{{ series.label }}
        <strong
          v-if="scopedDisplay?.signals && series.id === 'TOTAL' && currentCount !== null"
          class="legend-current"
          >{{ currentCount }}</strong
        >
      </span>
    </div>

    <div v-if="hoverSample" class="satellite-count-tooltip" :style="tooltipStyle">
      <div class="tooltip-title">{{ hoverSample.time }}</div>
      <template v-if="hasGsvData">
        <div v-for="series in tooltipConstellationSeries" :key="series.id" class="tooltip-row">
          <span class="tooltip-name">
            <i :style="{ backgroundColor: series.color }"></i>{{ series.label }}
          </span>
          <strong>{{ hoverSample.counts[series.id] ?? '—' }}</strong>
        </div>
      </template>
      <div class="tooltip-row tooltip-total">
        <span>{{ t(hasGsvData ? 'gnss.signal.nsatTotal' : 'gnss.signal.nsatUsed') }}</span>
        <strong>{{ hoverSample.total }}</strong>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useNmea } from '@/composables/gnss/useNmea'
import { gnssDisplayContext } from '@/composables/gnss/GnssDisplayContext'
import { useFileTimeline } from '@/composables/useFileTimeline'
import { useTheme } from '@/composables/useTheme'
import { t } from '@/i18n'
import {
  createInitialSatelliteCountViewport,
  fitSatelliteCountViewport,
  panSatelliteCountViewport,
  panTimeSeriesRange,
  TIME_SERIES_WHEEL_ZOOM_IN_FACTOR,
  TIME_SERIES_WHEEL_ZOOM_OUT_FACTOR,
  updateSatelliteCountViewportOnData,
  zoomSatelliteCountViewport,
  type SatelliteCountViewport,
} from '@/core/gnss/SatelliteCountViewport'
import { CanvasSatelliteTimeSeriesRenderer } from '@/core/render/SatelliteTimeSeriesRenderer'
import type {
  SatelliteRendererKind,
  SatelliteSeriesColor,
  SatelliteTimeSeriesRenderer,
} from '@/core/render/SatelliteTimeSeriesRenderer'

const props = defineProps<{
  active: boolean
  slidingWindow: boolean
}>()

const scopedDisplay = inject(gnssDisplayContext, null)
const {
  satelliteEpochHistory,
  satelliteCountEpochHistory: satelliteCountHistory,
  hasGsvData,
  satelliteCountSource,
} = scopedDisplay?.signals ?? useNmea()
const fileTimeline = scopedDisplay?.timeline ?? useFileTimeline()
const { chartTheme, resolvedTheme } = useTheme()

const containerRef = ref<HTMLDivElement | null>(null)
const plotCanvasRef = ref<HTMLCanvasElement | null>(null)
const axisCanvasRef = ref<HTMLCanvasElement | null>(null)
const rendererKind = ref<SatelliteRendererKind>('canvas')
const hoverSample = ref<{
  time: string
  total: number | null
  counts: Record<string, number>
} | null>(null)
const hoverIndex = ref<number | null>(null)
const tooltipStyle = ref<Record<string, string>>({})

let renderer: SatelliteTimeSeriesRenderer | null = null
let axisContext: CanvasRenderingContext2D | null = null
let resizeObserver: ResizeObserver | null = null
let renderFrame: number | null = null
let overviewRenderTimer: ReturnType<typeof setTimeout> | null = null
let lastOverviewRenderAt = 0
let renderedYMax = 5
let renderedYMin = 0
let previousLength = 0
let isDragging = false
/** 右键 x 伸缩拖拽（锚定按下点历元，向右拖放大）——与速度图同款 */
let isXZoomDragging = false
let xZoomAnchor = 0
let dragStartX = 0
let dragStartY = 0
let dragStartViewport: SatelliteCountViewport = { start: 0, end: 0 }
let dragStartRange = { min: 0, max: 5 }
/** 滚轮/拖拽产生的 y 轴手动范围（锚定光标值伸缩）；null=自动范围，dblclick 复位 */
let yRangeOverride: { min: number; max: number } | null = null

function currentYRange(): { min: number; max: number } {
  if (yRangeOverride && yRangeOverride.max > yRangeOverride.min) return yRangeOverride
  return { min: 0, max: renderedYMax }
}

const layout = {
  left: 56,
  right: 20,
  top: 56,
  bottom: 42,
}

const OVERVIEW_RENDER_INTERVAL_MS = 1_000

/** x 视口越界余量（与速度图 GnssMetricTimeSeries 一致）：允许视口两端越出数据
 * 边缘半个窗宽，左右端点因此能继续拖到画面中部，不会在数据边缘卡死。 */
const X_EDGE_OVERSCAN_RATIO = 0.5

// 星座颜色与星空图（GnssSky.constellationColors）保持一致，
// 同一星座在两个视图中的曲线/散点颜色统一；OTHER 收容 SBS/IRN 等其余系统，
// 取星空图 UNKNOWN 灰。
const constellationSeries = [
  { id: 'GPS', label: 'GPS', color: '#BADC7E' },
  { id: 'GLONASS', label: 'GLONASS', color: '#9DA007' },
  { id: 'BEIDOU', label: 'BEIDOU', color: '#FF8A80' },
  { id: 'GALILEO', label: 'GALILEO', color: '#82C3E5' },
  { id: 'QZSS', label: 'QZSS', color: '#AF52DE' },
  { id: 'OTHER', label: 'OTHER', color: '#757575' },
] as const

const fallbackSeriesLabel = computed(
  () =>
    `${satelliteCountSource.value === 'rtklib-pos' ? 'RTKLIB POS ns' : 'GGA'} · ${t('gnss.signal.nsatUsed')}`,
)

const visibleConstellationSeries = computed(() => {
  if (!hasGsvData.value) return []
  const store = satelliteEpochHistory.value
  if (store.length === 0) return []
  const sample = store.getSample(store.length - 1)
  return constellationSeries.filter((series) => (sample.counts[series.id] ?? 0) > 0)
})

const tooltipConstellationSeries = computed(() => {
  const sample = hoverSample.value
  if (!sample) return visibleConstellationSeries.value
  return constellationSeries.filter((series) => (sample.counts[series.id] ?? 0) > 0)
})

const displaySeries = computed(() => [
  ...visibleConstellationSeries.value,
  {
    id: 'TOTAL',
    label: hasGsvData.value ? t('gnss.signal.total') : fallbackSeriesLabel.value,
    color: chartTheme.value.text,
  },
])

/** 图例点击隐藏的系列；渲染器 setSeriesVisible 按系列显隐，TOTAL 同样可切 */
const hiddenSeries = ref(new Set<string>())

function toggleSeries(id: string): void {
  const next = new Set(hiddenSeries.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  hiddenSeries.value = next
  renderer?.setSeriesVisible(id, !next.has(id))
  // setSeriesVisible 只改状态不触发绘制，需主动调度一帧重绘
  scheduleRender()
}

/** 渲染器重建（初始化/主题刷新）后恢复用户的隐藏选择 */
function applySeriesVisibility(): void {
  for (const id of hiddenSeries.value) renderer?.setSeriesVisible(id, false)
}

function currentHistory() {
  return hasGsvData.value ? satelliteEpochHistory.value : satelliteCountHistory.value
}

function currentTimelineIndex(store: ReturnType<typeof currentHistory>): number {
  const elapsed = scopedDisplay?.signals
    ? fileTimeline.elapsedFor(store)
    : fileTimeline.elapsedMilliseconds.value
  return store.findNearestElapsedTime(elapsed)
}

const currentCount = computed(() => {
  const store = currentHistory()
  if (!store.length) return null
  const index = fileTimeline.active.value ? currentTimelineIndex(store) : store.length - 1
  if (index < 0) return null
  if (hasGsvData.value) {
    const sample = satelliteEpochHistory.value.getSample(index)
    return sample.complete ? sample.total : null
  }
  return satelliteCountHistory.value.getValue('SATS_USED', index)
})

const viewport = ref<SatelliteCountViewport>(
  props.slidingWindow
    ? createInitialSatelliteCountViewport(currentHistory().length)
    : fitSatelliteCountViewport(currentHistory().length),
)

function hexToRgba(color: string): SatelliteSeriesColor {
  const value = color.replace('#', '')
  const normalized =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value
  return [
    parseInt(normalized.slice(0, 2), 16) / 255,
    parseInt(normalized.slice(2, 4), 16) / 255,
    parseInt(normalized.slice(4, 6), 16) / 255,
    1,
  ]
}

function niceYMax(value: number): number {
  const safe = Math.max(1, value)
  const step = safe <= 20 ? 5 : safe <= 50 ? 10 : 20
  return Math.max(step, Math.ceil(safe / step) * step)
}

function currentPlotSize() {
  const container = containerRef.value
  if (!container) return { width: 0, height: 0 }
  return {
    width: Math.max(1, container.clientWidth - layout.left - layout.right),
    height: Math.max(1, container.clientHeight - layout.top - layout.bottom),
  }
}

function resizeLayers(): void {
  const container = containerRef.value
  const plotCanvas = plotCanvasRef.value
  const axisCanvas = axisCanvasRef.value
  if (!container || !plotCanvas || !axisCanvas || !renderer) return

  const { width, height } = currentPlotSize()
  plotCanvas.style.left = `${layout.left}px`
  plotCanvas.style.top = `${layout.top}px`
  renderer.resize(width, height)

  const dpr = window.devicePixelRatio || 1
  axisCanvas.width = Math.max(1, Math.round(container.clientWidth * dpr))
  axisCanvas.height = Math.max(1, Math.round(container.clientHeight * dpr))
  axisCanvas.style.width = `${container.clientWidth}px`
  axisCanvas.style.height = `${container.clientHeight}px`
  scheduleRender()
}

function initRenderer(): void {
  if (!plotCanvasRef.value) return
  renderer?.dispose()
  renderer = new CanvasSatelliteTimeSeriesRenderer()
  renderer.init(plotCanvasRef.value)
  rendererKind.value = renderer.kind

  for (const series of constellationSeries) {
    renderer.addSeries(series.id, hexToRgba(series.color))
  }
  renderer.addSeries('TOTAL', hexToRgba(chartTheme.value.text))
  renderer.setLineWidth(4.4)
  applySeriesVisibility()
  resizeLayers()
}

function renderChart(): void {
  renderFrame = null
  lastOverviewRenderAt = performance.now()
  if (!props.active || !renderer || document.hidden) return

  const store = currentHistory()
  const length = store.length
  if (length === 0) {
    renderer.clear()
    renderer.render()
    renderedYMax = 5
    drawAxes(0, 5)
    return
  }

  const start = Math.max(0, Math.floor(viewport.value.start))
  const replayEndExclusive =
    fileTimeline.active.value && fileTimeline.mode.value === 'replay'
      ? currentTimelineIndex(store) + 1
      : length
  const endExclusive = Math.min(
    replayEndExclusive,
    Math.max(start + 1, Math.ceil(viewport.value.end)),
  )
  if (endExclusive <= start) {
    renderer.clear()
    renderer.render()
    renderedYMax = 5
    drawAxes(0, 5)
    return
  }
  const end = endExclusive - 1
  const { width } = currentPlotSize()
  const maxPoints = Math.max(64, Math.floor(width * 2))

  let total: { points: number[]; segments: number[] }
  let yMax: number
  if (hasGsvData.value) {
    const gsvStore = satelliteEpochHistory.value
    for (const series of constellationSeries) {
      const extracted = gsvStore.extractSeries(series.id, start, end, maxPoints)
      renderer.setSeriesData(
        series.id,
        new Float32Array(extracted.points),
        new Uint32Array(extracted.segments),
      )
      renderer.setSeriesColor(series.id, hexToRgba(series.color))
    }
    total = gsvStore.extractSeries('TOTAL', start, end, maxPoints)
    yMax = niceYMax(gsvStore.getRangeMax('TOTAL', start, end))
  } else {
    for (const series of constellationSeries) {
      renderer.setSeriesData(series.id, new Float32Array(), new Uint32Array())
    }
    total = satelliteCountHistory.value.extractSeries('SATS_USED', start, end, maxPoints)
    yMax = niceYMax(satelliteCountHistory.value.getRange('SATS_USED', start, end)?.max ?? 0)
  }
  renderer.setSeriesData('TOTAL', new Float32Array(total.points), new Uint32Array(total.segments))
  renderer.setSeriesColor('TOTAL', hexToRgba(chartTheme.value.text))
  // 手动 y 范围（滚轮/拖拽）优先；卫星数非负，下限钳到 0
  let yMin = 0
  let yMaxFinal = yMax
  if (yRangeOverride && yRangeOverride.max > yRangeOverride.min) {
    yMin = Math.max(0, yRangeOverride.min)
    yMaxFinal = Math.max(yMin + 1e-6, yRangeOverride.max)
  }
  renderedYMin = yMin
  renderedYMax = yMaxFinal
  renderer.setViewport(
    viewport.value.start - 0.5,
    Math.max(viewport.value.start + 0.5, viewport.value.end - 0.5),
    yMin,
    yMaxFinal,
  )
  renderer.render()
  drawAxes(yMin, yMaxFinal)
}

function scheduleRender(immediate = true): void {
  if (renderFrame !== null) return

  if (!immediate && !props.slidingWindow) {
    const elapsed = performance.now() - lastOverviewRenderAt
    const remaining = OVERVIEW_RENDER_INTERVAL_MS - elapsed
    if (remaining > 0) {
      if (overviewRenderTimer === null) {
        overviewRenderTimer = setTimeout(() => {
          overviewRenderTimer = null
          scheduleRender()
        }, remaining)
      }
      return
    }
  }

  if (overviewRenderTimer !== null) {
    clearTimeout(overviewRenderTimer)
    overviewRenderTimer = null
  }
  renderFrame = requestAnimationFrame(renderChart)
}

function drawAxes(yMin: number, yMax: number): void {
  const canvas = axisCanvasRef.value
  const context = axisContext
  const store = currentHistory()
  if (!canvas || !context || !containerRef.value) return

  const dpr = window.devicePixelRatio || 1
  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight
  const plotWidth = Math.max(1, width - layout.left - layout.right)
  const plotHeight = Math.max(1, height - layout.top - layout.bottom)
  const colors = chartTheme.value

  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, width, height)
  context.font = '11px sans-serif'
  context.lineWidth = 1
  context.setLineDash([3, 4])

  for (let tick = 0; tick <= 5; tick += 1) {
    const ratio = tick / 5
    const y = layout.top + plotHeight * (1 - ratio)
    context.strokeStyle = colors.grid
    context.beginPath()
    context.moveTo(layout.left, y)
    context.lineTo(layout.left + plotWidth, y)
    context.stroke()
    context.fillStyle = colors.textMuted
    context.textAlign = 'right'
    context.textBaseline = 'middle'
    context.fillText(String(Math.round(yMin + (yMax - yMin) * ratio)), layout.left - 8, y)
  }

  context.setLineDash([])
  context.strokeStyle = colors.border
  context.beginPath()
  context.moveTo(layout.left, layout.top)
  context.lineTo(layout.left, layout.top + plotHeight)
  context.lineTo(layout.left + plotWidth, layout.top + plotHeight)
  context.stroke()
  context.fillStyle = colors.textMuted
  context.textAlign = 'right'
  context.textBaseline = 'top'
  context.fillText(t('gnss.signal.nsatYAxis'), layout.left - 8, layout.top - 32)

  if (store.length > 0 && viewport.value.end > viewport.value.start) {
    for (let tick = 0; tick <= 4; tick += 1) {
      const ratio = tick / 4
      const epoch = Math.max(
        0,
        Math.min(
          store.length - 1,
          Math.round(
            viewport.value.start + ratio * (viewport.value.end - viewport.value.start - 1),
          ),
        ),
      )
      const x = layout.left + plotWidth * ratio
      context.fillStyle = colors.textMuted
      context.textAlign = tick === 0 ? 'left' : tick === 4 ? 'right' : 'center'
      context.textBaseline = 'top'
      context.fillText(store.formatTime(epoch), x, layout.top + plotHeight + 10)
    }

    if (fileTimeline.active.value) {
      const cursorIndex = currentTimelineIndex(store)
      if (cursorIndex >= viewport.value.start && cursorIndex < viewport.value.end) {
        const ratio =
          (cursorIndex + 0.5 - viewport.value.start) /
          Math.max(1, viewport.value.end - viewport.value.start)
        const x = layout.left + ratio * plotWidth
        const sample = hasGsvData.value ? satelliteEpochHistory.value.getSample(cursorIndex) : null
        const count = sample
          ? sample.complete
            ? sample.total
            : null
          : satelliteCountHistory.value.getValue('SATS_USED', cursorIndex)

        context.strokeStyle = '#409eff'
        context.lineWidth = 1.5
        context.beginPath()
        context.moveTo(x, layout.top)
        context.lineTo(x, layout.top + plotHeight)
        context.stroke()

        if (count !== null) {
          const y = layout.top + plotHeight * (1 - Math.min(1, count / Math.max(1, yMax)))
          context.fillStyle = '#409eff'
          context.strokeStyle = '#ffffff'
          context.lineWidth = 1.5
          context.beginPath()
          context.arc(x, y, 4, 0, Math.PI * 2)
          context.fill()
          context.stroke()
        }
      }
    }
  }

  if (hoverSample.value && hoverIndex.value !== null) {
    if (hoverIndex.value >= 0) {
      const ratio =
        (hoverIndex.value - viewport.value.start) /
        Math.max(1, viewport.value.end - viewport.value.start)
      const x = layout.left + ratio * plotWidth
      context.strokeStyle = colors.textMuted
      context.beginPath()
      context.moveTo(x, layout.top)
      context.lineTo(x, layout.top + plotHeight)
      context.stroke()
    }
  }
}

function fitOverview(): void {
  if (props.slidingWindow) return
  viewport.value = fitSatelliteCountViewport(currentHistory().length)
  yRangeOverride = null
  renderedYMin = 0
  hoverSample.value = null
  hoverIndex.value = null
  scheduleRender()
}

/** 滚轮 y 伸缩的跨度限制：最小 1 颗卫星、最大 1000，防止无限伸缩 */
const Y_ZOOM_MIN_SPAN = 1
const Y_ZOOM_MAX_SPAN = 1000

/** 滚轮：本图 y 轴伸缩，锚定光标处的数值（与速度图同款），跨度钳制在限值内 */
function handleWheel(event: WheelEvent): void {
  if (props.slidingWindow || currentHistory().length === 0) return
  const container = containerRef.value
  if (!container) return
  const rect = container.getBoundingClientRect()
  const localY = event.clientY - rect.top - layout.top
  const { height } = currentPlotSize()
  const ratio = Math.max(0, Math.min(1, 1 - localY / Math.max(1, height)))
  const range = currentYRange()
  const anchorValue = range.min + ratio * (range.max - range.min)
  const factor =
    event.deltaY > 0 ? TIME_SERIES_WHEEL_ZOOM_OUT_FACTOR : TIME_SERIES_WHEEL_ZOOM_IN_FACTOR
  let min = anchorValue - (anchorValue - range.min) * factor
  let max = anchorValue + (range.max - anchorValue) * factor
  const span = max - min
  const clampedSpan = Math.min(Y_ZOOM_MAX_SPAN, Math.max(Y_ZOOM_MIN_SPAN, span))
  if (clampedSpan !== span) {
    // 超限时以锚点为心收放/放大到限值，保持锚定语义
    const scale = clampedSpan / span
    min = anchorValue - (anchorValue - min) * scale
    max = anchorValue + (max - anchorValue) * scale
  }
  yRangeOverride = { min, max }
  hoverSample.value = null
  hoverIndex.value = null
  scheduleRender()
}

/** 左键平移（x + y）/ 右键 x 伸缩按下：记录起点，右键额外记录锚点历元 */
function handleMouseDown(event: MouseEvent): void {
  if (props.slidingWindow) return
  if (event.button === 2) {
    const store = currentHistory()
    const container = containerRef.value
    if (!container || store.length < 2) return
    const rect = container.getBoundingClientRect()
    const localX = event.clientX - rect.left - layout.left
    const ratio = Math.max(0, Math.min(1, localX / currentPlotSize().width))
    isXZoomDragging = true
    dragStartX = event.clientX
    dragStartViewport = { ...viewport.value }
    xZoomAnchor =
      dragStartViewport.start + ratio * (dragStartViewport.end - dragStartViewport.start)
    return
  }
  if (event.button !== 0) return
  isDragging = true
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragStartViewport = { ...viewport.value }
  dragStartRange = currentYRange()
}

function handleWindowMouseMove(event: MouseEvent): void {
  if (isXZoomDragging) {
    const store = currentHistory()
    if (store.length < 2) return
    // 向右拖放大（时间窗变窄），向左拖缩小；以按下点为锚（与速度图同款）
    const dx = event.clientX - dragStartX
    const factor = Math.pow(2, -dx / 160)
    viewport.value = zoomSatelliteCountViewport(
      dragStartViewport,
      xZoomAnchor,
      factor,
      store.length,
      undefined,
      X_EDGE_OVERSCAN_RATIO,
    )
    hoverSample.value = null
    hoverIndex.value = null
    scheduleRender()
    return
  }
  if (!isDragging) return
  const span = dragStartViewport.end - dragStartViewport.start
  const delta = -((event.clientX - dragStartX) / currentPlotSize().width) * span
  const deltaY =
    ((event.clientY - dragStartY) / currentPlotSize().height) *
    Math.max(Number.EPSILON, dragStartRange.max - dragStartRange.min)
  yRangeOverride = panTimeSeriesRange(dragStartRange, deltaY, 0)
  viewport.value = panSatelliteCountViewport(
    dragStartViewport,
    delta,
    currentHistory().length,
    undefined,
    X_EDGE_OVERSCAN_RATIO,
  )
  hoverSample.value = null
  hoverIndex.value = null
  scheduleRender()
}

function handleWindowMouseUp(): void {
  isDragging = false
  isXZoomDragging = false
}

function handleMouseMove(event: MouseEvent): void {
  if (isDragging) return
  const container = containerRef.value
  const store = currentHistory()
  if (!container || store.length === 0) return
  const rect = container.getBoundingClientRect()
  const { width, height } = currentPlotSize()
  const x = event.clientX - rect.left - layout.left
  const y = event.clientY - rect.top - layout.top
  if (x < 0 || x > width || y < 0 || y > height) {
    hoverSample.value = null
    hoverIndex.value = null
    scheduleRender()
    return
  }

  const ratio = x / width
  const index = Math.max(
    0,
    Math.min(
      store.length - 1,
      Math.round(viewport.value.start + ratio * (viewport.value.end - viewport.value.start - 1)),
    ),
  )
  hoverSample.value = hasGsvData.value
    ? { ...satelliteEpochHistory.value.getSample(index) }
    : {
        time: satelliteCountHistory.value.formatTime(index),
        total: satelliteCountHistory.value.getValue('SATS_USED', index),
        counts: {},
      }
  hoverIndex.value = index
  tooltipStyle.value = {
    left: `${Math.min(container.clientWidth - 190, x + layout.left + 14)}px`,
    top: `${Math.max(8, y + layout.top - 24)}px`,
  }
  drawAxes(renderedYMin, renderedYMax)
}

function handleMouseLeave(): void {
  if (!isDragging) {
    hoverSample.value = null
    hoverIndex.value = null
    scheduleRender()
  }
}

watch([satelliteEpochHistory, satelliteCountHistory], () => {
  const nextLength = currentHistory().length
  const wasFullOverview =
    !props.slidingWindow &&
    previousLength > 0 &&
    viewport.value.start <= 0.5 &&
    viewport.value.end >= previousLength - 0.5

  viewport.value = wasFullOverview
    ? fitSatelliteCountViewport(nextLength)
    : updateSatelliteCountViewportOnData(
        viewport.value,
        previousLength,
        nextLength,
        props.slidingWindow ? 'live' : 'overview',
        undefined,
        undefined,
        X_EDGE_OVERSCAN_RATIO,
      )
  previousLength = nextLength
  scheduleRender(false)
})

watch(hasGsvData, () => {
  const length = currentHistory().length
  previousLength = length
  viewport.value = props.slidingWindow
    ? createInitialSatelliteCountViewport(length)
    : fitSatelliteCountViewport(length)
  hoverSample.value = null
  hoverIndex.value = null
  scheduleRender()
})

watch(
  () => props.slidingWindow,
  (sliding) => {
    const store = currentHistory()
    if (sliding && fileTimeline.active.value) {
      const cursorIndex = currentTimelineIndex(store)
      viewport.value = {
        start: Math.max(0, cursorIndex - 39),
        end: Math.max(1, cursorIndex + 1),
      }
    } else {
      viewport.value = sliding
        ? createInitialSatelliteCountViewport(store.length)
        : fitSatelliteCountViewport(store.length)
    }
    hoverSample.value = null
    hoverIndex.value = null
    scheduleRender()
  },
)

watch(
  () => props.active,
  (active) => {
    if (!active) return
    nextTick(() => {
      resizeLayers()
      scheduleRender()
    })
  },
)

watch(resolvedTheme, () => scheduleRender())

watch([fileTimeline.active, fileTimeline.mode, fileTimeline.elapsedMilliseconds], () => {
  if (!props.active) return
  if (props.slidingWindow && fileTimeline.active.value) {
    const store = currentHistory()
    const cursorIndex = currentTimelineIndex(store)
    viewport.value = {
      start: Math.max(0, cursorIndex - 39),
      end: Math.max(1, cursorIndex + 1),
    }
    scheduleRender()
  } else {
    scheduleRender()
  }
})

onMounted(() => {
  previousLength = currentHistory().length
  axisContext = axisCanvasRef.value?.getContext('2d') ?? null
  initRenderer()
  resizeObserver = new ResizeObserver(resizeLayers)
  if (containerRef.value) resizeObserver.observe(containerRef.value)
  window.addEventListener('mousemove', handleWindowMouseMove)
  window.addEventListener('mouseup', handleWindowMouseUp)
})

onUnmounted(() => {
  if (renderFrame !== null) cancelAnimationFrame(renderFrame)
  if (overviewRenderTimer !== null) clearTimeout(overviewRenderTimer)
  resizeObserver?.disconnect()
  window.removeEventListener('mousemove', handleWindowMouseMove)
  window.removeEventListener('mouseup', handleWindowMouseUp)
  renderer?.dispose()
  renderer = null
  axisContext = null
})

// 供父组件（GnssSignal 重置布局按钮）触发 x 全览 + y 自动范围
defineExpose({ fitOverview })
</script>

<style scoped>
.satellite-count-chart {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  user-select: none;
  cursor: grab;
}

.satellite-count-chart:active {
  cursor: grabbing;
}

.satellite-count-plot,
.satellite-count-axis {
  position: absolute;
  display: block;
}

.satellite-count-axis {
  inset: 0;
  pointer-events: none;
  z-index: 2;
}

.satellite-count-plot {
  z-index: 1;
}

.satellite-count-legend {
  position: absolute;
  top: 10px;
  left: 56px;
  right: 20px;
  z-index: 3;
  display: flex;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--app-text-muted);
  font-size: 11px;
  pointer-events: none;
}

.legend-item,
.tooltip-name {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.legend-item {
  padding: 3px 7px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--app-surface-muted);
  line-height: 16px;
  /* 图例容器整体 pointer-events:none 防止遮挡图表交互，仅图例项恢复可点击 */
  pointer-events: auto;
  cursor: pointer;
  user-select: none;
}

.legend-item:hover {
  color: var(--app-text);
}

.legend-item--hidden {
  opacity: 0.45;
}

.legend-item--total {
  border-color: var(--app-border);
  color: var(--app-text);
  font-weight: 600;
}

.legend-current {
  color: var(--app-text);
  font-variant-numeric: tabular-nums;
}

.legend-item i,
.tooltip-name i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.satellite-count-tooltip {
  position: absolute;
  z-index: 4;
  width: 184px;
  padding: 12px;
  color: var(--app-text);
  background: var(--app-surface-raised);
  border: 1px solid var(--app-border);
  border-radius: 12px;
  box-shadow: 0 12px 32px var(--app-shadow);
  pointer-events: none;
  font-size: 12px;
}

.tooltip-title {
  padding-bottom: 6px;
  margin-bottom: 5px;
  border-bottom: 1px solid var(--app-border);
  font-weight: 700;
}

.tooltip-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 20px;
}

.tooltip-total {
  padding-top: 5px;
  margin-top: 4px;
  border-top: 1px solid var(--app-border);
}
</style>
