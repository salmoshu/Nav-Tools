<template>
  <div
    ref="containerRef"
    class="metric-chart"
    :data-renderer="rendererKind"
    @wheel.prevent="handleWheel"
    @mousemove="handleMouseMove"
    @mouseleave="clearHover"
    @mousedown="handleMouseDown"
    @dblclick="fitAll"
  >
    <canvas ref="plotCanvasRef" class="metric-plot"></canvas>
    <canvas ref="axisCanvasRef" class="metric-axis"></canvas>

    <div class="metric-heading">
      <i :style="{ backgroundColor: headingColor }"></i>
      <strong>{{ label }}</strong>
      <span>{{ unit }}</span>
    </div>

    <div v-if="hoverValue !== null" class="metric-tooltip" :style="tooltipStyle">
      <strong>{{ hoverTime }}</strong>
      <span>{{ hoverValue.toFixed(3) }} {{ unit }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useNmea } from '@/composables/gnss/useNmea'
import { useFileTimeline } from '@/composables/useFileTimeline'
import { useTheme } from '@/composables/useTheme'
import {
  fitSatelliteCountViewport,
  panSatelliteCountViewport,
  updateSatelliteCountViewportOnData,
  zoomSatelliteCountViewport,
  type SatelliteCountViewport,
} from '@/core/gnss/SatelliteCountViewport'
import { splitSeriesByQuality } from '@/core/gnss/QualitySeries'
import { createSatelliteTimeSeriesRenderer } from '@/core/render/createSatelliteTimeSeriesRenderer'
import type {
  SatelliteRendererKind,
  SatelliteSeriesColor,
  SatelliteTimeSeriesRenderer,
} from '@/core/render/SatelliteTimeSeriesRenderer'
import {
  FIX_STATUS_QUALITIES,
  fixStatusColor,
  normalizeFixStatusQuality,
} from './fixStatusColors'

type MetricField = 'E' | 'N' | 'U' | 'SPEED'

const props = defineProps<{
  field: MetricField
  label: string
  unit: string
  active: boolean
}>()

const { positionEpochHistory, speedEpochHistory } = useNmea()
const fileTimeline = useFileTimeline()
const { chartTheme, resolvedTheme } = useTheme()

const sourceStore = computed(() =>
  props.field === 'SPEED' ? speedEpochHistory.value : positionEpochHistory.value,
)

const containerRef = ref<HTMLDivElement | null>(null)
const plotCanvasRef = ref<HTMLCanvasElement | null>(null)
const axisCanvasRef = ref<HTMLCanvasElement | null>(null)
const rendererKind = ref<SatelliteRendererKind>('canvas')
const viewport = ref<SatelliteCountViewport>(fitSatelliteCountViewport(sourceStore.value.length))
const hoverValue = ref<number | null>(null)
const hoverTime = ref('')
const headingColor = ref(fixStatusColor(0))
const tooltipStyle = ref<Record<string, string>>({})

interface ChartLayout {
  left: number
  right: number
  top: number
  bottom: number
}

let layout: ChartLayout = { left: 54, right: 14, top: 38, bottom: 34 }
const OVERVIEW_RENDER_INTERVAL_MS = 1_000

let renderer: SatelliteTimeSeriesRenderer | null = null
let axisContext: CanvasRenderingContext2D | null = null
let resizeObserver: ResizeObserver | null = null
let renderFrame: number | null = null
let renderTimer: ReturnType<typeof setTimeout> | null = null
let lastRenderAt = 0
let previousLength = 0
let renderedRange = { min: -1, max: 1 }
let isDragging = false
let dragStartX = 0
let dragStartViewport: SatelliteCountViewport = { start: 0, end: 0 }

function hexToRgba(hex: string): SatelliteSeriesColor {
  const value = hex.replace('#', '')
  const normalized =
    value.length === 3
      ? value
          .split('')
          .map((character) => character + character)
          .join('')
      : value
  return [
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
    1,
  ]
}

function qualitySeriesId(quality: number): string {
  return `quality-${quality}`
}

function plotSize(): { width: number; height: number } {
  const container = containerRef.value
  if (!container) return { width: 1, height: 1 }
  return {
    width: Math.max(1, container.clientWidth - layout.left - layout.right),
    height: Math.max(1, container.clientHeight - layout.top - layout.bottom),
  }
}

function updateLayout(containerHeight: number): void {
  if (containerHeight < 150) {
    layout = { left: 44, right: 8, top: 24, bottom: 20 }
  } else if (containerHeight < 210) {
    layout = { left: 50, right: 10, top: 30, bottom: 26 }
  } else {
    layout = { left: 54, right: 14, top: 38, bottom: 34 }
  }
}

function paddedRange(range: { min: number; max: number } | null): {
  min: number
  max: number
} {
  if (!range) return { min: -1, max: 1 }
  const span = range.max - range.min
  const padding = span > 0 ? span * 0.08 : Math.max(0.5, Math.abs(range.max) * 0.08)
  return { min: range.min - padding, max: range.max + padding }
}

function resizeLayers(): void {
  const container = containerRef.value
  const plotCanvas = plotCanvasRef.value
  const axisCanvas = axisCanvasRef.value
  if (!container || !plotCanvas || !axisCanvas || !renderer) return

  updateLayout(container.clientHeight)
  container.style.setProperty('--metric-heading-top', `${Math.max(4, layout.top - 28)}px`)
  container.style.setProperty('--metric-heading-left', `${layout.left}px`)
  container.style.setProperty('--metric-heading-right', `${layout.right}px`)

  const { width, height } = plotSize()
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

function renderChart(): void {
  renderFrame = null
  lastRenderAt = performance.now()
  if (!props.active || !renderer || document.hidden) return

  const store = sourceStore.value
  if (store.length === 0) {
    renderer.clear()
    renderer.render()
    renderedRange = { min: -1, max: 1 }
    headingColor.value = fixStatusColor(0)
    drawAxes()
    return
  }

  const start = Math.max(0, Math.floor(viewport.value.start))
  const replayEnd =
    fileTimeline.active.value && fileTimeline.mode.value === 'replay'
      ? store.findNearestElapsedTime(fileTimeline.elapsedMilliseconds.value)
      : store.length - 1
  const end = Math.min(replayEnd, Math.max(start, Math.ceil(viewport.value.end) - 1))
  if (end < start) {
    renderer.clear()
    renderer.render()
    renderedRange = { min: -1, max: 1 }
    drawAxes()
    return
  }
  const { width } = plotSize()
  const extracted = store.extractSeries(
    props.field,
    start,
    end,
    Math.max(64, Math.floor(width * 2)),
  )
  const qualityGeometry = splitSeriesByQuality(
    extracted.points,
    extracted.segments,
    epochIndex =>
      normalizeFixStatusQuality(store.getValue('QUALITY', epochIndex)),
  )
  for (const quality of FIX_STATUS_QUALITIES) {
    const geometry = qualityGeometry.get(quality)
    renderer.setSeriesData(
      qualitySeriesId(quality),
      new Float32Array(geometry?.points ?? []),
      new Uint32Array(geometry?.segments ?? []),
    )
  }
  renderedRange = paddedRange(store.getRange(props.field, start, end))
  renderer.setViewport(
    viewport.value.start - 0.5,
    Math.max(viewport.value.start + 0.5, viewport.value.end - 0.5),
    renderedRange.min,
    renderedRange.max,
  )
  renderer.render()
  drawAxes()
}

function scheduleRender(immediate = true): void {
  if (renderFrame !== null) return
  if (!immediate) {
    const remaining = OVERVIEW_RENDER_INTERVAL_MS - (performance.now() - lastRenderAt)
    if (remaining > 0) {
      if (renderTimer === null) {
        renderTimer = setTimeout(() => {
          renderTimer = null
          scheduleRender()
        }, remaining)
      }
      return
    }
  }
  if (renderTimer !== null) {
    clearTimeout(renderTimer)
    renderTimer = null
  }
  renderFrame = requestAnimationFrame(renderChart)
}

function drawAxes(): void {
  const canvas = axisCanvasRef.value
  const context = axisContext
  const container = containerRef.value
  const store = sourceStore.value
  if (!canvas || !context || !container) return

  const dpr = window.devicePixelRatio || 1
  const width = container.clientWidth
  const height = container.clientHeight
  const plotWidth = Math.max(1, width - layout.left - layout.right)
  const plotHeight = Math.max(1, height - layout.top - layout.bottom)
  const colors = chartTheme.value

  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, width, height)
  context.font = '11px sans-serif'
  context.lineWidth = 1

  const yTickCount = plotHeight < 80 ? 2 : 4
  for (let tick = 0; tick <= yTickCount; tick += 1) {
    const ratio = tick / yTickCount
    const y = layout.top + plotHeight * (1 - ratio)
    context.strokeStyle = colors.grid
    context.beginPath()
    context.moveTo(layout.left, y)
    context.lineTo(layout.left + plotWidth, y)
    context.stroke()
    context.fillStyle = colors.textMuted
    context.textAlign = 'right'
    context.textBaseline = 'middle'
    const value = renderedRange.min + ratio * (renderedRange.max - renderedRange.min)
    context.fillText(value.toFixed(2), layout.left - 7, y)
  }

  context.strokeStyle = colors.border
  context.strokeRect(layout.left, layout.top, plotWidth, plotHeight)

  if (store.length > 0 && viewport.value.end > viewport.value.start) {
    const headingIndex = fileTimeline.active.value
      ? store.findNearestElapsedTime(fileTimeline.elapsedMilliseconds.value)
      : store.length - 1
    headingColor.value = fixStatusColor(
      normalizeFixStatusQuality(store.getValue('QUALITY', headingIndex)),
    )

    const xTickCount = plotWidth < 320 ? 2 : 3
    for (let tick = 0; tick <= xTickCount; tick += 1) {
      const ratio = tick / xTickCount
      const index = Math.max(
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
      context.textAlign = tick === 0 ? 'left' : tick === xTickCount ? 'right' : 'center'
      context.textBaseline = 'top'
      context.fillText(store.formatTime(index), x, layout.top + plotHeight + 9)
    }

    if (fileTimeline.active.value) {
      const cursorIndex = store.findNearestElapsedTime(fileTimeline.elapsedMilliseconds.value)
      if (cursorIndex >= viewport.value.start && cursorIndex < viewport.value.end) {
        const ratio =
          (cursorIndex + 0.5 - viewport.value.start) /
          Math.max(1, viewport.value.end - viewport.value.start)
        const x = layout.left + plotWidth * ratio
        const value = store.getValue(props.field, cursorIndex)
        const cursorColor = fixStatusColor(
          normalizeFixStatusQuality(store.getValue('QUALITY', cursorIndex)),
        )

        context.strokeStyle = cursorColor
        context.lineWidth = 1.5
        context.beginPath()
        context.moveTo(x, layout.top)
        context.lineTo(x, layout.top + plotHeight)
        context.stroke()

        if (value !== null) {
          const yRatio =
            (value - renderedRange.min) /
            Math.max(Number.EPSILON, renderedRange.max - renderedRange.min)
          const y = layout.top + plotHeight * (1 - Math.max(0, Math.min(1, yRatio)))
          context.fillStyle = cursorColor
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
}

function fitAll(): void {
  viewport.value = fitSatelliteCountViewport(sourceStore.value.length)
  clearHover()
  scheduleRender()
}

function handleWheel(event: WheelEvent): void {
  const store = sourceStore.value
  if (store.length < 2) return
  const container = containerRef.value
  if (!container) return
  const rect = container.getBoundingClientRect()
  const localX = event.clientX - rect.left - layout.left
  const ratio = Math.max(0, Math.min(1, localX / plotSize().width))
  const anchor = viewport.value.start + ratio * (viewport.value.end - viewport.value.start)
  viewport.value = zoomSatelliteCountViewport(
    viewport.value,
    anchor,
    event.deltaY > 0 ? 1.25 : 0.8,
    store.length,
  )
  clearHover()
  scheduleRender()
}

function handleMouseDown(event: MouseEvent): void {
  if (event.button !== 0) return
  isDragging = true
  dragStartX = event.clientX
  dragStartViewport = { ...viewport.value }
}

function handleWindowMouseMove(event: MouseEvent): void {
  if (!isDragging) return
  const span = dragStartViewport.end - dragStartViewport.start
  const delta = -((event.clientX - dragStartX) / plotSize().width) * span
  viewport.value = panSatelliteCountViewport(dragStartViewport, delta, sourceStore.value.length)
  clearHover()
  scheduleRender()
}

function handleWindowMouseUp(): void {
  isDragging = false
}

function handleMouseMove(event: MouseEvent): void {
  if (isDragging) return
  const container = containerRef.value
  const store = sourceStore.value
  if (!container || store.length === 0) return
  const rect = container.getBoundingClientRect()
  const { width, height } = plotSize()
  const x = event.clientX - rect.left - layout.left
  const y = event.clientY - rect.top - layout.top
  if (x < 0 || x > width || y < 0 || y > height) {
    clearHover()
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
  hoverValue.value = store.getValue(props.field, index)
  hoverTime.value = store.formatTime(index)
  tooltipStyle.value = {
    left: `${Math.min(container.clientWidth - 145, x + layout.left + 10)}px`,
    top: `${Math.max(8, y + layout.top - 18)}px`,
  }
}

function clearHover(): void {
  hoverValue.value = null
  hoverTime.value = ''
}

watch([positionEpochHistory, speedEpochHistory], () => {
  const nextLength = sourceStore.value.length
  const wasFull =
    previousLength > 0 && viewport.value.start <= 0.5 && viewport.value.end >= previousLength - 0.5
  viewport.value = wasFull
    ? fitSatelliteCountViewport(nextLength)
    : updateSatelliteCountViewportOnData(viewport.value, previousLength, nextLength, 'overview')
  previousLength = nextLength
  scheduleRender(false)
})

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
    if (props.active) scheduleRender()
  },
)

onMounted(() => {
  previousLength = sourceStore.value.length
  axisContext = axisCanvasRef.value?.getContext('2d') ?? null
  if (plotCanvasRef.value) {
    renderer = createSatelliteTimeSeriesRenderer(plotCanvasRef.value)
    rendererKind.value = renderer.kind
    for (const quality of FIX_STATUS_QUALITIES) {
      renderer.addSeries(qualitySeriesId(quality), hexToRgba(fixStatusColor(quality)))
    }
    renderer.setLineWidth(1.5)
  }
  resizeObserver = new ResizeObserver(resizeLayers)
  if (containerRef.value) resizeObserver.observe(containerRef.value)
  window.addEventListener('mousemove', handleWindowMouseMove)
  window.addEventListener('mouseup', handleWindowMouseUp)
  resizeLayers()
})

onUnmounted(() => {
  if (renderFrame !== null) cancelAnimationFrame(renderFrame)
  if (renderTimer !== null) clearTimeout(renderTimer)
  resizeObserver?.disconnect()
  window.removeEventListener('mousemove', handleWindowMouseMove)
  window.removeEventListener('mouseup', handleWindowMouseUp)
  renderer?.dispose()
  renderer = null
  axisContext = null
})
</script>

<style scoped>
.metric-chart {
  position: relative;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-surface);
  cursor: crosshair;
  user-select: none;
}

.metric-plot,
.metric-axis {
  position: absolute;
  display: block;
}

.metric-plot {
  z-index: 1;
}

.metric-axis {
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.metric-heading {
  position: absolute;
  top: var(--metric-heading-top, 10px);
  left: var(--metric-heading-left, 54px);
  right: var(--metric-heading-right, 14px);
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--app-text);
  font-size: 12px;
  pointer-events: none;
}

.metric-heading i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.metric-heading span {
  color: var(--app-text-muted);
  font-size: 10px;
}

.metric-tooltip {
  position: absolute;
  z-index: 4;
  display: flex;
  min-width: 125px;
  flex-direction: column;
  gap: 4px;
  padding: 7px 9px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  color: var(--app-text);
  background: var(--app-surface-raised);
  box-shadow: 0 4px 12px var(--app-shadow);
  font-size: 11px;
  pointer-events: none;
}

.metric-tooltip span {
  color: var(--app-text-secondary);
  font-variant-numeric: tabular-nums;
}
</style>
