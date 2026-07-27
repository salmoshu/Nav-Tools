<template>
  <div class="deviation-container">
    <div class="control-panel">
      <div class="controls">
        <el-select v-model="currentView" size="small" class="view-switch">
          <el-option :label="t('gnss.deviation.deviationView')" value="deviation" />
          <el-option :label="t('gnss.deviation.positionView')" value="position" />
          <el-option :label="t('gnss.deviation.speedView')" value="speed" />
        </el-select>
        <template v-if="currentView === 'deviation'">
          <el-switch
            v-model="isTracking"
            inline-prompt
            :active-text="t('gnss.deviation.tracking')"
            :inactive-text="t('gnss.deviation.tracking')"
            :aria-label="t('gnss.deviation.tracking')"
            :title="t('gnss.deviation.tracking')"
            @change="toggleTracking"
            class="tracking-switch"
          />
          <div class="point-size-control">
            <span class="size-label">{{ t('gnss.deviation.size') }}:</span>
            <el-slider
              v-model="pointSize"
              :min="5"
              :max="20"
              :step="1"
              class="point-slider"
              @change="updatePointSize"
            />
            <span class="size-value">{{ pointSize }}</span>
          </div>
        </template>

        <div class="right-buttons">
          <el-button
            v-show="currentView === 'deviation'"
            type="primary"
            size="small"
            @click="resetZoom"
            class="control-btn zoom-btn"
            ><el-icon><RefreshLeft /></el-icon>&nbsp;{{
              t('gnss.deviation.resetLayout')
            }}</el-button
          >
          <el-button type="primary" size="small" @click="clearTrack" class="control-btn clear-btn"
            ><el-icon><Delete /></el-icon>&nbsp;{{ t('gnss.deviation.clear') }}</el-button
          >
        </div>
      </div>
    </div>
    <div class="chart-container" ref="chartContainerRef" v-show="currentView === 'deviation'">
      <canvas ref="canvasRef" class="chart"></canvas>
      <canvas ref="axisCanvasRef" class="axis-layer"></canvas>
      <div ref="tooltipRef" class="deviation-tooltip" :style="tooltipStyle" v-show="tooltipVisible">
        {{ tooltipText }}
      </div>
    </div>
    <div v-show="currentView === 'position'" class="position-chart-grid">
      <GnssMetricTimeSeries
        field="E"
        :label="t('gnss.deviation.axisE')"
        unit="m"
        color="#1890ff"
        :active="currentView === 'position'"
      />
      <GnssMetricTimeSeries
        field="N"
        :label="t('gnss.deviation.axisN')"
        unit="m"
        color="#fa541c"
        :active="currentView === 'position'"
      />
      <GnssMetricTimeSeries
        field="U"
        :label="t('gnss.deviation.axisU')"
        unit="m"
        color="#52c41a"
        :active="currentView === 'position'"
      />
    </div>
    <div v-show="currentView === 'speed'" class="speed-chart-container">
      <GnssMetricTimeSeries
        field="SPEED"
        :label="t('gnss.deviation.speed')"
        unit="km/h"
        color="#722ed1"
        :active="currentView === 'speed'"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { useNmea, numberToQuality } from '@/composables/gnss/useNmea'
import { useFileTimeline } from '@/composables/useFileTimeline'
import { fixStatusColorRgb01 } from '@/components/windows/gnss/fixStatusColors'
import { useTheme } from '@/composables/useTheme'
import { createTrajectoryRenderer } from '@/core/render/createTrajectoryRenderer'
import { t } from '@/i18n'
import type { TrajectoryRenderer } from '@/core/render/TrajectoryRenderer'
import GnssMetricTimeSeries from './GnssMetricTimeSeries.vue'
import {
  clampVisibleSpan,
  fitDeviationPoints,
  fitDeviationPointsAroundCenter,
  GNSS_MIN_VISIBLE_SPAN_METERS,
} from '@/core/deviation/DeviationViewport'

const { deviationPoints: plotData, positionEpochHistory, clearData } = useNmea()
const fileTimeline = useFileTimeline()
const { chartTheme, resolvedTheme } = useTheme()

const LIMIT_METERS = 10000
const RENDER_QUEUE_TARGET_FRAMES = 2
const RENDER_MAX_POINTS_PER_FRAME = 128
const RENDER_BUDGET_MS = 4
const BULK_RENDER_THRESHOLD = 512

const canvasRef = ref<HTMLCanvasElement | null>(null)
const axisCanvasRef = ref<HTMLCanvasElement | null>(null)
const chartContainerRef = ref<HTMLDivElement | null>(null)
const tooltipRef = ref<HTMLDivElement | null>(null)

let renderer: TrajectoryRenderer | null = null
let axisCtx: CanvasRenderingContext2D | null = null

let axisDpr = 1
let axisCssWidth = 0
let axisCssHeight = 0

const isTracking = ref(true)
const pointSize = ref(10)
const tooltipVisible = ref(false)
const tooltipText = ref('')
const tooltipStyle = ref<Record<string, string>>({})

const viewport = ref({
  xMin: -10,
  xMax: 10,
  yMin: -10,
  yMax: 10,
})

let trackingXHalfSpan = 10
let trackingYHalfSpan = 10

// 用户拖拽产生的偏移（相对于最新数据点），跟踪模式下保持此偏移不回中
let panOffsetX = 0
let panOffsetY = 0

let renderedPointCount = 0
let firstRenderedPoint: [number, number, number] | undefined

let nmeaUpdateFrame: number | null = null
let themeRefreshFrame: number | null = null

let resizeObserver: ResizeObserver | null = null
let resizeFrame: number | null = null

let stopWatch: (() => void) | null = null
let stopThemeWatch: (() => void) | null = null
let stopTimelineWatch: (() => void) | null = null

type DeviationView = 'deviation' | 'position' | 'speed'

const currentView = ref<DeviationView>('deviation')

watch(currentView, (view) => {
  if (view !== 'deviation') {
    cancelScheduledNmeaUpdate()
  } else {
    scheduleNmeaUpdate()
  }
})

function scheduleThemeRefresh(): void {
  if (themeRefreshFrame !== null) cancelAnimationFrame(themeRefreshFrame)
  themeRefreshFrame = requestAnimationFrame(() => {
    themeRefreshFrame = requestAnimationFrame(() => {
      themeRefreshFrame = null
      if (currentView.value === 'deviation') {
        drawAxisLayer()
        drawCurrentPosition()
      }
    })
  })
}

const DRAG_THRESHOLD_PX = 3
let isDragging = false
let dragStartClientX = 0
let dragStartClientY = 0
let dragLastClientX = 0
let dragLastClientY = 0
let dragHasMoved = false

function formatDistance(value: number): string {
  const numericValue = Number(value)
  if (Math.abs(numericValue) < 0.01) return `${(numericValue * 100).toFixed(2)} cm`
  return `${numericValue.toFixed(2)} m`
}

function qualityToRgb(quality: number): [number, number, number] {
  return fixStatusColorRgb01(quality)
}

function qualityToColor(quality: number): [number, number, number, number] {
  const [r, g, b] = qualityToRgb(quality)
  return [r, g, b, 1]
}

function dataToScreenX(x: number): number {
  if (axisCssWidth <= 0) return 0
  const { xMin, xMax } = viewport.value
  return ((x - xMin) / (xMax - xMin)) * axisCssWidth
}

function dataToScreenY(y: number): number {
  if (axisCssHeight <= 0) return 0
  const { yMin, yMax } = viewport.value
  return axisCssHeight - ((y - yMin) / (yMax - yMin)) * axisCssHeight
}

function niceTickStep(span: number): number {
  if (!Number.isFinite(span) || span <= 0) return 1
  const targetTicks = 6
  const rough = span / targetTicks
  const exp = Math.floor(Math.log10(rough))
  const fraction = rough / Math.pow(10, exp)
  let step = 10
  if (fraction <= 2) step = 2
  else if (fraction <= 5) step = 5
  return step * Math.pow(10, exp)
}

function drawAxisLayer(): void {
  if (!axisCtx || !axisCanvasRef.value) return

  const width = axisCssWidth
  const height = axisCssHeight
  const colors = chartTheme.value
  const ctx = axisCtx

  ctx.save()
  ctx.setTransform(axisDpr, 0, 0, axisDpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const { xMin, xMax, yMin, yMax } = viewport.value
  const xStep = niceTickStep(xMax - xMin)
  const yStep = niceTickStep(yMax - yMin)

  const xStart = Math.ceil(xMin / xStep) * xStep
  const xEnd = Math.floor(xMax / xStep) * xStep
  const yStart = Math.ceil(yMin / yStep) * yStep
  const yEnd = Math.floor(yMax / yStep) * yStep

  ctx.strokeStyle = colors.grid
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.font = '12px sans-serif'
  ctx.fillStyle = colors.textMuted

  // Vertical grid lines and x-axis labels at the bottom edge.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let x = xStart; x <= xEnd + 1e-9; x += xStep) {
    const sx = dataToScreenX(x)
    ctx.beginPath()
    ctx.moveTo(sx, 0)
    ctx.lineTo(sx, height)
    ctx.stroke()
    ctx.fillText(formatDistance(x), sx, height - 18)
  }

  // Horizontal grid lines and y-axis labels at the left edge.
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (let y = yStart; y <= yEnd + 1e-9; y += yStep) {
    const sy = dataToScreenY(y)
    ctx.beginPath()
    ctx.moveTo(0, sy)
    ctx.lineTo(width, sy)
    ctx.stroke()
    ctx.fillText(formatDistance(y), 8, sy)
  }

  // Origin cross lines (solid, slightly thicker).
  ctx.setLineDash([])
  ctx.strokeStyle = colors.border
  ctx.lineWidth = 1.5
  if (xMin <= 0 && xMax >= 0) {
    const sx = dataToScreenX(0)
    ctx.beginPath()
    ctx.moveTo(sx, 0)
    ctx.lineTo(sx, height)
    ctx.stroke()
  }
  if (yMin <= 0 && yMax >= 0) {
    const sy = dataToScreenY(0)
    ctx.beginPath()
    ctx.moveTo(0, sy)
    ctx.lineTo(width, sy)
    ctx.stroke()
  }

  ctx.restore()
}

function drawCurrentPosition(): void {
  if (!axisCtx || axisCssWidth <= 0 || axisCssHeight <= 0) return

  const latestPoint = getTimelinePositionPoint() ?? getLatestRenderedPoint()
  if (!latestPoint) return
  const [x, y, q] = latestPoint
  const sx = dataToScreenX(x)
  const sy = dataToScreenY(y)
  const radius = (pointSize.value * 1.2) / 2
  const [r, g, b] = qualityToRgb(q)

  const ctx = axisCtx
  ctx.save()
  ctx.setTransform(axisDpr, 0, 0, axisDpr, 0, 0)
  ctx.fillStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 1)`
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(sx, sy, Math.max(2, radius), 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function getTimelinePositionPoint(): [number, number, number] | undefined {
  if (!fileTimeline.active.value) return undefined
  const history = positionEpochHistory.value
  if (history.length === 0) return undefined
  const index = history.findNearestElapsedTime(fileTimeline.elapsedMilliseconds.value)
  if (index < 0) return undefined
  const east = history.getValue('E', index)
  const north = history.getValue('N', index)
  if (east === null || north === null) return undefined
  return [east, north, history.getValue('QUALITY', index) ?? 0]
}

function updateViewport(xMin: number, xMax: number, yMin: number, yMax: number): void {
  viewport.value = { xMin, xMax, yMin, yMax }
  renderer?.setViewport(xMin, xMax, yMin, yMax)
  drawAxisLayer()
  drawCurrentPosition()
}

function getLatestRenderedPoint(): [number, number, number] | undefined {
  if (renderedPointCount <= 0) return undefined
  return plotData.value[Math.min(renderedPointCount, plotData.value.length) - 1]
}

function syncRendererData(): boolean {
  if (!renderer) return false

  const points = plotData.value
  const firstChanged =
    points.length > 0 && renderedPointCount > 0 && points[0] !== firstRenderedPoint
  const resetNeeded = firstChanged || points.length < renderedPointCount

  if (resetNeeded) {
    renderer.clear()
    renderedPointCount = 0
  }

  firstRenderedPoint = points[0]
  const remaining = points.length - renderedPointCount
  if (remaining <= 0) return false

  // File import publishes thousands of points in one reactive update. Upload
  // that backlog in one renderer batch; the per-point RAF path is reserved for
  // live data and otherwise can take tens of seconds to catch up.
  if (remaining >= BULK_RENDER_THRESHOLD) {
    renderer.addPointsBatch(points.slice(renderedPointCount))
    renderedPointCount = points.length
    return false
  }

  const targetCount = Math.min(
    RENDER_MAX_POINTS_PER_FRAME,
    Math.max(1, Math.ceil(remaining / RENDER_QUEUE_TARGET_FRAMES)),
  )
  const startedAt = performance.now()
  let processedCount = 0

  while (renderedPointCount < points.length && processedCount < targetCount) {
    const [x, y, q] = points[renderedPointCount]
    renderer.addPoint(x, y, q)
    renderedPointCount += 1
    processedCount += 1
    if (processedCount >= 2 && performance.now() - startedAt >= RENDER_BUDGET_MS) break
  }

  return renderedPointCount < points.length
}

function handleNmeaUpdate(): boolean {
  if (!renderer) return false

  const sourceChanged =
    plotData.value.length !== renderedPointCount ||
    (plotData.value.length > 0 && plotData.value[0] !== firstRenderedPoint)
  const hasMorePoints = syncRendererData()
  const latestTrackPoint = getLatestRenderedPoint()
  if (!latestTrackPoint) {
    drawAxisLayer()
    return hasMorePoints
  }

  if (
    fileTimeline.active.value &&
    sourceChanged &&
    !hasMorePoints &&
    chartContainerRef.value
  ) {
    const { clientWidth, clientHeight } = chartContainerRef.value
    const fitted = fitDeviationPoints(
      plotData.value,
      clientWidth / Math.max(1, clientHeight),
      GNSS_MIN_VISIBLE_SPAN_METERS,
    )
    if (fitted) {
      isTracking.value = false
      panOffsetX = 0
      panOffsetY = 0
      trackingXHalfSpan = (fitted.xMax - fitted.xMin) / 2
      trackingYHalfSpan = (fitted.yMax - fitted.yMin) / 2
      updateViewport(fitted.xMin, fitted.xMax, fitted.yMin, fitted.yMax)
      return false
    }
  }

  // 拖拽中只更新数据渲染，不改变视口，避免视图跳动
  if (isDragging) {
    renderer.render()
    drawAxisLayer()
    drawCurrentPosition()
    return hasMorePoints
  }

  if (isTracking.value) {
    // 视口中心 = 最新点 + 用户拖拽偏移，保持当前跨度
    const centerX = latestTrackPoint[0] + panOffsetX
    const centerY = latestTrackPoint[1] + panOffsetY
    updateViewport(
      centerX - trackingXHalfSpan,
      centerX + trackingXHalfSpan,
      centerY - trackingYHalfSpan,
      centerY + trackingYHalfSpan,
    )
  } else {
    renderer.render()
    drawAxisLayer()
    drawCurrentPosition()
  }

  return hasMorePoints
}

function scheduleNmeaUpdate(): void {
  if (document.hidden || currentView.value !== 'deviation' || nmeaUpdateFrame !== null) return
  nmeaUpdateFrame = requestAnimationFrame(() => {
    nmeaUpdateFrame = null
    if (handleNmeaUpdate()) scheduleNmeaUpdate()
  })
}

function cancelScheduledNmeaUpdate(): void {
  if (nmeaUpdateFrame !== null) {
    cancelAnimationFrame(nmeaUpdateFrame)
    nmeaUpdateFrame = null
  }
}

function handleDocumentVisibilityChange(): void {
  if (
    !document.hidden &&
    currentView.value === 'deviation' &&
    renderedPointCount < plotData.value.length
  ) {
    scheduleNmeaUpdate()
  }
}

function toggleTracking(): void {
  if (!renderer) return
  const latestPoint = getLatestRenderedPoint()
  if (!latestPoint) return

  if (isTracking.value) {
    // 开启跟踪：重置用户拖拽偏移，视口以最新点为中心
    panOffsetX = 0
    panOffsetY = 0
    const xSpan = viewport.value.xMax - viewport.value.xMin
    const ySpan = viewport.value.yMax - viewport.value.yMin
    trackingXHalfSpan = xSpan / 2
    trackingYHalfSpan = ySpan / 2
    updateViewport(
      latestPoint[0] - trackingXHalfSpan,
      latestPoint[0] + trackingXHalfSpan,
      latestPoint[1] - trackingYHalfSpan,
      latestPoint[1] + trackingYHalfSpan,
    )
  }
}

function resetZoom(): void {
  if (!renderer || !chartContainerRef.value) return
  const points = plotData.value

  // 重置布局时清除用户拖拽偏移
  panOffsetX = 0
  panOffsetY = 0

  const width = chartContainerRef.value.clientWidth
  const height = chartContainerRef.value.clientHeight
  const aspectRatio = width / height

  const newViewport =
    isTracking.value && points.length > 0
      ? fitDeviationPointsAroundCenter(
          points,
          points[points.length - 1][0],
          points[points.length - 1][1],
          aspectRatio,
          GNSS_MIN_VISIBLE_SPAN_METERS,
        )
      : fitDeviationPoints(points, aspectRatio, GNSS_MIN_VISIBLE_SPAN_METERS)

  if (!newViewport) {
    trackingXHalfSpan = 10
    trackingYHalfSpan = 10
    updateViewport(-10, 10, -10, 10)
    return
  }

  trackingXHalfSpan = (newViewport.xMax - newViewport.xMin) / 2
  trackingYHalfSpan = (newViewport.yMax - newViewport.yMin) / 2
  updateViewport(newViewport.xMin, newViewport.xMax, newViewport.yMin, newViewport.yMax)
}

function clearTrack(): void {
  cancelScheduledNmeaUpdate()
  renderer?.clear()
  renderedPointCount = 0
  firstRenderedPoint = undefined
  panOffsetX = 0
  panOffsetY = 0
  updateViewport(-10, 10, -10, 10)
  clearData()
}

function updatePointSize(): void {
  renderer?.setPointSize(pointSize.value)
  drawAxisLayer()
  drawCurrentPosition()
}

function handleWheel(e: WheelEvent): void {
  e.preventDefault()
  e.stopPropagation()

  if (!renderer || !canvasRef.value) return

  const { xMin, xMax, yMin, yMax } = viewport.value
  const xRange = xMax - xMin
  const yRange = yMax - yMin

  // 与 canvas(ECharts) 版一致的 RTKLIB 缩放：以视图中心为锚点
  const zoomRatio = Math.pow(2.0, e.deltaY / 1200.0)
  const xSpan = clampVisibleSpan(xRange * zoomRatio, GNSS_MIN_VISIBLE_SPAN_METERS, LIMIT_METERS * 2)
  const ySpan = clampVisibleSpan(yRange * zoomRatio, GNSS_MIN_VISIBLE_SPAN_METERS, LIMIT_METERS * 2)

  const xCenter = (xMin + xMax) / 2
  const yCenter = (yMin + yMax) / 2
  const newXMin = Math.max(-LIMIT_METERS, xCenter - xSpan / 2)
  const newXMax = Math.min(LIMIT_METERS, xCenter + xSpan / 2)
  const newYMin = Math.max(-LIMIT_METERS, yCenter - ySpan / 2)
  const newYMax = Math.min(LIMIT_METERS, yCenter + ySpan / 2)

  trackingXHalfSpan = (newXMax - newXMin) / 2
  trackingYHalfSpan = (newYMax - newYMin) / 2
  updateViewport(newXMin, newXMax, newYMin, newYMax)

  // 拖拽后更新偏移：新视口中心相对于最新数据点的偏移
  const latestPoint = getLatestRenderedPoint()
  if (latestPoint) {
    panOffsetX = (newXMin + newXMax) / 2 - latestPoint[0]
    panOffsetY = (newYMin + newYMax) / 2 - latestPoint[1]
  }
}

function handleMouseMove(e: MouseEvent): void {
  if (isDragging) {
    hideTooltip()
    return
  }
  if (!renderer || !canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const picked = renderer.pickPoint(x, y)
  if (picked) {
    tooltipVisible.value = true
    tooltipText.value = `${t('gnss.deviation.tooltipPositionPrefix')}: (${formatDistance(picked.x)}, ${formatDistance(picked.y)})\n${t('gnss.deviation.tooltipQuality')}: ${numberToQuality(picked.quality)}`
    tooltipStyle.value = {
      left: `${x + 12}px`,
      top: `${y + 12}px`,
    }
  } else {
    tooltipVisible.value = false
  }
}

function hideTooltip(): void {
  tooltipVisible.value = false
}

function handleMouseDown(e: MouseEvent): void {
  if (e.button !== 0 || !canvasRef.value) return
  isDragging = true
  dragHasMoved = false
  dragStartClientX = e.clientX
  dragStartClientY = e.clientY
  dragLastClientX = e.clientX
  dragLastClientY = e.clientY
  window.addEventListener('mousemove', handleWindowMouseMove)
  window.addEventListener('mouseup', handleWindowMouseUp)
}

function handleWindowMouseMove(e: MouseEvent): void {
  if (!isDragging || !canvasRef.value) return
  const dx = e.clientX - dragLastClientX
  const dy = e.clientY - dragLastClientY
  const totalDx = e.clientX - dragStartClientX
  const totalDy = e.clientY - dragStartClientY
  dragLastClientX = e.clientX
  dragLastClientY = e.clientY
  if (!dragHasMoved && Math.hypot(totalDx, totalDy) >= DRAG_THRESHOLD_PX) {
    dragHasMoved = true
    hideTooltip()
  }
  if (!dragHasMoved) return

  const rect = canvasRef.value.getBoundingClientRect()
  const { xMin, xMax, yMin, yMax } = viewport.value
  const xRange = xMax - xMin
  const yRange = yMax - yMin

  // 内容跟随鼠标：屏幕 Y 向下而数据 Y 向上，X 取反、Y 取正
  const dataDx = -(dx / rect.width) * xRange
  const dataDy = (dy / rect.height) * yRange

  let newXMin = xMin + dataDx
  let newXMax = xMax + dataDx
  let newYMin = yMin + dataDy
  let newYMax = yMax + dataDy

  const xSpan = newXMax - newXMin
  const ySpan = newYMax - newYMin

  if (newXMin < -LIMIT_METERS) {
    newXMin = -LIMIT_METERS
    newXMax = -LIMIT_METERS + xSpan
  } else if (newXMax > LIMIT_METERS) {
    newXMax = LIMIT_METERS
    newXMin = LIMIT_METERS - xSpan
  }

  if (newYMin < -LIMIT_METERS) {
    newYMin = -LIMIT_METERS
    newYMax = -LIMIT_METERS + ySpan
  } else if (newYMax > LIMIT_METERS) {
    newYMax = LIMIT_METERS
    newYMin = LIMIT_METERS - ySpan
  }

  trackingXHalfSpan = (newXMax - newXMin) / 2
  trackingYHalfSpan = (newYMax - newYMin) / 2
  updateViewport(newXMin, newXMax, newYMin, newYMax)
}

function handleWindowMouseUp(): void {
  if (!isDragging) return
  isDragging = false
  window.removeEventListener('mousemove', handleWindowMouseMove)
  window.removeEventListener('mouseup', handleWindowMouseUp)
}

function resizeAxisCanvas(cssWidth: number, cssHeight: number): void {
  if (!axisCanvasRef.value || !axisCtx) return
  axisDpr = window.devicePixelRatio || 1
  axisCssWidth = cssWidth
  axisCssHeight = cssHeight
  axisCanvasRef.value.width = cssWidth * axisDpr
  axisCanvasRef.value.height = cssHeight * axisDpr
  axisCanvasRef.value.style.width = `${cssWidth}px`
  axisCanvasRef.value.style.height = `${cssHeight}px`
}

function setupResizeObserver(): void {
  if (!chartContainerRef.value) return
  teardownResizeObserver()
  resizeObserver = new ResizeObserver(() => {
    if (resizeFrame !== null) cancelAnimationFrame(resizeFrame)
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null
      if (!chartContainerRef.value || !canvasRef.value || !axisCanvasRef.value) return
      const width = chartContainerRef.value.clientWidth
      const height = chartContainerRef.value.clientHeight
      renderer?.onResize(width, height)
      resizeAxisCanvas(width, height)
      drawAxisLayer()
      drawCurrentPosition()
    })
  })
  resizeObserver.observe(chartContainerRef.value)
}

function teardownResizeObserver(): void {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (resizeFrame !== null) {
    cancelAnimationFrame(resizeFrame)
    resizeFrame = null
  }
}

function initRenderer(): void {
  if (!canvasRef.value || !axisCanvasRef.value || !chartContainerRef.value) return
  renderer = createTrajectoryRenderer(canvasRef.value)
  axisCtx = axisCanvasRef.value.getContext('2d')

  const width = chartContainerRef.value.clientWidth
  const height = chartContainerRef.value.clientHeight
  renderer.onResize(width, height)
  resizeAxisCanvas(width, height)

  renderer.setPointSize(pointSize.value)
  renderer.setColorMapper(qualityToColor)
  updateViewport(-10, 10, -10, 10)

  canvasRef.value.addEventListener('wheel', handleWheel, { passive: false, capture: true })
  canvasRef.value.addEventListener('mousemove', handleMouseMove)
  canvasRef.value.addEventListener('mouseleave', hideTooltip)
  canvasRef.value.addEventListener('mousedown', handleMouseDown)
}

onMounted(() => {
  nextTick(() => {
    initRenderer()
    setupResizeObserver()
    document.addEventListener('visibilitychange', handleDocumentVisibilityChange)

    stopWatch = watch(
      plotData,
      () => {
        if (currentView.value === 'deviation') scheduleNmeaUpdate()
      },
      { immediate: true },
    )

    stopThemeWatch = watch(resolvedTheme, scheduleThemeRefresh)
    stopTimelineWatch = watch(
      [fileTimeline.active, fileTimeline.elapsedMilliseconds],
      () => {
        if (currentView.value !== 'deviation') return
        drawAxisLayer()
        drawCurrentPosition()
      },
    )
  })
})

onUnmounted(() => {
  cancelScheduledNmeaUpdate()
  document.removeEventListener('visibilitychange', handleDocumentVisibilityChange)
  if (themeRefreshFrame !== null) {
    cancelAnimationFrame(themeRefreshFrame)
    themeRefreshFrame = null
  }
  stopWatch?.()
  stopThemeWatch?.()
  stopTimelineWatch?.()
  teardownResizeObserver()
  if (canvasRef.value) {
    canvasRef.value.removeEventListener('wheel', handleWheel)
    canvasRef.value.removeEventListener('mousemove', handleMouseMove)
    canvasRef.value.removeEventListener('mouseleave', hideTooltip)
    canvasRef.value.removeEventListener('mousedown', handleMouseDown)
  }
  window.removeEventListener('mousemove', handleWindowMouseMove)
  window.removeEventListener('mouseup', handleWindowMouseUp)
  renderer?.dispose()
  renderer = null
  axisCtx = null
})
</script>

<style scoped>
.deviation-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  container-type: inline-size;
  color: var(--app-text);
  background-color: var(--app-surface);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px 0 var(--app-shadow);
}

.control-panel {
  padding: 0px 12px;
  height: 50px;
  background-color: var(--app-surface-muted);
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.controls {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  position: relative;
}

.tracking-switch {
  margin-right: 8px;
}

.switch-label {
  font-size: 12px;
  color: var(--app-text-muted);
  margin-right: 15px;
  line-height: 1;
}

.control-btn {
  padding: 6px 12px;
  background-color: var(--app-surface-raised);
  color: var(--app-text-secondary);
  border: 1px solid var(--app-border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
  line-height: 1;
  display: flex;
  align-items: center;
}

.chart-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  min-height: 0;
}

.position-chart-grid {
  flex: 1;
  display: grid;
  grid-template-rows: repeat(3, minmax(220px, 1fr));
  grid-template-columns: 1fr;
  gap: 10px;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  width: 100%;
  padding: 10px;
  box-sizing: border-box;
}

.speed-chart-container {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 10px;
  box-sizing: border-box;
  overflow: hidden;
}

.view-switch {
  width: 100px;
  margin-right: 12px;
  flex-shrink: 0;
}

.chart {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  touch-action: none;
  overscroll-behavior: none;
}

.axis-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  min-height: 0;
}

.deviation-tooltip {
  position: absolute;
  pointer-events: none;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-line;
  background-color: var(--app-surface);
  color: var(--app-text);
  border: 1px solid var(--app-border);
  box-shadow: 0 2px 8px 0 var(--app-shadow);
  z-index: 10;
}

.point-size-control {
  display: flex;
  align-items: center;
  margin-left: 10px;
}

.size-label {
  margin-right: 5px;
  font-size: 12px;
}

.point-slider {
  width: 60px;
  margin: 0 5px;
}

.size-value {
  width: 24px;
  text-align: center;
  font-size: 12px;
}

:deep(.el-slider) {
  --el-slider-height: 5px;
  --el-slider-button-size: 22px;
}

:deep(.el-slider__runway) {
  background-color: var(--app-border);
  border-radius: 4px;
}

:deep(.el-slider__bar) {
  background: #6e6e6e;
  border-radius: 4px;
}

:deep(.el-slider__button) {
  width: var(--el-slider-button-size);
  height: var(--el-slider-button-size);
  background-image: url('data:image/svg+xml;charset=utf-8;base64,PHN2ZyBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHN0eWxlPSJoZWlnaHQ6IDE2cHg7IHdpZHRoOiAxNnB4OyI+PHBhdGggZD0iTTUxMiA2NGE0NDggNDQ4IDAgMCAxIDEzMC4yNCAxOS4yMzJjLTM3LjQwOCAxNDIuNzItMTUuMDQgMjM0LjQgNzUuODQgMjY0LjcwNGwxNy4yOCA1Ljg4OCAxNi40OCA1Ljg4OGMxMDUuNTM2IDM4Ljk3NiAxMjkuMzc2IDcxLjc0NCAxMDQuNjQgMTQ1Ljk4NC0xMS4yIDMzLjYtMzQuOTQ0IDQ5LjgyNC0xMDEuNjk2IDczLjE1MmwtMzUuODQgMTIuMjI0LTE3LjQ0IDYuMzA0Yy03Mi40NDggMjcuMTA0LTEwNC40MTYgNTIuMTI4LTEyMi41NiAxMDYuNTYtMjYuMTQ0IDc4LjM2OCA4LjY0IDE1My4zNzYgOTguMTc2IDIyNC42MDhBNDQ1Ljc5MiA0NDUuNzkyIDAgMCAxIDUxMiA5NjBjLTMyLjg2NCAwLTY0Ljg5Ni0zLjUyLTk1Ljc0NC0xMC4yNCA1Ni4wOTYtNDMuMDcyIDY2LjA0OC0xMDguOCAyNC44LTE5MS4yOTYtMjYuODgtNTMuNjk2LTY5LjI0OC04My4xMzYtMTI5LjkyLTEwMS4zNDRhNDgwLjk2IDQ4MC45NiAwIDAgMC0xOS43NDQtNS40NGwtMzMuNDA4LTcuOTM2Yy0zNC4yNC04LjEyOC00OC40OC0xMy45NTItNTQuNTI4LTIxLjYzMi02LjQtOC4xNi02LjM2OC0yNS45ODQgNi41OTItNjAuMzJsMi41Ni02LjY1NmM1My44MjQtMTM0LjU2IDE1LjEwNC0yMTkuMDcyLTEwNi40NjQtMjMzLjA4OEMxNzcuNjMyIDE2OS42IDMzMi40OCA2NCA1MTIgNjR6TTgyLjQ2NCAzODQuMjU2Yzg5LjYgMy42NDggMTEwLjYyNCA0My4wNCA3My41MDQgMTQwLjA2NGwtMi43ODQgNy4wNGMtMjMuMDQgNTcuNjk2LTI0LjEyOCA5OS42NDgtMC4wNjQgMTMwLjI3MiAxNy40MDggMjIuMjA4IDM4Ljg0OCAzMS43NzYgODIuNTYgNDIuNTZsMzMuMjggNy44NzJjOS4wMjQgMi4yMDggMTYuNjQgNC4yMjQgMjMuNzc2IDYuMzY4IDQ1LjI0OCAxMy41NjggNzMuMjQ4IDMzLjAyNCA5MS4wNzIgNjguNjcyIDM1LjIgNzAuMzY4IDIxLjQ0IDExMS4zNi01MS44NCAxMzUuMjMyQzE3NC4xNzYgODUzLjAyNCA2NCA2OTUuMzYgNjQgNTEyYzAtNDQuMzg0IDYuNDY0LTg3LjI2NCAxOC40NjQtMTI3Ljc0NHogbTYxOS44MDgtMjc3Ljk1MkM4NTQuNTYgMTc3LjgyNCA5NjAgMzMyLjYwOCA5NjAgNTEyYzAgMTYzLjUyLTg3LjYxNiAzMDYuNjI0LTIxOC40OTYgMzg0LjgzMi04OC4zMi02MS44MjQtMTE5LjY4LTExOS4xNjgtMTAxLjg1Ni0xNzIuNjQgMTEuMTY4LTMzLjUzNiAzNC44OC00OS43NiAxMDEuMzQ0LTczLjAyNGwxNy4xODQtNS44NTZjOTguNzItMzIuODk2IDEzOC4wNDgtNTYuNTEyIDE1OS4wNC0xMTkuMzYgNDIuMTc2LTEyNi41OTItMTUuNTUyLTE4NC4zMi0xNzguODgtMjM4LjcyLTQ3LjItMTUuNzQ0LTYyLjQ5Ni02OS42MzItMzguNzUyLTE3MC4w');
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  border: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

:deep(.el-slider__button:hover) {
  transform: scale(1.15);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

:deep(.el-slider__button:active) {
  transform: scale(0.95);
}

.right-buttons {
  display: flex;
  align-items: center;
  margin-left: auto;
}

@container (max-width: 680px) {
  .size-label {
    display: none;
  }

  .point-size-control {
    margin-left: 4px;
  }
}
</style>
