<template>
  <div class="deviation-container">
    <div class="control-panel">
      <div class="controls">
        <el-select v-model="currentView" size="small" class="view-switch">
          <el-option :label="t('gnss.deviation.deviationView')" value="deviation" />
          <el-option :label="t('gnss.deviation.positionView')" value="position" />
          <el-option :label="t('gnss.deviation.speedView')" value="speed" />
        </el-select>
        <!-- track/尺寸/reset/清除 三个视图共用：偏差图作用于轨迹渲染，
             位置/速度图作用于点直径与 x 视口跟随 -->
        <el-switch
          v-model="isTracking"
          inline-prompt
          :active-text="t('gnss.deviation.tracking')"
          :inactive-text="t('gnss.deviation.tracking')"
          :aria-label="t('gnss.deviation.tracking')"
          :title="t('gnss.deviation.tracking')"
          class="tracking-switch"
          @change="toggleTracking"
        />
        <div class="point-size-control">
          <span class="size-label">{{ t('gnss.deviation.size') }}:</span>
          <el-slider
            v-model="pointSize"
            :min="5"
            :max="20"
            :step="1"
            :show-tooltip="false"
            class="point-slider"
            @change="updatePointSize"
          />
          <span class="size-value">{{ pointSize }}</span>
        </div>

        <div class="right-buttons">
          <el-button
            type="primary"
            size="small"
            class="control-btn status-toggle-btn"
            :class="{ active: statusCardVisible }"
            :aria-pressed="statusCardVisible"
            :aria-label="t('gnss.deviation.toggleStatus')"
            :title="t('gnss.deviation.toggleStatus')"
            @click="statusCardVisible = !statusCardVisible"
          >
            <el-icon><InfoFilled /></el-icon>
            <span class="status-toggle-copy">{{ t('gnss.deviation.positionStatus') }}</span>
          </el-button>
          <el-button
            type="primary"
            size="small"
            class="control-btn zoom-btn"
            :aria-label="t('gnss.deviation.resetLayout')"
            :title="t('gnss.deviation.resetLayout')"
            @click="resetLayout"
            ><el-icon><RefreshLeft /></el-icon
            ><span class="control-btn-label">{{ t('gnss.deviation.resetLayout') }}</span></el-button
          >
          <el-button
            type="primary"
            size="small"
            class="control-btn clear-btn"
            :aria-label="t('gnss.deviation.clear')"
            :title="t('gnss.deviation.clear')"
            @click="clearTrack"
            ><el-icon><Delete /></el-icon
            ><span class="control-btn-label">{{ t('gnss.deviation.clear') }}</span></el-button
          >
        </div>
      </div>
    </div>
    <div
      v-show="currentView === 'deviation'"
      ref="visualContainerRef"
      class="deviation-visual-container"
    >
      <div v-show="layerMode === 'grid'" ref="chartContainerRef" class="chart-container">
        <canvas ref="canvasRef" class="chart"></canvas>
        <canvas ref="axisCanvasRef" class="axis-layer"></canvas>
        <div
          v-show="tooltipVisible"
          ref="tooltipRef"
          class="deviation-tooltip"
          :style="tooltipStyle"
        >
          {{ tooltipText }}
        </div>
      </div>
      <div v-if="mapLayerReady" v-show="layerMode === 'map'" class="map-layer-container">
        <GnssMap
          ref="mapLayerRef"
          v-model:tracking="isTracking"
          v-model:point-size="pointSize"
          :active="currentView === 'deviation' && layerMode === 'map'"
          :view-sync="mapViewState"
          :show-toolbar="false"
          @view-change="handleMapViewChange"
        />
      </div>

      <section
        v-if="statusCardVisible"
        class="deviation-status-card"
        :class="{ 'is-compact': statusCardCompact }"
      >
        <div class="status-card-header">
          <span v-if="currentStats" class="status-card-heading">
            <span
              class="status-card-indicator"
              :style="{ backgroundColor: currentStatusColor }"
            ></span>
            <span>{{ t('gnss.deviation.positionStatus') }}</span>
          </span>
          <strong class="status-card-summary" :style="{ color: currentStatusColor }">
            {{ currentStatusLabel }}
          </strong>
          <button
            type="button"
            class="status-card-close"
            :aria-label="t('gnss.deviation.closeStatus')"
            :title="t('gnss.deviation.closeStatus')"
            @click="statusCardVisible = false"
          >
            <el-icon><Close /></el-icon>
          </button>
        </div>

        <div v-if="!statusCardCompact && currentStats" class="status-card-body">
          <div class="status-card-stats">
            <div class="status-card-stat-grid">
              <div class="status-card-stat">
                <span>{{ t('gnss.deviation.sampleCount') }}</span>
                <strong>{{ currentStats.count.toLocaleString() }}</strong>
              </div>
              <div
                v-for="row in qualityRows"
                :key="row.quality"
                class="status-card-stat status-card-quality"
              >
                <span>{{ numberToQuality(row.quality) }}</span>
                <strong>{{ row.count.toLocaleString() }} / {{ row.ratio }}%</strong>
              </div>
            </div>
            <div class="status-card-metrics">
              <div class="status-card-metric">
                <span>AVE</span>
                <span>E {{ formatStatMeters(currentStats.aveE) }}</span>
                <span>N {{ formatStatMeters(currentStats.aveN) }}</span>
              </div>
              <div class="status-card-metric">
                <span>STD</span>
                <span>E {{ formatStatMeters(currentStats.stdE) }}</span>
                <span>N {{ formatStatMeters(currentStats.stdN) }}</span>
              </div>
              <div class="status-card-metric status-card-metric-rms">
                <span>RMS</span>
                <span>E {{ formatStatMeters(currentStats.rmsE) }}</span>
                <span>N {{ formatStatMeters(currentStats.rmsN) }}</span>
                <span>2D {{ formatStatMeters(currentStats.rms2dDoubled) }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div class="scale-readout-container" :aria-label="scaleLabel">
        <span class="scale-readout-label">{{ scaleLabel }}</span>
        <span
          class="scale-readout-line"
          :style="{ width: `${scaleBarDisplayWidth}px` }"
          aria-hidden="true"
        ></span>
      </div>
      <div
        class="layer-switcher"
        :class="{ 'is-map': layerMode === 'map' }"
        role="group"
        :aria-label="t('gnss.deviation.layerToggle')"
      >
        <button
          type="button"
          class="layer-icon-button"
          :class="{ active: layerMode === 'grid' }"
          :aria-pressed="layerMode === 'grid'"
          :aria-label="t('gnss.deviation.gridLayer')"
          :title="t('gnss.deviation.gridLayer')"
          @click="selectLayer('grid')"
        >
          <el-icon><Grid /></el-icon>
        </button>
        <button
          type="button"
          class="layer-icon-button"
          :class="{ active: layerMode === 'map' }"
          :aria-pressed="layerMode === 'map'"
          :aria-label="t('gnss.deviation.mapLayer')"
          :title="t('gnss.deviation.mapLayer')"
          @click="selectLayer('map')"
        >
          <el-icon><MapLocation /></el-icon>
        </button>
      </div>
    </div>
    <div v-show="currentView === 'position'" class="position-chart-grid">
      <GnssMetricTimeSeries
        ref="eSeriesRef"
        field="E"
        :x-scrollbar="false"
        :label="t('gnss.deviation.axisE')"
        unit="m"
        :active="currentView === 'position'"
        :tracking="isTracking"
        :point-size="pointSize"
      />
      <GnssMetricTimeSeries
        ref="nSeriesRef"
        field="N"
        :x-scrollbar="false"
        :label="t('gnss.deviation.axisN')"
        unit="m"
        :active="currentView === 'position'"
        :tracking="isTracking"
        :point-size="pointSize"
      />
      <!-- 最下方的 U 图提供共享时间滚动条，经视口广播同步 E/N/U。 -->
      <GnssMetricTimeSeries
        ref="uSeriesRef"
        field="U"
        :label="t('gnss.deviation.axisU')"
        unit="m"
        :active="currentView === 'position'"
        :tracking="isTracking"
        :point-size="pointSize"
      />
    </div>
    <div v-show="currentView === 'speed'" class="speed-chart-container">
      <GnssMetricTimeSeries
        ref="speedSeriesRef"
        field="SPEED"
        :label="t('gnss.deviation.speed')"
        unit="km/h"
        :active="currentView === 'speed'"
        :tracking="isTracking"
        :point-size="pointSize"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { gnssDisplayContext } from '@/composables/gnss/GnssDisplayContext'
import { Close, Delete, Grid, InfoFilled, MapLocation, RefreshLeft } from '@element-plus/icons-vue'
import { useNmea, numberToQuality } from '@/composables/gnss/useNmea'
import { useFileTimeline } from '@/composables/useFileTimeline'
import { fixStatusColorRgb01 } from '@/components/windows/gnss/fixStatusColors'
import { useTheme } from '@/composables/useTheme'
import { createTrajectoryRenderer } from '@/core/render/createTrajectoryRenderer'
import { t } from '@/i18n'
import type { TrajectoryRenderer } from '@/core/render/TrajectoryRenderer'
import GnssMetricTimeSeries from './GnssMetricTimeSeries.vue'
import GnssMap, { type GnssMapViewSync, type GnssMapViewChange } from './GnssMap.vue'
import {
  clampVisibleSpan,
  clampViewportCenter,
  equalizeViewportScale,
  fitDeviationPoints,
  fitDeviationPointsAroundCenter,
  GNSS_MIN_VISIBLE_SPAN_METERS,
} from '@/core/deviation/DeviationViewport'
import { computeDeviationStats, type DeviationStats } from '@/core/deviation/DeviationStats'
import { findPositionEpoch } from '@/core/gnss/EpochSelection'

const scopedDisplay = inject(gnssDisplayContext, null)
const {
  deviationPoints: plotData,
  mapTrackPoints,
  currentData,
  positionEpochHistory,
  clearData,
} = scopedDisplay?.data ?? useNmea()
const fileTimeline = scopedDisplay?.timeline ?? useFileTimeline()
const { chartTheme, resolvedTheme } = useTheme()

const LIMIT_METERS = 10000
const RENDER_QUEUE_TARGET_FRAMES = 2
const RENDER_MAX_POINTS_PER_FRAME = 128
const RENDER_BUDGET_MS = 4
const BULK_RENDER_THRESHOLD = 512

const canvasRef = ref<HTMLCanvasElement | null>(null)
const axisCanvasRef = ref<HTMLCanvasElement | null>(null)
const chartContainerRef = ref<HTMLDivElement | null>(null)
const visualContainerRef = ref<HTMLDivElement | null>(null)
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
const statusCardVisible = ref(true)
const statusCardCompact = ref(false)
const mapLayerReady = ref(false)
const mapLayerRef = ref<InstanceType<typeof GnssMap> | null>(null)
const scaleLabel = ref('—')
const scaleBarLength = ref(52)
const scaleBarDisplayWidth = computed(() => Math.max(1, scaleBarLength.value))

let stopWatch: (() => void) | null = null
let stopThemeWatch: (() => void) | null = null
let stopTimelineWatch: (() => void) | null = null

type DeviationView = 'deviation' | 'position' | 'speed'
type DeviationLayer = 'grid' | 'map'

const currentView = ref<DeviationView>('deviation')
const layerMode = ref<DeviationLayer>('grid')

const currentStatusPoint = computed<[number, number, number] | undefined>(() => {
  const timelinePoint = getTimelinePositionPoint()
  if (timelinePoint) return timelinePoint
  const points = plotData.value
  return points.length > 0 ? points[points.length - 1] : undefined
})

const currentStatusLabel = computed(() => {
  const point = currentStatusPoint.value
  return point ? numberToQuality(point[2]) : t('gnss.deviation.statusUnavailable')
})

const currentStatusColor = computed(() => {
  const point = currentStatusPoint.value
  if (!point) return 'var(--app-text-muted)'
  const [r, g, b] = qualityToRgb(point[2])
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 1)`
})

const mapViewState = computed<GnssMapViewSync | null>(() => {
  const { firstLongitude, firstLatitude } = currentData.value
  if (mapTrackPoints.value.length === 0 || firstLongitude === null || firstLatitude === null) {
    return null
  }
  const widthPixels = Math.max(
    1,
    axisCssWidth ||
      chartContainerRef.value?.clientWidth ||
      visualContainerRef.value?.clientWidth ||
      1,
  )
  return {
    centerE: (viewport.value.xMin + viewport.value.xMax) / 2,
    centerN: (viewport.value.yMin + viewport.value.yMax) / 2,
    // Use the same fixed origin as the ENU parser, including when the file
    // timeline is positioned before the final map point.
    anchorE: 0,
    anchorN: 0,
    anchorLongitude: firstLongitude,
    anchorLatitude: firstLatitude,
    spanMeters: Math.max(GNSS_MIN_VISIBLE_SPAN_METERS, viewport.value.xMax - viewport.value.xMin),
    widthPixels,
  }
})

// 位置/速度图实例：工具栏 reset/clear 在这些视图下转发给它们
const eSeriesRef = ref<InstanceType<typeof GnssMetricTimeSeries> | null>(null)
const nSeriesRef = ref<InstanceType<typeof GnssMetricTimeSeries> | null>(null)
const uSeriesRef = ref<InstanceType<typeof GnssMetricTimeSeries> | null>(null)
const speedSeriesRef = ref<InstanceType<typeof GnssMetricTimeSeries> | null>(null)

/** 工具栏「重置布局」：偏差图重置轨迹视口；位置/速度图重置各轴（fit/居中/清手动范围） */
function resetLayout(): void {
  if (currentView.value === 'deviation') {
    if (layerMode.value === 'map') {
      mapLayerRef.value?.resetLayout?.()
      return
    }
    resetZoom()
    return
  }
  eSeriesRef.value?.resetLayout()
  nSeriesRef.value?.resetLayout()
  uSeriesRef.value?.resetLayout()
  speedSeriesRef.value?.resetLayout()
}

function selectLayer(layer: DeviationLayer): void {
  if (layerMode.value === layer) return
  if (layer === 'map') mapLayerReady.value = true
  layerMode.value = layer
  if (layer === 'grid') {
    requestAnimationFrame(() => {
      if (currentView.value === 'deviation') {
        drawAxisLayer()
        drawCurrentPosition()
      }
    })
  }
}

function handleMapViewChange(view: GnssMapViewChange): void {
  if (
    currentView.value !== 'deviation' ||
    layerMode.value !== 'map' ||
    !Number.isFinite(view.spanMeters) ||
    view.spanMeters <= 0 ||
    !Number.isFinite(view.widthPixels) ||
    view.widthPixels <= 0
  ) {
    return
  }
  const height = Math.max(1, visualContainerRef.value?.clientHeight || axisCssHeight)
  const ySpan = view.spanMeters * (height / view.widthPixels)
  const step = niceTickStep(Math.min(view.spanMeters, ySpan))
  scaleLabel.value = formatScaleLabel(step)
  scaleBarLength.value = (step / view.spanMeters) * view.widthPixels

  const { centerE, centerN } = view
  if (
    view.synchronized ||
    centerE === undefined ||
    centerN === undefined ||
    !Number.isFinite(centerE) ||
    !Number.isFinite(centerN)
  ) {
    return
  }
  // Map gestures update the shared viewport before the next live epoch can
  // apply tracking, preserving the user's zoom and offset from the track.
  updateViewport(
    centerE - view.spanMeters / 2,
    centerE + view.spanMeters / 2,
    centerN - ySpan / 2,
    centerN + ySpan / 2,
  )
  syncTrackingSpans()
  const trackingPoint = getTrackingCenterPoint()
  if (trackingPoint) {
    panOffsetX = (viewport.value.xMin + viewport.value.xMax) / 2 - trackingPoint[0]
    panOffsetY = (viewport.value.yMin + viewport.value.yMax) / 2 - trackingPoint[1]
  }
}

function updateStatusCardCompact(): void {
  const container = visualContainerRef.value
  if (!container) return
  statusCardCompact.value = container.clientWidth < 620 || container.clientHeight < 340
}

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

/** 轴刻度纯数字（rtkplot numText 口径：小数位由刻度步长决定，单位集中到右下角标尺） */
function formatTickNumber(value: number, step: number): string {
  const decimals = Math.min(4, Math.max(0, Math.floor(0.9 - Math.log10(step))))
  return value.toFixed(decimals)
}

/** rtkplot 口径刻度单位：mm/cm/m/km 择一 */
function formatScaleLabel(meters: number): string {
  if (meters < 0.0099) return `${Number((meters * 1000).toPrecision(3))} mm`
  if (meters < 0.999) return `${(meters * 100).toFixed(0)} cm`
  if (meters < 999) return `${meters.toFixed(0)} m`
  return `${(meters / 1000).toFixed(0)} km`
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

function niceTickStep(span: number, targetTicks = 12): number {
  if (!Number.isFinite(span) || span <= 0) return 1
  const rough = span / targetTicks
  const exp = Math.floor(Math.log10(rough))
  const fraction = rough / Math.pow(10, exp)
  let step = 10
  if (fraction <= 2) step = 2
  else if (fraction <= 5) step = 5
  return Math.max(GNSS_MIN_VISIBLE_SPAN_METERS, step * Math.pow(10, exp))
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
  // 两轴共用同一步长：等比例视口下网格为正方形，且比稀疏的 6 格线密一倍
  const step = niceTickStep(Math.min(xMax - xMin, yMax - yMin))
  const xStep = step
  const yStep = step

  const xStart = Math.ceil(xMin / xStep) * xStep
  const xEnd = Math.floor(xMax / xStep) * xStep
  const yStart = Math.ceil(yMin / yStep) * yStep
  const yEnd = Math.floor(yMax / yStep) * yStep

  ctx.strokeStyle = colors.grid
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.font = '12px sans-serif'
  // 轴数值用主文字色：textMuted 在浅色主题下偏灰难以辨认
  ctx.fillStyle = colors.text

  // Vertical grid lines and x-axis labels at the bottom edge.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let x = xStart; x <= xEnd + 1e-9; x += xStep) {
    const sx = dataToScreenX(x)
    ctx.beginPath()
    ctx.moveTo(sx, 0)
    ctx.lineTo(sx, height)
    ctx.stroke()
    ctx.fillText(formatTickNumber(x, xStep), sx, height - 18)
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
    ctx.fillText(formatTickNumber(y, yStep), 8, sy)
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

  // The hidden grid must not overwrite the visible map's scale readout.
  const barLength = dataToScreenX(step) - dataToScreenX(0)
  if (layerMode.value === 'grid' && barLength > 0) {
    scaleBarLength.value = barLength
    scaleLabel.value = formatScaleLabel(step)
  }

  ctx.restore()
}

/** 统计缓存：仅当数据量或首点引用变化时重算（跟踪模式每帧重绘轴层） */
let statsCache: DeviationStats | null = null
let statsCacheLength = -1
let statsCacheFirst: readonly number[] | undefined

function deviationStats(): DeviationStats | null {
  const points = plotData.value
  if (statsCacheLength === points.length && statsCacheFirst === points[0]) return statsCache
  statsCache = computeDeviationStats(points)
  statsCacheLength = points.length
  statsCacheFirst = points[0]
  return statsCache
}

const currentStats = computed(() => deviationStats())
const qualityRows = computed(() => {
  const stats = currentStats.value
  if (!stats) return []
  return [...stats.qualityCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([quality, count]) => ({
      quality,
      count,
      ratio: ((count / stats.count) * 100).toFixed(1),
    }))
})

function formatStatMeters(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 100) return `${value.toFixed(1)} m`
  if (abs >= 1) return `${value.toFixed(3)} m`
  return `${value.toFixed(4)} m`
}

/**
 * rtkplot 风格统计信息层：画在轴层右上角空白处。
 * 内容对齐 rtkplot drawTrackStatistics / updateInfoSolution：
 * 当前解状态（时间线光标或最新点）、点数 N、解质量分布、AVE/STD/RMS(E/N) 与 2D RMS。
 */
function drawStatsOverlay(): void {
  if (!axisCtx || !axisCanvasRef.value) return
  const colors = chartTheme.value
  const ctx = axisCtx
  const width = axisCssWidth
  const height = axisCssHeight
  if (width <= 0 || height <= 0) return

  const currentPoint = getTimelinePositionPoint() ?? getLatestRenderedPoint()
  const lines: Array<{ text: string; color?: string; strong?: boolean }> = []

  if (currentPoint) {
    const [r, g, b] = qualityToRgb(currentPoint[2])
    lines.push({
      text: `${t('gnss.deviation.statsCurrent')}: ${numberToQuality(currentPoint[2])}`,
      color: `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 1)`,
      strong: true,
    })
  }

  // A normal dashboard card keeps the current fix visible without covering the
  // track. Full statistics also have to fit the available space after measuring.
  const compact = width < 620 || height < 340
  const stats = compact ? null : deviationStats()

  if (stats && !compact) {
    lines.push({ text: `N = ${stats.count.toLocaleString()}` })
    for (const [quality, count] of [...stats.qualityCounts.entries()].sort((a, b) => a[0] - b[0])) {
      const ratio = ((count / stats.count) * 100).toFixed(1)
      lines.push({ text: `${numberToQuality(quality)} ${count} (${ratio}%)` })
    }
    lines.push({
      text: `AVE = E: ${formatStatMeters(stats.aveE)}, N: ${formatStatMeters(stats.aveN)}`,
    })
    lines.push({
      text: `STD = E: ${formatStatMeters(stats.stdE)}, N: ${formatStatMeters(stats.stdN)}`,
    })
    lines.push({
      text: `RMS = E: ${formatStatMeters(stats.rmsE)}, N: ${formatStatMeters(stats.rmsN)}, 2D: ${formatStatMeters(stats.rms2dDoubled)}`,
    })
  }

  if (lines.length === 0) return

  ctx.save()
  ctx.setTransform(axisDpr, 0, 0, axisDpr, 0, 0)
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'

  const lineHeight = 15
  const paddingX = 10
  const paddingY = 8
  const measuredWidth = () => Math.max(...lines.map((line) => ctx.measureText(line.text).width))
  let maxLineWidth = measuredWidth()
  if (
    lines.length > 1 &&
    (maxLineWidth + paddingX * 2 > width * 0.6 ||
      lines.length * lineHeight + paddingY * 2 > height * 0.5)
  ) {
    lines.splice(currentPoint ? 1 : 0)
    if (!lines.length) {
      ctx.restore()
      return
    }
    maxLineWidth = measuredWidth()
  }
  const boxWidth = Math.min(maxLineWidth + paddingX * 2, Math.max(1, width - 16))
  const boxHeight = lines.length * lineHeight + paddingY * 2
  const boxX = Math.max(8, width - boxWidth - 10)
  const boxY = 10

  ctx.fillStyle = colors.surface
  ctx.strokeStyle = colors.border
  ctx.lineWidth = 1
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6)
  else ctx.rect(boxX, boxY, boxWidth, boxHeight)
  ctx.fill()
  ctx.stroke()

  lines.forEach((line, index) => {
    ctx.fillStyle = line.color ?? colors.text
    ctx.fillText(
      line.text,
      boxX + boxWidth - paddingX,
      boxY + paddingY + index * lineHeight,
      Math.max(1, boxWidth - paddingX * 2),
    )
  })
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
  const index = history.findNearestElapsedTime(fileTimeline.elapsedFor(history))
  if (index < 0) return undefined
  const east = history.getValue('E', index)
  const north = history.getValue('N', index)
  if (east === null || north === null) return undefined
  return [east, north, history.getValue('QUALITY', index) ?? 0]
}

/**
 * 跟踪模式的中心点：文件回放时取时间线光标处的定位点（当前定位点始终居中），
 * 实时流取最新渲染点。
 */
function getTrackingCenterPoint(): [number, number, number] | undefined {
  return getTimelinePositionPoint() ?? getLatestRenderedPoint()
}

/** 跟踪视口：中心 = 跟踪点 + 用户拖拽偏移，跨度沿用跟踪半跨度 */
function applyTrackingViewport(): void {
  const center = getTrackingCenterPoint()
  if (!center) {
    drawAxisLayer()
    drawCurrentPosition()
    return
  }
  const centerX = center[0] + panOffsetX
  const centerY = center[1] + panOffsetY
  updateViewport(
    centerX - trackingXHalfSpan,
    centerX + trackingXHalfSpan,
    centerY - trackingYHalfSpan,
    centerY + trackingYHalfSpan,
  )
}

function updateViewport(xMin: number, xMax: number, yMin: number, yMax: number): void {
  // 统一入口：先按容器宽高比做等比例修正（x/y 每像素米数一致，轨迹形状真实），
  // 再把整体钳制在 ±LIMIT 内（只动中心不动跨度，比例不被破坏）
  const equalized = equalizeViewportScale(
    { xMin, xMax, yMin, yMax },
    axisCssHeight > 0 ? axisCssWidth / axisCssHeight : 1,
  )
  const next = clampViewportCenter(equalized, LIMIT_METERS)
  viewport.value = next
  renderer?.setViewport(next.xMin, next.xMax, next.yMin, next.yMax)
  drawAxisLayer()
  drawCurrentPosition()
}

/** 从当前（已等比例的）视口同步跟踪半跨度，跟踪循环沿用同一比例 */
function syncTrackingSpans(): void {
  trackingXHalfSpan = (viewport.value.xMax - viewport.value.xMin) / 2
  trackingYHalfSpan = (viewport.value.yMax - viewport.value.yMin) / 2
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
  const latestTrackPoint = getTrackingCenterPoint()
  if (!latestTrackPoint) {
    drawAxisLayer()
    return hasMorePoints
  }

  if (
    fileTimeline.active.value &&
    !isTracking.value &&
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
      panOffsetX = 0
      panOffsetY = 0
      updateViewport(fitted.xMin, fitted.xMax, fitted.yMin, fitted.yMax)
      syncTrackingSpans()
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
    // 视口中心 = 跟踪点（回放时为时间线光标点）+ 用户拖拽偏移，保持当前跨度
    applyTrackingViewport()
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
  const latestPoint = getTrackingCenterPoint()
  if (!latestPoint) return

  if (isTracking.value) {
    // 开启跟踪：重置用户拖拽偏移，视口以跟踪点（回放时为时间线光标点）为中心
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

  const width = visualContainerRef.value?.clientWidth || axisCssWidth
  const height = visualContainerRef.value?.clientHeight || axisCssHeight
  const aspectRatio = width / height
  const trackCenter = getTrackingCenterPoint()

  const newViewport =
    isTracking.value && points.length > 0 && trackCenter
      ? fitDeviationPointsAroundCenter(
          points,
          trackCenter[0],
          trackCenter[1],
          aspectRatio,
          GNSS_MIN_VISIBLE_SPAN_METERS,
        )
      : fitDeviationPoints(points, aspectRatio, GNSS_MIN_VISIBLE_SPAN_METERS)

  if (!newViewport) {
    trackingXHalfSpan = 10
    trackingYHalfSpan = 10
    updateViewport(-10, 10, -10, 10)
    syncTrackingSpans()
    return
  }

  updateViewport(newViewport.xMin, newViewport.xMax, newViewport.yMin, newViewport.yMax)
  syncTrackingSpans()
}

function clearTrack(): void {
  cancelScheduledNmeaUpdate()
  renderer?.clear()
  renderedPointCount = 0
  firstRenderedPoint = undefined
  panOffsetX = 0
  panOffsetY = 0
  statsCache = null
  statsCacheLength = -1
  statsCacheFirst = undefined
  updateViewport(-10, 10, -10, 10)
  clearData()
  fileTimeline.clearTimeline()
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

  // 与 canvas(ECharts) 版一致的 RTKLIB 缩放：以视图中心为锚点。
  // x/y 用同一因子，min 钳制后由 updateViewport 的等比例修正统一兜底，
  // 保证两轴每像素米数始终一致。
  const zoomRatio = Math.pow(2.0, e.deltaY / 1200.0)
  const xSpan = clampVisibleSpan(xRange * zoomRatio, GNSS_MIN_VISIBLE_SPAN_METERS, LIMIT_METERS * 2)
  const ySpan = clampVisibleSpan(yRange * zoomRatio, GNSS_MIN_VISIBLE_SPAN_METERS, LIMIT_METERS * 2)

  const xCenter = (xMin + xMax) / 2
  const yCenter = (yMin + yMax) / 2
  updateViewport(xCenter - xSpan / 2, xCenter + xSpan / 2, yCenter - ySpan / 2, yCenter + ySpan / 2)
  syncTrackingSpans()

  // 缩放后更新偏移：新视口中心相对于跟踪点（回放时为时间线光标点）的偏移
  const latestPoint = getTrackingCenterPoint()
  if (latestPoint) {
    panOffsetX = (viewport.value.xMin + viewport.value.xMax) / 2 - latestPoint[0]
    panOffsetY = (viewport.value.yMin + viewport.value.yMax) / 2 - latestPoint[1]
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
    if (fileTimeline.active.value) tooltipText.value += `\n${t('gnss.deviation.seekEpochHint')}`
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

function handleDoubleClick(event: MouseEvent): void {
  if (!fileTimeline.active.value || fileTimeline.indexing.value || !canvasRef.value) return
  const bounds = canvasRef.value.getBoundingClientRect()
  const point = renderer?.pickPoint(event.clientX - bounds.left, event.clientY - bounds.top)
  if (!point) return
  event.preventDefault()
  event.stopPropagation()
  const history = positionEpochHistory.value
  const end =
    fileTimeline.mode.value === 'replay'
      ? history.findNearestElapsedTime(fileTimeline.elapsedFor(history))
      : history.length - 1
  const index = findPositionEpoch(
    history,
    ['E', 'N'],
    point.x,
    point.y,
    fileTimeline.elapsedFor(history),
    end,
  )
  if (index >= 0) fileTimeline.seekEpoch(history, index)
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

  // 内容跟随鼠标：屏幕 Y 向下而数据 Y 向上，X 取反、Y 取正。
  // 只移动中心、跨度不变（±LIMIT 钳制由 updateViewport 统一处理），
  // 等比例视口在拖拽全程保持。
  const dataDx = -(dx / rect.width) * xRange
  const dataDy = (dy / rect.height) * yRange
  const centerX = (xMin + xMax) / 2 + dataDx
  const centerY = (yMin + yMax) / 2 + dataDy

  updateViewport(
    centerX - xRange / 2,
    centerX + xRange / 2,
    centerY - yRange / 2,
    centerY + yRange / 2,
  )

  // 拖拽后更新偏移：视口中心相对于跟踪点（回放时为时间线光标点）的偏移，
  // 跟踪模式在拖拽结束后保持该偏移而不回中
  const latestPoint = getTrackingCenterPoint()
  if (latestPoint) {
    panOffsetX = (viewport.value.xMin + viewport.value.xMax) / 2 - latestPoint[0]
    panOffsetY = (viewport.value.yMin + viewport.value.yMax) / 2 - latestPoint[1]
  }
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
      updateStatusCardCompact()
      if (!chartContainerRef.value || !canvasRef.value || !axisCanvasRef.value) return
      const width = visualContainerRef.value?.clientWidth || chartContainerRef.value.clientWidth
      const height = visualContainerRef.value?.clientHeight || chartContainerRef.value.clientHeight
      if (width <= 0 || height <= 0) return
      renderer?.onResize(width, height)
      resizeAxisCanvas(width, height)
      // 容器宽高比变了：按新比例重新等比例当前视口，再重绘画层
      const current = viewport.value
      updateViewport(current.xMin, current.xMax, current.yMin, current.yMax)
      syncTrackingSpans()
      renderer?.render()
      drawCurrentPosition()
    })
  })
  resizeObserver.observe(chartContainerRef.value)
  if (visualContainerRef.value) resizeObserver.observe(visualContainerRef.value)
  updateStatusCardCompact()
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
  canvasRef.value.addEventListener('dblclick', handleDoubleClick)
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
    stopTimelineWatch = watch([fileTimeline.active, fileTimeline.elapsedMilliseconds], () => {
      if (currentView.value !== 'deviation') return
      // 跟踪模式：回放光标移动后当前定位点重新居中（track 预期行为）；
      // 非跟踪只刷新光标点与轴层（含统计信息）
      if (isTracking.value) applyTrackingViewport()
      else {
        drawAxisLayer()
        drawCurrentPosition()
      }
    })
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
    canvasRef.value.removeEventListener('dblclick', handleDoubleClick)
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
  height: 28px;
  min-height: 28px;
  box-sizing: border-box;
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
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  min-height: 0;
}

.deviation-visual-container {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: hidden;
  background: var(--app-surface);
}

.map-layer-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--app-surface);
}

.map-layer-container :deep(.gnss-map-container) {
  border-radius: 0;
}

.deviation-status-card {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 20;
  width: min(250px, calc(100% - 28px));
  overflow: hidden;
  color: var(--app-text);
  background: color-mix(in srgb, var(--app-surface-raised) 94%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-border) 86%, transparent);
  border-radius: 12px;
  box-shadow: 0 10px 28px rgb(0 0 0 / 18%);
  backdrop-filter: blur(12px);
}

.deviation-status-card.is-compact {
  width: fit-content;
  min-width: 0;
  max-width: calc(100% - 28px);
}

.status-card-header {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 42px;
  padding: 9px 12px;
  box-sizing: border-box;
}

.deviation-status-card.is-compact .status-card-header {
  width: auto;
  min-height: 34px;
  gap: 5px;
  padding: 6px 8px;
}

.status-card-heading {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.status-card-indicator {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgb(255 255 255 / 12%);
}

.status-card-summary {
  min-width: 0;
  margin-left: auto;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.deviation-status-card.is-compact .status-card-heading > span:last-child {
  display: none;
}

.deviation-status-card.is-compact .status-card-summary {
  margin-left: 0;
  font-size: 11px;
}

.status-card-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  padding: 0;
  color: var(--app-text-muted);
  font-size: 14px;
  line-height: 1;
  text-align: center;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.status-card-close:hover {
  color: var(--app-text);
  background: color-mix(in srgb, var(--app-primary) 12%, transparent);
}

.status-card-body {
  max-height: min(56vh, 420px);
  padding: 10px 12px 12px;
  overflow: auto;
  border-top: 1px solid color-mix(in srgb, var(--app-border) 70%, transparent);
}

.status-card-stat,
.status-card-metric {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.status-card-stats {
  display: grid;
  gap: 10px;
  font-size: 11px;
}

.status-card-stat-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
}

.status-card-stat {
  min-width: 0;
  padding: 7px 8px;
  color: var(--app-text-muted);
  background: color-mix(in srgb, var(--app-surface-muted) 72%, transparent);
  border-radius: 7px;
}

.status-card-stat strong {
  color: var(--app-text);
  font-size: 11px;
}

.status-card-metrics {
  display: grid;
  gap: 5px;
  padding-top: 2px;
}

.status-card-metric {
  justify-content: flex-start;
  flex-wrap: wrap;
  color: var(--app-text-muted);
  line-height: 1.35;
}

.status-card-metric-rms {
  flex-wrap: nowrap;
  gap: 4px;
  overflow: hidden;
  font-size: 10px;
  white-space: nowrap;
}

.status-card-metric-rms > span {
  flex: 0 0 auto;
}

.status-card-metric > span:first-child {
  width: 34px;
  color: var(--app-text);
  font-weight: 600;
}

.status-card-empty {
  padding: 12px 0 2px;
  color: var(--app-text-muted);
  font-size: 11px;
}

.scale-readout-container,
.layer-switcher {
  position: absolute;
  bottom: 24px;
  z-index: 25;
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  color: var(--app-text-muted);
  border-radius: 10px;
}

.scale-readout-container {
  left: 54px;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  min-width: 74px;
  color: var(--app-text);
  font-size: 10px;
  line-height: 1;
  padding: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
  backdrop-filter: none;
}

.layer-switcher {
  right: 14px;
  gap: 4px;
  padding: 5px;
  overflow: hidden;
  background: color-mix(in srgb, var(--app-surface-raised) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-border) 86%, transparent);
  box-shadow: 0 8px 20px rgb(0 0 0 / 16%);
  backdrop-filter: blur(10px);
}

.layer-switcher::before {
  position: absolute;
  top: 5px;
  bottom: 5px;
  left: 5px;
  width: 28px;
  content: '';
  background: var(--app-surface-raised);
  border-radius: 7px;
  box-shadow: 0 2px 6px rgb(0 0 0 / 14%);
  transition: transform 0.2s ease;
}

.layer-switcher.is-map::before {
  transform: translateX(32px);
}

.scale-readout-line {
  position: relative;
  display: block;
  height: 1px;
  background: var(--app-text);
}

.scale-readout-line::before,
.scale-readout-line::after {
  position: absolute;
  top: -3px;
  width: 1px;
  height: 7px;
  content: '';
  background: var(--app-text);
}

.scale-readout-line::before {
  left: 0;
}

.scale-readout-line::after {
  right: 0;
}

.scale-readout-label {
  white-space: nowrap;
}

.layer-icon-button {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: var(--app-text);
  font-size: 15px;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 7px;
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
}

.layer-icon-button:hover {
  color: var(--app-text);
  background: color-mix(in srgb, var(--app-primary) 9%, transparent);
}

.layer-icon-button.active {
  color: var(--app-primary);
  background: transparent;
}

.position-chart-grid {
  flex: 1;
  display: grid;
  grid-template-rows: repeat(3, minmax(0, 1fr));
  grid-template-columns: 1fr;
  gap: clamp(4px, 1vh, 10px);
  overflow: hidden;
  min-height: 0;
  width: 100%;
  padding: clamp(4px, 1vh, 10px);
  box-sizing: border-box;
}

.position-chart-grid > * {
  min-height: 0;
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
  gap: 6px;
  margin-left: auto;
}

.right-buttons .control-btn + .control-btn {
  margin-left: 0;
}

.status-toggle-btn {
  height: 28px;
  min-height: 28px;
  padding: 0 8px;
  color: var(--app-text-muted);
  font-size: 12px;
  font-weight: 400;
  gap: 4px;
  box-sizing: border-box;
}

.status-toggle-btn.active {
  color: var(--app-primary);
}

.status-toggle-copy {
  font-size: 12px;
  font-weight: 400;
  line-height: 1;
  white-space: nowrap;
}

@container (max-width: 680px) {
  .size-label {
    display: none;
  }

  .point-size-control {
    margin-left: 4px;
  }

  .status-toggle-btn {
    width: 28px;
    padding: 0;
  }

  .status-toggle-copy {
    display: none;
  }

  .right-buttons {
    gap: 4px;
  }

  .right-buttons .control-btn {
    width: 28px;
    padding: 0;
    justify-content: center;
  }

  .control-btn-label {
    display: none;
  }
}
</style>
