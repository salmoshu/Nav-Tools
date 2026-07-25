<template>
  <div class="deviation-container">
    <div class="control-panel">
      <div class="controls">
        <el-button type="default" size="small" @click="showViewConfig" class="control-btn config-btn">
          <el-icon><Setting /></el-icon>&nbsp;配置
        </el-button>

        <el-button
          type="default"
          size="small"
          title="跟踪"
          aria-label="跟踪"
          class="tracking-button"
          @click="toggleTracking"
        >
          <el-icon><Aim /></el-icon>
          <span class="tracking-text">&nbsp;{{ isTracking ? "关闭跟踪" : "启用跟踪" }}</span>
        </el-button>

        <div class="point-size-control">
          <span class="size-label">尺寸:</span>
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

        <div class="legend-panel">
          <div
            v-for="track in [1, 2, 3, 4]"
            :key="track"
            class="legend-item"
            :class="{ disabled: !legendVisible[track - 1] }"
            @click="toggleLegend(track)"
          >
            <span
              class="legend-color"
              :style="{ backgroundColor: getTrackColor(track) }"
            ></span>
            <span class="legend-label">轨迹{{ track }}</span>
          </div>
        </div>

        <div class="right-buttons">
          <el-button type="text" size="small" @click="resetZoom" class="zoom-btn" style="margin: 0px 0px;">
            <el-icon><Refresh /></el-icon>
          </el-button>
          <el-button type="text" size="small" @click="clearTrack" class="clear-btn" style="margin: 0px 0px;">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
    </div>

    <div class="chart-container" ref="chartContainerRef">
      <canvas ref="canvasRef" class="chart"></canvas>
      <canvas ref="axisCanvasRef" class="axis-layer"></canvas>
      <div
        ref="tooltipRef"
        class="deviation-tooltip"
        :style="tooltipStyle"
        v-show="tooltipVisible"
      >
        {{ tooltipText }}
      </div>
      <div ref="infoBarRef" class="info-bar" v-show="infoBarVisible">
        {{ infoBarText }}
      </div>
    </div>
  </div>

  <DeviationConfigDialog
    v-model="viewConfigDialogVisible"
    :available-sources="availableSources"
    :config="deviationConfig"
    @apply="applyViewConfig"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useFlow } from '@/composables/flow/useFlow'
import { useDevice } from '@/hooks/useDevice'
import { useDataConfig } from '@/composables/flow/useDataConfig'
import { useConsole } from '@/composables/flow/useConsole'
import { useTheme } from '@/composables/useTheme'
import DeviationConfigDialog from './DeviationConfigDialog.vue'
import { createMultiSeriesTrajectoryRenderer } from '@/core/render/createMultiSeriesTrajectoryRenderer'
import type {
  MultiSeriesTrajectoryRenderer,
  PickedPoint,
} from '@/core/render/MultiSeriesTrajectoryRenderer'
import {
  clampVisibleSpan,
  fitDeviationPoints,
  fitDeviationPointsAroundCenter,
  GNSS_MIN_VISIBLE_SPAN_METERS,
} from '@/core/deviation/DeviationViewport'

const { flowData } = useFlow()
const { deviceConnected } = useDevice()
const { deviationConfig } = useDataConfig(flowData)
const { searchQuery } = useConsole(true)
const { chartTheme, resolvedTheme } = useTheme()

const LIMIT_METERS = 10000
const TRACK_IDS = ['track1', 'track2', 'track3', 'track4'] as const

type TrackId = (typeof TRACK_IDS)[number]
type TimeIndexEntry = { track1?: number; track2?: number; track3?: number; track4?: number }

const plotData = computed<Record<string, unknown>>(() => flowData.value)

const canvasRef = ref<HTMLCanvasElement | null>(null)
const axisCanvasRef = ref<HTMLCanvasElement | null>(null)
const chartContainerRef = ref<HTMLDivElement | null>(null)

let renderer: MultiSeriesTrajectoryRenderer | null = null
let axisCtx: CanvasRenderingContext2D | null = null

let axisDpr = 1
let axisCssWidth = 0
let axisCssHeight = 0

const isTracking = ref(false)
const pointSize = ref(10)
const tooltipVisible = ref(false)
const tooltipText = ref('')
const tooltipStyle = ref<Record<string, string>>({})
const infoBarVisible = ref(false)
const infoBarText = ref('')

const DRAG_THRESHOLD_PX = 3
let isDragging = false
let dragStartClientX = 0
let dragStartClientY = 0
let dragLastClientX = 0
let dragLastClientY = 0
let dragHasMoved = false

const viewport = ref({
  xMin: -10,
  xMax: 10,
  yMin: -10,
  yMax: 10,
})
let trackingXHalfSpan = 10
let trackingYHalfSpan = 10

const legendVisible = ref([true, true, true, true])

const trackData: Array<[number, number][]> = [[], [], [], []]
const trackToRawIndex: number[][] = [[], [], [], []]
const timeIndexMap = new Map<number, TimeIndexEntry>()

interface TrackAppendState {
  xRef: number[] | null
  yRef: number[] | null
  processed: number
}

const trackAppendState: TrackAppendState[] = [
  { xRef: null, yRef: null, processed: 0 },
  { xRef: null, yRef: null, processed: 0 },
  { xRef: null, yRef: null, processed: 0 },
  { xRef: null, yRef: null, processed: 0 },
]

let lastOffsetX = 0
let lastOffsetY = 0
let trackOffsetX = 0
let trackOffsetY = 0
let lastFlowRenderKey = ''
let flowUpdateFrame: number | null = null
let isPaused = true

const latestPointInfo = reactive<{
  track: number | null
  index: number
  data: [number, number] | null
}>({
  track: null,
  index: -1,
  data: null,
})

let resizeObserver: ResizeObserver | null = null
let resizeFrame: number | null = null

const viewConfigDialogVisible = ref(false)

const availableSources = computed(() => {
  if (!plotData.value || !plotData.value.plotTime) return []
  return Object.keys(plotData.value).filter(
    (key) =>
      key !== 'plotTime' &&
      key !== 'timestamp' &&
      key !== 'startTime' &&
      key !== 'rawDataKeys' &&
      Array.isArray(plotData.value[key]) &&
      (plotData.value[key] as unknown[]).length > 0,
  )
})

function getValidColor(color: string | undefined, defaultColor: string): string {
  if (!color || color === '' || !color.startsWith('#')) return defaultColor
  return color
}

function hexToRgba(color: string, alpha = 1): string {
  const validColor = getValidColor(color, '#5470c6')
  const r = parseInt(validColor.slice(1, 3), 16)
  const g = parseInt(validColor.slice(3, 5), 16)
  const b = parseInt(validColor.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function hexToRendererColor(color: string, alpha = 1): [number, number, number, number] {
  const validColor = getValidColor(color, '#5470c6')
  const r = parseInt(validColor.slice(1, 3), 16) / 255
  const g = parseInt(validColor.slice(3, 5), 16) / 255
  const b = parseInt(validColor.slice(5, 7), 16) / 255
  return [r, g, b, alpha]
}

function getTrackColor(track: number): string {
  const key = `track${track}Color` as keyof typeof deviationConfig
  return (deviationConfig[key] as { value: string }).value
}

function dataToScreenX(x: number): number {
  if (axisCssWidth <= 0) return 0
  return ((x - viewport.value.xMin) / (viewport.value.xMax - viewport.value.xMin)) * axisCssWidth
}

function dataToScreenY(y: number): number {
  if (axisCssHeight <= 0) return 0
  return (
    axisCssHeight -
    ((y - viewport.value.yMin) / (viewport.value.yMax - viewport.value.yMin)) * axisCssHeight
  )
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

function getAxisName(axis: 'X' | 'Y'): string {
  for (let i = 1; i <= 4; i++) {
    const key = `track${i}${axis}` as keyof typeof deviationConfig
    const val = (deviationConfig[key] as { value: string }).value
    if (val) return val
  }
  return ''
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

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let x = xStart; x <= xEnd + 1e-9; x += xStep) {
    const sx = dataToScreenX(x)
    ctx.beginPath()
    ctx.moveTo(sx, 0)
    ctx.lineTo(sx, height)
    ctx.stroke()
    ctx.fillText(x.toFixed(2), sx, height - 18)
  }

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (let y = yStart; y <= yEnd + 1e-9; y += yStep) {
    const sy = dataToScreenY(y)
    ctx.beginPath()
    ctx.moveTo(0, sy)
    ctx.lineTo(width, sy)
    ctx.stroke()
    ctx.fillText(y.toFixed(2), 8, sy)
  }

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

  const xAxisName = getAxisName('X')
  const yAxisName = getAxisName('Y')
  if (xAxisName) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = colors.text
    ctx.fillText(xAxisName, width / 2, height - 4)
  }
  if (yAxisName) {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = colors.text
    ctx.translate(14, height / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(yAxisName, 0, 0)
    ctx.restore()
  }

  ctx.restore()
}

function drawCurrentPositions(): void {
  if (!axisCtx || !axisCanvasRef.value) return

  const ctx = axisCtx
  ctx.save()
  ctx.setTransform(axisDpr, 0, 0, axisDpr, 0, 0)
  for (let i = 0; i < 4; i++) {
    if (!legendVisible.value[i]) continue
    const data = trackData[i]
    if (data.length === 0) continue
    const [x, y] = data[data.length - 1]
    const sx = dataToScreenX(x)
    const sy = dataToScreenY(y)
    const radius = Math.max(2, (pointSize.value * 1.2) / 2)
    const color = hexToRgba(getTrackColor(i + 1), 1)

    ctx.fillStyle = color
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(sx, sy, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

function drawHighlights(entry?: TimeIndexEntry): void {
  drawAxisLayer()
  drawCurrentPositions()
  if (!entry || !axisCtx || !axisCanvasRef.value) return

  const ctx = axisCtx
  ctx.save()
  ctx.setTransform(axisDpr, 0, 0, axisDpr, 0, 0)
  for (let i = 0; i < 4; i++) {
    if (!legendVisible.value[i]) continue
    const idx = entry[`track${i + 1}` as keyof TimeIndexEntry]
    if (idx === undefined) continue
    const point = trackData[i][idx]
    if (!point) continue
    const [x, y] = point
    const sx = dataToScreenX(x)
    const sy = dataToScreenY(y)
    const radius = Math.max(3, (pointSize.value * 1.5) / 2)
    const color = hexToRgba(getTrackColor(i + 1), 1)

    ctx.fillStyle = color
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(sx, sy, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

function updateViewport(xMin: number, xMax: number, yMin: number, yMax: number): void {
  viewport.value = { xMin, xMax, yMin, yMax }
  renderer?.setViewport(xMin, xMax, yMin, yMax)
  drawAxisLayer()
  drawCurrentPositions()
}

function resetTrackAppendState(): void {
  for (const state of trackAppendState) {
    state.xRef = null
    state.yRef = null
    state.processed = 0
  }
}

function determineTrackingTarget(sourceData: Record<string, unknown>): {
  track: number | null
  data: [number, number] | null
  index: number
} {
  for (let i = 0; i < 4; i++) {
    const n = i + 1
    const xField = (deviationConfig[`track${n}X` as keyof typeof deviationConfig] as { value: string }).value
    const yField = (deviationConfig[`track${n}Y` as keyof typeof deviationConfig] as { value: string }).value
    if (!xField || !yField) continue
    const xData = sourceData[xField] as number[] | undefined
    const yData = sourceData[yField] as number[] | undefined
    if (!xData || !yData || xData.length === 0 || yData.length === 0) continue
    const last = xData.length - 1
    return { track: n, data: [Number(xData[last]), Number(yData[last])], index: last }
  }
  return { track: null, data: null, index: -1 }
}

function syncRendererData(): void {
  if (!renderer) return

  const sourceData = plotData.value
  const configuredFields = [
    deviationConfig.track1X.value,
    deviationConfig.track1Y.value,
    deviationConfig.track2X.value,
    deviationConfig.track2Y.value,
    deviationConfig.track3X.value,
    deviationConfig.track3Y.value,
    deviationConfig.track4X.value,
    deviationConfig.track4Y.value,
  ]

  const renderKey = [
    isTracking.value,
    ...configuredFields.map((field) => {
      const values = field ? sourceData[field] : undefined
      if (!Array.isArray(values) || values.length === 0) return `${field ?? ''}:0`
      return `${field}:${values.length}:${values[0]}:${values[values.length - 1]}`
    }),
  ].join('|')

  if (renderKey === lastFlowRenderKey) return
  lastFlowRenderKey = renderKey

  const target = determineTrackingTarget(sourceData)

  let offsetX = 0
  let offsetY = 0
  if (isTracking.value && target.data) {
    offsetX = target.data[0]
    offsetY = target.data[1]
  } else if (!isTracking.value) {
    const xField = deviationConfig.track1X.value
    const yField = deviationConfig.track1Y.value
    if (xField && yField) {
      const xData = sourceData[xField] as number[] | undefined
      const yData = sourceData[yField] as number[] | undefined
      if (xData && yData && xData.length > 0 && yData.length > 0) {
        offsetX = Number(xData[0])
        offsetY = Number(yData[0])
      }
    }
  }

  if (target.track !== null && target.index >= 0) {
    latestPointInfo.track = target.track
    latestPointInfo.index = target.index
    latestPointInfo.data = target.data
  } else {
    latestPointInfo.track = null
    latestPointInfo.index = -1
    latestPointInfo.data = null
  }

  trackOffsetX = offsetX
  trackOffsetY = offsetY

  const trackSources = [
    [deviationConfig.track1X.value, deviationConfig.track1Y.value],
    [deviationConfig.track2X.value, deviationConfig.track2Y.value],
    [deviationConfig.track3X.value, deviationConfig.track3Y.value],
    [deviationConfig.track4X.value, deviationConfig.track4Y.value],
  ].map(([xField, yField]) => {
    if (!xField || !yField) return null
    const xData = sourceData[xField] as number[] | undefined
    const yData = sourceData[yField] as number[] | undefined
    if (!xData || !yData || xData.length === 0 || yData.length === 0) return null
    return { xData, yData }
  })

  const offsetUnchanged = offsetX === lastOffsetX && offsetY === lastOffsetY
  const canAppend =
    offsetUnchanged &&
    trackSources.every((source, index) => {
      const state = trackAppendState[index]
      if (!source) return state.processed === 0
      return state.xRef === source.xData && state.yRef === source.yData
    })

  if (!canAppend) {
    for (let i = 0; i < 4; i++) {
      trackData[i].length = 0
      trackToRawIndex[i].length = 0
      renderer.clearSeries(TRACK_IDS[i])
    }
    timeIndexMap.clear()
    resetTrackAppendState()
  }

  lastOffsetX = offsetX
  lastOffsetY = offsetY

  const timestamps = sourceData.timestamp as number[] | undefined

  for (let i = 0; i < 4; i++) {
    const source = trackSources[i]
    if (!source) continue

    const xData = source.xData
    const yData = source.yData
    const state = trackAppendState[i]
    const len = Math.min(xData.length, yData.length)
    const start = canAppend ? Math.min(state.processed, len) : 0

    const batch: Array<[number, number, number]> = []
    for (let j = start; j < len; j++) {
      const x = Number(xData[j])
      const y = Number(yData[j])
      if (Number.isFinite(x) && Number.isFinite(y)) {
        const rx = Math.round((x - offsetX) * 1000) / 1000
        const ry = Math.round((y - offsetY) * 1000) / 1000
        trackData[i].push([rx, ry])
        trackToRawIndex[i].push(j)
        if (timestamps) {
          const time = timestamps[j]
          let entry = timeIndexMap.get(time)
          if (!entry) {
            entry = {}
            timeIndexMap.set(time, entry)
          }
          const key = `track${i + 1}` as keyof TimeIndexEntry
          if (entry[key] === undefined) entry[key] = trackData[i].length - 1
        }
        batch.push([rx, ry, 0])
      }
    }

    if (batch.length > 0) {
      if (canAppend) {
        renderer.appendSeriesDataBatch(TRACK_IDS[i], batch)
      } else {
        renderer.setSeriesData(TRACK_IDS[i], batch)
      }
    }

    state.xRef = xData
    state.yRef = yData
    state.processed = len
  }
}

function handleFlowUpdate(): void {
  if (!renderer) return
  syncRendererData()

  if (isTracking.value) {
    updateViewport(
      -trackingXHalfSpan,
      trackingXHalfSpan,
      -trackingYHalfSpan,
      trackingYHalfSpan,
    )
  } else {
    renderer.render()
    drawAxisLayer()
    drawCurrentPositions()
  }
}

function scheduleFlowDataUpdate(): void {
  if (document.hidden) return
  if (flowUpdateFrame !== null) return
  flowUpdateFrame = requestAnimationFrame(() => {
    flowUpdateFrame = null
    handleFlowUpdate()
  })
}

function cancelScheduledFlowUpdate(): void {
  if (flowUpdateFrame !== null) {
    cancelAnimationFrame(flowUpdateFrame)
    flowUpdateFrame = null
  }
}

function pauseDataUpdate(): void {
  isPaused = true
}

function resumeDataUpdate(): void {
  isPaused = false
  scheduleFlowDataUpdate()
}

function showViewConfig(): void {
  viewConfigDialogVisible.value = true
}

function applyViewConfig(): void {
  if (
    !deviationConfig.track1X.value &&
    !deviationConfig.track2X.value &&
    !deviationConfig.track3X.value &&
    !deviationConfig.track4X.value
  ) {
    ElMessage({
      message: '请至少配置一条轨迹的X轴和Y轴字段',
      type: 'warning',
      placement: 'bottom-right',
      offset: 50,
    })
    return
  }
  viewConfigDialogVisible.value = false
  lastFlowRenderKey = ''
  handleFlowUpdate()
}

function toggleTracking(): void {
  isTracking.value = !isTracking.value
  lastFlowRenderKey = ''
  if (isTracking.value) {
    syncRendererData()
    const xSpan = viewport.value.xMax - viewport.value.xMin
    const ySpan = viewport.value.yMax - viewport.value.yMin
    trackingXHalfSpan = xSpan / 2
    trackingYHalfSpan = ySpan / 2
    updateViewport(-trackingXHalfSpan, trackingXHalfSpan, -trackingYHalfSpan, trackingYHalfSpan)
  } else {
    resetZoom()
  }
}

function resetZoom(): void {
  if (!renderer || !chartContainerRef.value) return
  syncRendererData()

  const allPoints: [number, number][] = []
  for (let i = 0; i < 4; i++) {
    allPoints.push(...trackData[i])
  }

  const width = chartContainerRef.value.clientWidth || 1
  const height = chartContainerRef.value.clientHeight || 1
  const newViewport = isTracking.value
    ? fitDeviationPointsAroundCenter(allPoints, 0, 0, width / height, GNSS_MIN_VISIBLE_SPAN_METERS)
    : fitDeviationPoints(allPoints, width / height, GNSS_MIN_VISIBLE_SPAN_METERS)

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
  cancelScheduledFlowUpdate()
  renderer?.clear()
  for (let i = 0; i < 4; i++) {
    trackData[i].length = 0
    trackToRawIndex[i].length = 0
    renderer?.clearSeries(TRACK_IDS[i])
  }
  timeIndexMap.clear()
  resetTrackAppendState()
  lastFlowRenderKey = ''
  updateViewport(-10, 10, -10, 10)
}

function updatePointSize(): void {
  renderer?.setPointSize(pointSize.value)
  drawAxisLayer()
  drawCurrentPositions()
}

function toggleLegend(track: number): void {
  const idx = track - 1
  legendVisible.value[idx] = !legendVisible.value[idx]
  renderer?.setSeriesVisible(TRACK_IDS[idx], legendVisible.value[idx])
  drawAxisLayer()
  drawCurrentPositions()
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
}

function seriesIdToTrackNumber(seriesId: TrackId): number {
  return TRACK_IDS.indexOf(seriesId) + 1
}

function showHover(picked: PickedPoint, sx: number, sy: number): void {
  const trackNum = seriesIdToTrackNumber(picked.seriesId as TrackId)
  const rawIndex = trackToRawIndex[trackNum - 1][picked.pointIndex]
  const time = (plotData.value.timestamp as number[] | undefined)?.[rawIndex]
  if (time === undefined) {
    hideHover()
    return
  }

  const xField = (deviationConfig[`track${trackNum}X` as keyof typeof deviationConfig] as { value: string }).value
  const yField = (deviationConfig[`track${trackNum}Y` as keyof typeof deviationConfig] as { value: string }).value
  const originX = Number((plotData.value[xField] as number[] | undefined)?.[rawIndex])
  const originY = Number((plotData.value[yField] as number[] | undefined)?.[rawIndex])

  tooltipVisible.value = true
  tooltipText.value = `(${picked.x.toFixed(3)}, ${picked.y.toFixed(3)})`
  tooltipStyle.value = {
    left: `${sx + 12}px`,
    top: `${sy + 12}px`,
  }

  infoBarText.value = `轨迹${trackNum} 🕐time: ${time.toFixed(3)} 📍${xField}:${originX.toFixed(3)}, ${yField}:${originY.toFixed(3)}`
  infoBarVisible.value = true

  drawHighlights(timeIndexMap.get(time))
}

function hideHover(): void {
  tooltipVisible.value = false
  infoBarVisible.value = false
  drawAxisLayer()
  drawCurrentPositions()
}

function handleMouseMove(e: MouseEvent): void {
  if (isDragging) {
    hideHover()
    return
  }
  if (!renderer || !canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  const picked = renderer.pickPoint(sx, sy)
  if (picked) {
    showHover(picked, sx, sy)
  } else {
    hideHover()
  }
}

function handleDblClick(e: MouseEvent): void {
  if (!renderer || !canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  const picked = renderer.pickPoint(sx, sy)
  if (!picked) return

  const trackNum = seriesIdToTrackNumber(picked.seriesId as TrackId)
  const rawIndex = trackToRawIndex[trackNum - 1][picked.pointIndex]
  const rawTime = (plotData.value.timestamp as number[] | undefined)?.[rawIndex]
  if (rawTime === undefined) return

  const parts = rawTime.toString().split('.')
  const targetTime = parts[0] + (parts[1] ? '.' + parts[1].substring(0, 2) : '.00')
  searchQuery.value = '"time":' + targetTime
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
    hideHover()
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
      drawCurrentPositions()
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
  renderer = createMultiSeriesTrajectoryRenderer(canvasRef.value)
  axisCtx = axisCanvasRef.value.getContext('2d')

  const width = chartContainerRef.value.clientWidth
  const height = chartContainerRef.value.clientHeight
  renderer.onResize(width, height)
  resizeAxisCanvas(width, height)

  for (let i = 0; i < 4; i++) {
    renderer.addSeries(TRACK_IDS[i], hexToRendererColor(getTrackColor(i + 1)))
    renderer.setSeriesVisible(TRACK_IDS[i], legendVisible.value[i])
  }
  renderer.setPointSize(pointSize.value)
  updateViewport(-10, 10, -10, 10)

  canvasRef.value.addEventListener('wheel', handleWheel, { passive: false, capture: true })
  canvasRef.value.addEventListener('mousemove', handleMouseMove)
  canvasRef.value.addEventListener('mouseleave', hideHover)
  canvasRef.value.addEventListener('dblclick', handleDblClick)
  canvasRef.value.addEventListener('mousedown', handleMouseDown)
}

onMounted(() => {
  nextTick(() => {
    initRenderer()
    setupResizeObserver()

    watch(
      deviceConnected,
      () => {
        if (deviceConnected.value) {
          resumeDataUpdate()
        } else {
          pauseDataUpdate()
        }
      },
      { immediate: true },
    )

    watch(
      () => (plotData.value.timestamp as number[] | undefined)?.length,
      () => {
        if (!isPaused) scheduleFlowDataUpdate()
      },
    )

    watch(
      [
        deviationConfig.track1X,
        deviationConfig.track1Y,
        deviationConfig.track2X,
        deviationConfig.track2Y,
        deviationConfig.track3X,
        deviationConfig.track3Y,
        deviationConfig.track4X,
        deviationConfig.track4Y,
      ],
      () => {
        lastFlowRenderKey = ''
        scheduleFlowDataUpdate()
      },
    )

    for (let i = 0; i < 4; i++) {
      watch(
        deviationConfig[`track${i + 1}Color` as keyof typeof deviationConfig] as Ref<string>,
        (color) => {
          renderer?.setSeriesColor(TRACK_IDS[i], hexToRendererColor(color))
        },
      )
    }

    watch(resolvedTheme, () => {
      nextTick(() => {
        drawAxisLayer()
        drawCurrentPositions()
      })
    })
  })
})

onUnmounted(() => {
  cancelScheduledFlowUpdate()
  teardownResizeObserver()
  if (canvasRef.value) {
    canvasRef.value.removeEventListener('wheel', handleWheel)
    canvasRef.value.removeEventListener('mousemove', handleMouseMove)
    canvasRef.value.removeEventListener('mouseleave', hideHover)
    canvasRef.value.removeEventListener('dblclick', handleDblClick)
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: var(--app-surface-muted);
  border-bottom: 1px solid var(--app-border);
  height: 50px;
  box-sizing: border-box;
}

.controls {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  position: relative;
  gap: 8px;
}

.switch-label {
  font-size: 12px;
  color: var(--app-text-muted);
  margin-right: 5px;
  line-height: 1;
}

.control-btn {
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
  display: block;
}

.chart {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
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

.info-bar {
  position: absolute;
  top: 10px;
  left: 10px;
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
  margin: 0 10px;
}

.size-label {
  margin-right: 5px;
  font-size: 12px;
  color: var(--app-text-muted);
  line-height: 1;
}

.point-slider {
  width: 50px;
  margin: 0 5px;
}

.size-value {
  width: 24px;
  text-align: center;
  font-size: 12px;
}

.legend-panel {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: 8px;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  color: var(--app-text);
  opacity: 1;
  transition: opacity 0.2s ease;
}

.legend-item.disabled {
  opacity: 0.4;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid var(--app-border);
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
  background-image: url("data:image/svg+xml;charset=utf-8;base64,PHN2ZyBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHN0eWxlPSJoZWlnaHQ6IDE2cHg7IHdpZHRoOiAxNnB4OyI+PHBhdGggZD0iTTUxMiA2NGE0NDggNDQ4IDAgMCAxIDEzMC4yNCAxOS4yMzJjLTM3LjQwOCAxNDIuNzItMTUuMDQgMjM0LjQgNzUuODQgMjY0LjcwNGwxNy4yOCA1Ljg4OCAxNi40OCA1Ljg4OGMxMDUuNTM2IDM4Ljk3NiAxMjkuMzc2IDcxLjc0NCAxMDQuNjQgMTQ1Ljk4NC0xMS4yIDMzLjYtMzQuOTQ0IDQ5LjgyNC0xMDEuNjk2IDczLjE1MmwtMzUuODQgMTIuMjI0LTE3LjQ0IDYuMzA0Yy03Mi40NDggMjcuMTA0LTEwNC40MTYgNTIuMTI4LTEyMi41NiAxMDYuNTYtMjYuMTQ0IDc4LjM2OCA4LjY0IDE1My4zNzYgOTguMTc2IDIyNC42MDhBNDQ1Ljc5MiA0NDUuNzkyIDAgMCAxIDUxMiA5NjBjLTMyLjg2NCAwLTY0Ljg5Ni0zLjUyLTk1Ljc0NC0xMC4yNCA1Ni4wOTYtNDMuMDcyIDY2LjA0OC0xMDguOCAyNC44LTE5MS4yOTYtMjYuODgtNTMuNjk2LTY5LjI0OC04My4xMzYtMTI5LjkyLTEwMS4zNDRhNDgwLjk2IDQ4MC45NiAwIDAgMC0xOS43NDQtNS40NGwtMzMuNDA4LTcuOTM2Yy0zNC4yNC04LjEyOC00OC40OC0xMy45NTItNTQuNTI4LTIxLjYzMi02LjQtOC4xNi02LjM2OC0yNS45ODQgNi41OTItNjAuMzJsMi41Ni02LjY1NmM1My44MjQtMTM0LjU2IDE1LjEwNC0yMTkuMDcyLTEwNi40NjQtMjMzLjA4OEMxNzcuNjMyIDE2OS42IDMzMi40OCA2NCA1MTIgNjR6TTgyLjQ2NCAzODQuMjU2Yzg5LjYgMy42NDggMTEwLjYyNCA0My4wNCA3My41MDQgMTQwLjA2NGwtMi43ODQgNy4wNGMtMjMuMDQgNTcuNjk2LTI0LjEyOCA5OS42NDgtMC4wNjQgMTMwLjI3MiAxNy40MDggMjIuMjA4IDM4Ljg0OCAzMS43NzYgODIuNTYgNDIuNTZsMzMuMjggNy44NzJjOS4wMjQgMi4yMDggMTYuNjQgNC4yMjQgMjMuNzc2IDYuMzY4IDQ1LjI0OCAxMy41NjggNzMuMjQ4IDMzLjAyNCA5MS4wNzIgNjguNjcyIDM1LjIgNzAuMzY4IDIxLjQ0IDExMS4zNi01MS44NCAxMzUuMjMyQzE3NC4xNzYgODUzLjAyNCA2NCA2OTUuMzYgNjQgNTEyYzAtNDQuMzg0IDYuNDY0LTg3LjI2NCAxOC40NjQtMTI3Ljc0NHogbTYxOS44MDgtMjc3Ljk1MkM4NTQuNTYgMTc3LjgyNCA5NjAgMzMyLjYwOCA5NjAgNTEyYzAgMTYzLjUyLTg3LjYxNiAzMDYuNjI0LTIxOC40OTYgMzg0LjgzMi04OC4zMi02MS44MjQtMTE5LjY4LTExOS4xNjgtMTAxLjg1Ni0xNzIuNjQgMTEuMTY4LTMzLjUzNiAzNC44OC00OS43NiAxMDEuMzQ0LTczLjAyNGwxNy4xODQtNS44NTZjOTguNzItMzIuODk2IDEzOC4wNDgtNTYuNTEyIDE1OS4wNC0xMTkuMzYgNDIuMTc2LTEyNi41OTItMTUuNTUyLTE4NC4zMi0xNzguODgtMjM4LjcyLTQ3LjItMTUuNzQ0LTYyLjQ5Ni02OS42MzItMzguNzUyLTE3MC4w");
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
  gap: 4px;
}

@container (max-width: 680px) {
  .tracking-text,
  .size-label {
    display: none;
  }

  .point-size-control {
    margin: 0 4px;
  }

  .legend-label {
    display: none;
  }

  .legend-panel {
    gap: 6px;
    margin-left: 4px;
  }
}
</style>
