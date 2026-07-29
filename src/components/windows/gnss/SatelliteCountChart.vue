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
  >
    <canvas ref="plotCanvasRef" class="satellite-count-plot"></canvas>
    <canvas ref="axisCanvasRef" class="satellite-count-axis"></canvas>

    <div class="satellite-count-legend">
      <span v-for="series in displaySeries" :key="series.id" class="legend-item">
        <i :style="{ backgroundColor: series.color }"></i>{{ series.label }}
      </span>
    </div>

    <div v-if="hoverSample" class="satellite-count-tooltip" :style="tooltipStyle">
      <div class="tooltip-title">{{ hoverSample.time }}</div>
      <div v-for="series in constellationSeries" :key="series.id" class="tooltip-row">
        <span class="tooltip-name">
          <i :style="{ backgroundColor: series.color }"></i>{{ series.label }}
        </span>
        <strong>{{ hoverSample.counts[series.id] }}</strong>
      </div>
      <div class="tooltip-row tooltip-total">
        <span>{{ t('gnss.signal.nsatTotal') }}</span>
        <strong>{{ hoverSample.total }}</strong>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useNmea } from '@/composables/gnss/useNmea'
import { useFileTimeline } from '@/composables/useFileTimeline'
import { useTheme } from '@/composables/useTheme'
import { t } from '@/i18n'
import type { SatelliteEpochSample } from '@/core/gnss/SatelliteEpochAssembler'
import {
  createInitialSatelliteCountViewport,
  fitSatelliteCountViewport,
  panSatelliteCountViewport,
  updateSatelliteCountViewportOnData,
  zoomSatelliteCountViewport,
  type SatelliteCountViewport,
} from '@/core/gnss/SatelliteCountViewport'
import { createSatelliteTimeSeriesRenderer } from '@/core/render/createSatelliteTimeSeriesRenderer'
import type {
  SatelliteRendererKind,
  SatelliteSeriesColor,
  SatelliteTimeSeriesRenderer,
} from '@/core/render/SatelliteTimeSeriesRenderer'

const props = defineProps<{
  active: boolean
  slidingWindow: boolean
}>()

const { satelliteEpochHistory } = useNmea()
const fileTimeline = useFileTimeline()
const { chartTheme, resolvedTheme } = useTheme()

const containerRef = ref<HTMLDivElement | null>(null)
const plotCanvasRef = ref<HTMLCanvasElement | null>(null)
const axisCanvasRef = ref<HTMLCanvasElement | null>(null)
const rendererKind = ref<SatelliteRendererKind>('canvas')
const hoverSample = ref<SatelliteEpochSample | null>(null)
const hoverIndex = ref<number | null>(null)
const tooltipStyle = ref<Record<string, string>>({})

let renderer: SatelliteTimeSeriesRenderer | null = null
let axisContext: CanvasRenderingContext2D | null = null
let resizeObserver: ResizeObserver | null = null
let renderFrame: number | null = null
let overviewRenderTimer: ReturnType<typeof setTimeout> | null = null
let lastOverviewRenderAt = 0
let renderedYMax = 5
let previousLength = 0
let isDragging = false
let dragStartX = 0
let dragStartViewport: SatelliteCountViewport = { start: 0, end: 0 }

const layout = {
  left: 54,
  right: 18,
  top: 48,
  bottom: 40,
}

const OVERVIEW_RENDER_INTERVAL_MS = 1_000

const constellationSeries = [
  { id: 'GPS', label: 'GPS', color: '#52c41a' },
  { id: 'GLONASS', label: 'GLONASS', color: '#1890ff' },
  { id: 'BEIDOU', label: 'BEIDOU', color: '#faad14' },
  { id: 'GALILEO', label: 'GALILEO', color: '#13c2c2' },
  { id: 'QZSS', label: 'QZSS', color: '#722ed1' },
  { id: 'OTHER', label: 'OTHER', color: '#ff4d4f' },
] as const

const displaySeries = computed(() => [
  ...constellationSeries,
  {
    id: 'TOTAL',
    label: t('gnss.signal.total'),
    color: chartTheme.value.text,
  },
])

const viewport = ref<SatelliteCountViewport>(
  props.slidingWindow
    ? createInitialSatelliteCountViewport(satelliteEpochHistory.value.length)
    : fitSatelliteCountViewport(satelliteEpochHistory.value.length),
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
  renderer = createSatelliteTimeSeriesRenderer(plotCanvasRef.value)
  rendererKind.value = renderer.kind

  for (const series of constellationSeries) {
    renderer.addSeries(series.id, hexToRgba(series.color))
  }
  renderer.addSeries('TOTAL', hexToRgba(chartTheme.value.text))
  renderer.setLineWidth(1.5)
  resizeLayers()
}

function renderChart(): void {
  renderFrame = null
  lastOverviewRenderAt = performance.now()
  if (!props.active || !renderer || document.hidden) return

  const store = satelliteEpochHistory.value
  const length = store.length
  if (length === 0) {
    renderer.clear()
    renderer.render()
    renderedYMax = 5
    drawAxes(renderedYMax)
    return
  }

  const start = Math.max(0, Math.floor(viewport.value.start))
  const replayEndExclusive =
    fileTimeline.active.value && fileTimeline.mode.value === 'replay'
      ? store.findNearestElapsedTime(fileTimeline.elapsedMilliseconds.value) + 1
      : length
  const endExclusive = Math.min(
    replayEndExclusive,
    Math.max(start + 1, Math.ceil(viewport.value.end)),
  )
  if (endExclusive <= start) {
    renderer.clear()
    renderer.render()
    renderedYMax = 5
    drawAxes(renderedYMax)
    return
  }
  const end = endExclusive - 1
  const { width } = currentPlotSize()
  const maxPoints = Math.max(64, Math.floor(width * 2))

  for (const series of constellationSeries) {
    const extracted = store.extractSeries(series.id, start, end, maxPoints)
    renderer.setSeriesData(
      series.id,
      new Float32Array(extracted.points),
      new Uint32Array(extracted.segments),
    )
    renderer.setSeriesColor(series.id, hexToRgba(series.color))
  }

  const total = store.extractSeries('TOTAL', start, end, maxPoints)
  renderer.setSeriesData('TOTAL', new Float32Array(total.points), new Uint32Array(total.segments))
  renderer.setSeriesColor('TOTAL', hexToRgba(chartTheme.value.text))

  const yMax = niceYMax(store.getRangeMax('TOTAL', start, end))
  renderedYMax = yMax
  renderer.setViewport(
    viewport.value.start - 0.5,
    Math.max(viewport.value.start + 0.5, viewport.value.end - 0.5),
    0,
    yMax,
  )
  renderer.render()
  drawAxes(yMax)
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

function drawAxes(yMax: number): void {
  const canvas = axisCanvasRef.value
  const context = axisContext
  const store = satelliteEpochHistory.value
  if (!canvas || !context || !containerRef.value) return

  const dpr = window.devicePixelRatio || 1
  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight
  const plotWidth = Math.max(1, width - layout.left - layout.right)
  const plotHeight = Math.max(1, height - layout.top - layout.bottom)
  const colors = chartTheme.value

  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, width, height)
  context.font = '12px sans-serif'
  context.lineWidth = 1

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
    context.fillText(String(Math.round(yMax * ratio)), layout.left - 8, y)
  }

  context.strokeStyle = colors.border
  context.strokeRect(layout.left, layout.top, plotWidth, plotHeight)
  context.fillStyle = colors.text
  context.textAlign = 'left'
  context.textBaseline = 'top'
  context.fillText(t('gnss.signal.nsatYAxis'), 6, layout.top - 24)

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
      const cursorIndex = store.findNearestElapsedTime(fileTimeline.elapsedMilliseconds.value)
      if (cursorIndex >= viewport.value.start && cursorIndex < viewport.value.end) {
        const ratio =
          (cursorIndex + 0.5 - viewport.value.start) /
          Math.max(1, viewport.value.end - viewport.value.start)
        const x = layout.left + ratio * plotWidth
        const sample = store.getSample(cursorIndex)
        const y = layout.top + plotHeight * (1 - Math.min(1, sample.total / Math.max(1, yMax)))

        context.strokeStyle = '#409eff'
        context.lineWidth = 1.5
        context.beginPath()
        context.moveTo(x, layout.top)
        context.lineTo(x, layout.top + plotHeight)
        context.stroke()

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
  viewport.value = fitSatelliteCountViewport(satelliteEpochHistory.value.length)
  hoverSample.value = null
  hoverIndex.value = null
  scheduleRender()
}

function handleWheel(event: WheelEvent): void {
  if (props.slidingWindow || satelliteEpochHistory.value.length < 2) return
  const container = containerRef.value
  if (!container) return
  const rect = container.getBoundingClientRect()
  const plotWidth = currentPlotSize().width
  const localX = event.clientX - rect.left - layout.left
  const ratio = Math.max(0, Math.min(1, localX / plotWidth))
  const anchor = viewport.value.start + ratio * (viewport.value.end - viewport.value.start)
  viewport.value = zoomSatelliteCountViewport(
    viewport.value,
    anchor,
    event.deltaY > 0 ? 1.25 : 0.8,
    satelliteEpochHistory.value.length,
  )
  hoverSample.value = null
  hoverIndex.value = null
  scheduleRender()
}

function handleMouseDown(event: MouseEvent): void {
  if (event.button !== 0 || props.slidingWindow) return
  isDragging = true
  dragStartX = event.clientX
  dragStartViewport = { ...viewport.value }
}

function handleWindowMouseMove(event: MouseEvent): void {
  if (!isDragging) return
  const span = dragStartViewport.end - dragStartViewport.start
  const delta = -((event.clientX - dragStartX) / currentPlotSize().width) * span
  viewport.value = panSatelliteCountViewport(
    dragStartViewport,
    delta,
    satelliteEpochHistory.value.length,
  )
  hoverSample.value = null
  hoverIndex.value = null
  scheduleRender()
}

function handleWindowMouseUp(): void {
  isDragging = false
}

function handleMouseMove(event: MouseEvent): void {
  if (isDragging) return
  const container = containerRef.value
  const store = satelliteEpochHistory.value
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
  hoverSample.value = store.getSample(index)
  hoverIndex.value = index
  tooltipStyle.value = {
    left: `${Math.min(container.clientWidth - 190, x + layout.left + 14)}px`,
    top: `${Math.max(8, y + layout.top - 24)}px`,
  }
  drawAxes(renderedYMax)
}

function handleMouseLeave(): void {
  if (!isDragging) {
    hoverSample.value = null
    hoverIndex.value = null
    scheduleRender()
  }
}

watch(satelliteEpochHistory, () => {
  const nextLength = satelliteEpochHistory.value.length
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
      )
  previousLength = nextLength
  scheduleRender(false)
})

watch(
  () => props.slidingWindow,
  (sliding) => {
    const store = satelliteEpochHistory.value
    if (sliding && fileTimeline.active.value) {
      const cursorIndex = store.findNearestElapsedTime(fileTimeline.elapsedMilliseconds.value)
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

watch(
  [fileTimeline.active, fileTimeline.mode, fileTimeline.elapsedMilliseconds],
  () => {
    if (!props.active) return
    if (props.slidingWindow && fileTimeline.active.value) {
      const store = satelliteEpochHistory.value
      const cursorIndex = store.findNearestElapsedTime(fileTimeline.elapsedMilliseconds.value)
      viewport.value = {
        start: Math.max(0, cursorIndex - 39),
        end: Math.max(1, cursorIndex + 1),
      }
      scheduleRender()
    } else {
      scheduleRender()
    }
  },
)

onMounted(() => {
  previousLength = satelliteEpochHistory.value.length
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
</script>

<style scoped>
.satellite-count-chart {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  user-select: none;
  cursor: crosshair;
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
  top: 8px;
  left: 54px;
  right: 18px;
  z-index: 3;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 4px 14px;
  color: var(--app-text-muted);
  font-size: 12px;
  pointer-events: none;
}

.legend-item,
.tooltip-name {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.legend-item i,
.tooltip-name i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.satellite-count-tooltip {
  position: absolute;
  z-index: 4;
  width: 176px;
  padding: 10px 12px;
  color: var(--app-text);
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px var(--app-shadow);
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
