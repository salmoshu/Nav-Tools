<template>
  <div
    ref="containerRef"
    class="metric-chart"
    :data-renderer="rendererKind"
    @wheel.prevent="handleWheel"
    @mousemove="handleMouseMove"
    @mouseleave="clearHover"
    @mousedown="handleMouseDown"
    @contextmenu.prevent
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
  clampSatelliteCountViewport,
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

/**
 * 同一数据源（position/speed store）的多个图表间同步 x 视口：
 * 左键平移与右键 x 伸缩广播给同源实例——位置视图下 E/N/U 三轴联动。
 */
interface MetricViewportBroadcast {
  start: number
  end: number
  store: unknown
}
const viewportSyncListeners = new Set<(payload: MetricViewportBroadcast) => void>()

function broadcastViewport(start: number, end: number, store: unknown): void {
  for (const listener of viewportSyncListeners) listener({ start, end, store })
}

/** 点线图形态：线用中性灰（细），点用系列色（粗，保留质量分色） */
const POINT_LINE_LINE_COLOR: [number, number, number, number] = [0.54, 0.54, 0.54, 0.9]
const POINT_LINE_LINE_WIDTH_PX = 1
/** 尺寸滑杆（与偏差图一致的 5~20）映射到点直径 */
const POINT_LINE_POINT_DIAMETER_PX = 6
const TRACKING_LIVE_WINDOW_EPOCHS = 40

const props = withDefaults(
  defineProps<{
    field: MetricField
    label: string
    unit: string
    active: boolean
    /** 跟踪：x 视口跟随回放光标/最新历元（与偏差图 track 同语义，拖拽偏移保持） */
    tracking?: boolean
    /** 尺寸（5~20，偏差图同款滑杆）：映射为点直径 */
    pointSize?: number
  }>(),
  { tracking: false, pointSize: 10 },
)

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
/** 用户滚轮产生的 y 轴手动范围（锚定光标值伸缩）；dblclick 重置回自动范围 */
let yRangeOverride: { min: number; max: number } | null = null
let isDragging = false
let dragStartX = 0
let dragStartViewport: SatelliteCountViewport = { start: 0, end: 0 }
/** 右键水平拖拽 = x 轴伸缩（同源图表联动） */
let isXZoomDragging = false
let xZoomAnchor = 0
/** 跟踪模式下用户拖拽产生的中心偏移（索引单位）：视口跟随目标但保持偏移不回中 */
let trackOffset = 0

function pointDiameterForSize(size: number): number {
  if (!Number.isFinite(size)) return POINT_LINE_POINT_DIAMETER_PX
  return Math.max(2, Math.min(14, size / 2 + 1))
}

/** 跟随目标索引：回放时为时间线光标处，实时流为最新历元 */
function trackingTargetIndex(): number {
  const store = sourceStore.value
  if (store.length === 0) return -1
  if (fileTimeline.active.value) {
    const index = store.findNearestElapsedTime(fileTimeline.elapsedMilliseconds.value)
    if (index >= 0) return index
  }
  return store.length - 1
}

/** 跟踪视口：中心 = 目标历元 + 用户偏移，跨度沿用当前跨度（首次用 live 窗口） */
function applyTrackingViewport(): void {
  const store = sourceStore.value
  const target = trackingTargetIndex()
  if (target < 0) return
  const span =
    viewport.value.end > viewport.value.start
      ? viewport.value.end - viewport.value.start
      : Math.min(store.length, TRACKING_LIVE_WINDOW_EPOCHS)
  const center = target + 0.5 + trackOffset
  applyViewport(
    clampSatelliteCountViewport(
      { start: center - span / 2, end: center + span / 2 },
      store.length,
    ),
  )
}

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
    yRangeOverride = null
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
  // 手动 y 范围为绝对值（滚轮设置，dblclick 重置）；未设置时用可见窗口数据自动适配
  renderedRange = yRangeOverride ?? paddedRange(store.getRange(props.field, start, end))
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
  yRangeOverride = null
  clearHover()
  scheduleRender()
}

/**
 * 工具栏「重置布局」（偏差图同款）：清除手动 y 范围与跟踪偏移；
 * 跟踪开启时保持跨度并居中到目标（同偏差图 resetZoom 语义），
 * 未跟踪时回到全览。
 */
function resetLayout(): void {
  trackOffset = 0
  yRangeOverride = null
  if (props.tracking) {
    applyTrackingViewport()
    scheduleRender()
    return
  }
  fitAll()
}

defineExpose({ resetLayout })

/** 滚轮：本图 y 轴伸缩，锚定光标处的数值（不做跨图联动） */
function handleWheel(event: WheelEvent): void {
  const store = sourceStore.value
  const container = containerRef.value
  if (!container || store.length === 0) return
  const rect = container.getBoundingClientRect()
  const localY = event.clientY - rect.top - layout.top
  const { height } = plotSize()
  const ratio = Math.max(0, Math.min(1, 1 - localY / Math.max(1, height)))
  const span = renderedRange.max - renderedRange.min
  const anchorValue = renderedRange.min + ratio * span
  const factor = event.deltaY > 0 ? 1.25 : 0.8
  yRangeOverride = {
    min: anchorValue - (anchorValue - renderedRange.min) * factor,
    max: anchorValue + (renderedRange.max - anchorValue) * factor,
  }
  clearHover()
  scheduleRender()
}

/** 左键平移 / 右键 x 伸缩按下：记录起点，右键额外记录锚点索引 */
function handleMouseDown(event: MouseEvent): void {
  if (event.button === 2) {
    const store = sourceStore.value
    const container = containerRef.value
    if (!container || store.length < 2) return
    const rect = container.getBoundingClientRect()
    const localX = event.clientX - rect.left - layout.left
    const ratio = Math.max(0, Math.min(1, localX / plotSize().width))
    isXZoomDragging = true
    dragStartX = event.clientX
    dragStartViewport = { ...viewport.value }
    xZoomAnchor = dragStartViewport.start + ratio * (dragStartViewport.end - dragStartViewport.start)
    return
  }
  if (event.button !== 0) return
  isDragging = true
  dragStartX = event.clientX
  dragStartViewport = { ...viewport.value }
}

/** 应用新 x 视口并广播给同源图表（E/N/U 联动）；跟踪模式下记录用户拖拽偏移 */
function applyViewport(next: SatelliteCountViewport): void {
  viewport.value = next
  if (props.tracking) {
    trackOffset = (next.start + next.end) / 2 - (trackingTargetIndex() + 0.5)
  }
  broadcastViewport(next.start, next.end, sourceStore.value)
  scheduleRender()
}

function handleWindowMouseMove(event: MouseEvent): void {
  if (isXZoomDragging) {
    const store = sourceStore.value
    if (store.length < 2) return
    // 向右拖放大（时间窗变窄），向左拖缩小；以按下点为锚
    const dx = event.clientX - dragStartX
    const factor = Math.pow(2, -dx / 160)
    applyViewport(
      zoomSatelliteCountViewport(dragStartViewport, xZoomAnchor, factor, store.length),
    )
    clearHover()
    return
  }
  if (!isDragging) return
  const span = dragStartViewport.end - dragStartViewport.start
  const delta = -((event.clientX - dragStartX) / plotSize().width) * span
  applyViewport(panSatelliteCountViewport(dragStartViewport, delta, sourceStore.value.length))
  clearHover()
}

function handleWindowMouseUp(): void {
  isDragging = false
  isXZoomDragging = false
}

/** 同源图表广播：E/N/U 之间同步 x 视口（平移/伸缩联动，跟踪偏移一并同步） */
function handleViewportSync(payload: MetricViewportBroadcast): void {
  if (payload.store !== sourceStore.value) return
  if (payload.start === viewport.value.start && payload.end === viewport.value.end) return
  viewport.value = { start: payload.start, end: payload.end }
  // 同源 target 相同：按广播视口同步跟踪偏移，避免各实例跟随帧互相打架
  if (props.tracking) {
    trackOffset = (payload.start + payload.end) / 2 - (trackingTargetIndex() + 0.5)
  }
  scheduleRender()
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
  if (props.tracking && nextLength > 0) {
    previousLength = nextLength
    applyTrackingViewport()
    scheduleRender(false)
    return
  }
  const wasFull =
    previousLength > 0 && viewport.value.start <= 0.5 && viewport.value.end >= previousLength - 0.5
  viewport.value = wasFull
    ? fitSatelliteCountViewport(nextLength)
    : updateSatelliteCountViewportOnData(viewport.value, previousLength, nextLength, 'overview')
  previousLength = nextLength
  scheduleRender(false)
})

// 跟踪开关：开启时清除拖拽偏移并立即居中到目标（同偏差图 toggleTracking 语义）
watch(
  () => props.tracking,
  (tracking) => {
    if (!tracking) return
    trackOffset = 0
    applyTrackingViewport()
  },
)

// 尺寸滑杆 → 点直径
watch(
  () => props.pointSize,
  (size) => {
    renderer?.setPointDiameter(pointDiameterForSize(size))
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
    // 跟踪：回放光标/实时最新历元移动后重新居中
    if (props.tracking) applyTrackingViewport()
    else scheduleRender()
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
    // 点线图：细灰线勾连续性，粗点按质量分色承载信息（尺寸滑杆可调）
    renderer.setLineWidth(POINT_LINE_LINE_WIDTH_PX)
    renderer.setLineOverrideColor(POINT_LINE_LINE_COLOR)
    renderer.setPointDiameter(pointDiameterForSize(props.pointSize))
  }
  resizeObserver = new ResizeObserver(resizeLayers)
  if (containerRef.value) resizeObserver.observe(containerRef.value)
  window.addEventListener('mousemove', handleWindowMouseMove)
  window.addEventListener('mouseup', handleWindowMouseUp)
  viewportSyncListeners.add(handleViewportSync)
  resizeLayers()
})

onUnmounted(() => {
  if (renderFrame !== null) cancelAnimationFrame(renderFrame)
  if (renderTimer !== null) clearTimeout(renderTimer)
  resizeObserver?.disconnect()
  viewportSyncListeners.delete(handleViewportSync)
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
