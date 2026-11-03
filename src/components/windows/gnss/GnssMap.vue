<template>
  <div ref="containerRef" class="gnss-map-container">
    <div class="toolbar">
      <!-- track/尺寸/重置布局/清除：与 GNSS Deviation 组件同款控件与命名 -->
      <el-switch
        v-model="isTracking"
        inline-prompt
        :active-text="t('gnss.deviation.tracking')"
        :inactive-text="t('gnss.deviation.tracking')"
        :aria-label="t('gnss.deviation.tracking')"
        :title="t('gnss.deviation.tracking')"
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
      <div class="toolbar-right">
        <el-button type="primary" size="small" @click="resetLayout" class="control-btn">
          <el-icon><RefreshLeft /></el-icon>&nbsp;{{ t('gnss.deviation.resetLayout') }}
        </el-button>
        <el-button type="primary" size="small" @click="clearTrack" class="control-btn">
          <el-icon><Delete /></el-icon>&nbsp;{{ t('gnss.deviation.clear') }}
        </el-button>
        <el-popover placement="bottom-start" :width="420" trigger="click">
          <template #reference>
            <el-button size="small" circle class="info-btn">
              <el-icon><InfoFilled /></el-icon>
            </el-button>
          </template>
          <div class="offline-help">
            <h4>{{ t('gnss.map.offlineTitle') }}</h4>
            <template v-if="isElectron">
              <p>{{ t('gnss.map.offlineDesc1') }}</p>
              <p class="help-step-title">{{ t('gnss.map.offlineStepsTitle') }}</p>
              <ol class="help-steps">
                <li>
                  {{ t('gnss.map.offlineStep1A') }}
                  <strong>{{ t('gnss.map.offlineStep1Strong') }}</strong>
                  {{ t('gnss.map.offlineStep1B') }}
                  <code>offline-tiles</code>
                  {{ t('gnss.map.offlineStep1C') }}
                </li>
                <li>
                  {{ t('gnss.map.offlineStep2A') }}
                  <code>{z}/{x}/{y}.png</code>
                  {{ t('gnss.map.offlineStep2B') }}
                  <code>offline-tiles/15/27455/13208.png</code>
                </li>
                <li>{{ t('gnss.map.offlineStep3') }}</li>
              </ol>
              <p>{{ t('gnss.map.offlineDesc2') }}</p>
              <p>
                {{ t('gnss.map.offlineDesc3Prefix') }}
                <el-button size="small" class="copy-dir-btn" :title="t('gnss.map.copyDirTitle')" @click="copyTilesDir">{{ t('gnss.map.offlineCopyDir') }}</el-button>
              </p>
            </template>
            <p v-else>
              {{ t('gnss.map.offlineBrowserNote') }}
            </p>
          </div>
        </el-popover>
      </div>
    </div>
    <div ref="mapRef" class="map-view"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { InfoFilled, RefreshLeft, Delete } from '@element-plus/icons-vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useGnssStore } from '@/stores/gnss'
import { useNmea } from '@/composables/gnss/useNmea'
import { useFileTimeline } from '@/composables/useFileTimeline'
import { fixStatusColor } from '@/components/windows/gnss/fixStatusColors'
import { createTrackSimplifier } from '@/core/gnss/TrackSimplification'
import { t } from '@/i18n'

const gnssStore = useGnssStore()
const { mapTrackPoints } = useNmea()
const fileTimeline = useFileTimeline()

// 轨迹渲染：逻辑轨迹完整保留在数据源里，渲染层做像素密度抽稀——与上一
// 渲染点屏幕距离不足 MIN_TRACK_PIXELS 的采样点跳过，渲染点数受屏幕密度
// 约束而非数据长度约束，长时间回放（几十万点）也不会卡顿；缩放级别变化
// 后从数据源按新精度全量重建，放大时补回细节。
const MIN_TRACK_PIXELS = 1.5
const TRACK_SEGMENT_POINTS = 200
const DEFAULT_ZOOM = 16
// 轨迹连线：rtkplot 同款银灰 #c0c0c0（不透明）；瓦片底图上略加粗到 1.5px 保可见性
const TRACK_LINE_COLOR = '#c0c0c0'
const TRACK_LINE_WEIGHT = 1.5
// Electron 下走自定义协议（本地离线瓦片优先，缺失回退在线），浏览器环境直接用在线 OSM
const ELECTRON_TILE_URL = 'nav-tiles://tiles/{z}/{x}/{y}.png'
const WEB_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

const isElectron = typeof window !== 'undefined' && !!window.ipcRenderer

const containerRef = ref<HTMLElement | null>(null)
const mapRef = ref<HTMLElement | null>(null)
const isTracking = ref(true)
const pointSize = ref(10)
const offlineTilesDir = ref('')

type SourceTrackPoint = [longitude: number, latitude: number, quality: number]
type TrackLatLng = [latitude: number, longitude: number]

/** 已渲染（抽稀后）的轨迹点：供尾点替换与全轨迹 fitBounds 使用 */
interface RenderedPoint {
  latlng: TrackLatLng
  quality: number
}

/** 相邻同解状态的点连成一段 polyline，块满或状态切换时另起一段 */
interface TrackSegment {
  quality: number
  line: L.Polyline
  latlngs: TrackLatLng[]
}

let map: L.Map | null = null
let trackRenderer: L.Canvas | null = null
let positionMarker: L.CircleMarker | null = null
const renderedPoints: RenderedPoint[] = []
const trackSegments: TrackSegment[] = []
let simplifier: ReturnType<typeof createTrackSimplifier> | null = null
let hasCentered = false
let resizeObserver: ResizeObserver | null = null
let trackRenderFrame: number | null = null
let observedSourceCount = 0
let firstObservedSourcePoint: SourceTrackPoint | undefined
let lastObservedSourcePoint: SourceTrackPoint | undefined
let lastFollowUpdateAt = 0
let pendingTrackHead = 0
const pendingTrackPoints: SourceTrackPoint[] = []

const TRACK_QUEUE_TARGET_FRAMES = 2
const TRACK_RENDER_MAX_POINTS_PER_FRAME = 128
const TRACK_RENDER_BUDGET_MS = 4
const TRACK_BULK_THRESHOLD = 512
const TRACK_BULK_POINTS_PER_FRAME = 4096
const MAP_FOLLOW_INTERVAL_MS = 50

const tileUrl = computed(() => (isElectron ? ELECTRON_TILE_URL : WEB_TILE_URL))

function isValidPosition(longitude: number | string, latitude: number | string): boolean {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false
  if (longitude === 0 && latitude === 0) return false
  return Math.abs(Number(latitude)) <= 90 && Math.abs(Number(longitude)) <= 180
}

function projectLatLng(lat: number, lng: number): { x: number; y: number } {
  if (!map) return { x: lat, y: lng }
  const point = map.project([lat, lng], map.getZoom())
  return { x: point.x, y: point.y }
}

function initMap() {
  if (!mapRef.value || map) return

  // 未定位前展示全球视图，首次有效定位时再居中
  map = L.map(mapRef.value, {
    center: [30, 114],
    zoom: 3,
    zoomControl: true,
  })
  trackRenderer = L.canvas({ padding: 0.5 })
  simplifier = createTrackSimplifier(MIN_TRACK_PIXELS, projectLatLng)

  L.tileLayer(tileUrl.value, {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map)

  // 用 circleMarker 代替默认 marker，避免打包后默认图标资源路径失效
  positionMarker = L.circleMarker([0, 0], {
    radius: markerRadiusForSize(pointSize.value),
    color: '#ffffff',
    weight: 2,
    fillColor: fixStatusColor(0),
    fillOpacity: 1,
  })

  // 缩放级别变化后按新精度重建轨迹：放大补回此前被抽稀的细节，缩 小收紧密度
  map.on('zoomend', handleZoomEnd)

  resizeObserver = new ResizeObserver(() => {
    map?.invalidateSize()
  })
  if (containerRef.value) resizeObserver.observe(containerRef.value)

  // 组件挂载前可能已有有效定位（例如从其他面板切换过来），立即显示当前位置。
  updateCurrentPosition(
    gnssStore.status.longitude,
    gnssStore.status.latitude,
    gnssStore.status.quality,
    true,
  )
}

function markerRadiusForSize(size: number): number {
  if (!Number.isFinite(size)) return 5
  return Math.max(2, Math.min(10, size / 2))
}

function updatePointSize(): void {
  positionMarker?.setStyle({ radius: markerRadiusForSize(pointSize.value) })
}

function createTrackSegment(point: RenderedPoint, previousPoint?: RenderedPoint): TrackSegment | null {
  if (!map) return null
  // 新分段以上一个点为起点，保证轨迹连续不断开。
  // 轨迹连线用中性灰细线（与偏差图/位置图的点线形态一致），解质量色保留在当前定位点标记上
  const startLatLngs = previousPoint ? [previousPoint.latlng, point.latlng] : [point.latlng]
  const line = L.polyline(startLatLngs, {
    renderer: trackRenderer ?? undefined,
    color: TRACK_LINE_COLOR,
    weight: TRACK_LINE_WEIGHT,
    opacity: 1,
    smoothFactor: 0,
  }).addTo(map)
  const segment: TrackSegment = {
    quality: point.quality,
    line,
    latlngs: startLatLngs,
  }
  trackSegments.push(segment)
  return segment
}

// 追加一个已通过抽稀判定的轨迹点：相邻同解状态的点并入当前段，状态切换或分块满时另起一段。
function appendRenderedPoint(point: RenderedPoint, previousPoint?: RenderedPoint): TrackSegment | null {
  if (!map) return null

  const lastSegment = trackSegments[trackSegments.length - 1]
  if (
    lastSegment &&
    lastSegment.quality === point.quality &&
    lastSegment.latlngs.length < TRACK_SEGMENT_POINTS
  ) {
    lastSegment.latlngs.push(point.latlng)
    lastSegment.line.addLatLng(point.latlng)
    return lastSegment
  }

  return createTrackSegment(point, previousPoint)
}

function appendTrackPosition(longitude: number, latitude: number, quality: number): boolean {
  if (!map || !simplifier || !isValidPosition(longitude, latitude)) return false

  // 像素密度抽稀：屏幕上与上一渲染点无区分度的采样点跳过（源数据仍完整保留）
  if (!simplifier.test(Number(latitude), Number(longitude))) return false

  const point: RenderedPoint = {
    latlng: [Number(latitude), Number(longitude)],
    quality,
  }
  const previousPoint = renderedPoints[renderedPoints.length - 1]
  renderedPoints.push(point)
  appendRenderedPoint(point, previousPoint)
  return true
}

// A matching GGA sample replaces the provisional RMC sample at the source tail.
// Update only that rendered point so a live 10 Hz stream does not rebuild its
// Leaflet history every time an epoch is coalesced.
function replaceLatestTrackPoint(
  previous: SourceTrackPoint,
  replacement: SourceTrackPoint,
): void {
  const pendingIndex = pendingTrackPoints.lastIndexOf(previous)
  if (pendingIndex >= pendingTrackHead) {
    pendingTrackPoints[pendingIndex] = replacement
    return
  }

  const lastRendered = renderedPoints[renderedPoints.length - 1]
  if (!lastRendered || !map) {
    pendingTrackPoints.push(replacement)
    scheduleTrackRender()
    return
  }

  const previousLatLng: TrackLatLng = [previous[1], previous[0]]
  if (
    lastRendered.latlng[0] !== previousLatLng[0] ||
    lastRendered.latlng[1] !== previousLatLng[1]
  ) {
    // 尾点此前被抽稀跳过（未渲染）：替换样本重新排队，交由抽稀判定
    pendingTrackPoints.push(replacement)
    scheduleTrackRender()
    return
  }

  const replacementLatLng: TrackLatLng = [replacement[1], replacement[0]]
  const lastSegment = trackSegments[trackSegments.length - 1]
  if (lastSegment) {
    lastSegment.latlngs[lastSegment.latlngs.length - 1] = replacementLatLng
    lastSegment.line.setLatLngs(lastSegment.latlngs)
  }
  lastRendered.latlng = replacementLatLng
  simplifier?.replace(
    { lat: previousLatLng[0], lng: previousLatLng[1] },
    { lat: replacementLatLng[0], lng: replacementLatLng[1] },
  )
}

function appendTrackRange(start: number, end: number): SourceTrackPoint | undefined {
  if (!map) return undefined
  const touchedSegments = new Set<TrackSegment>()
  let latestPosition: SourceTrackPoint | undefined

  for (let index = start; index < end; index += 1) {
    const sourcePoint = pendingTrackPoints[index]
    latestPosition = sourcePoint
    if (!simplifier || !isValidPosition(sourcePoint[0], sourcePoint[1])) continue
    if (!simplifier.test(sourcePoint[1], sourcePoint[0])) continue

    const point: RenderedPoint = {
      latlng: [sourcePoint[1], sourcePoint[0]],
      quality: sourcePoint[2],
    }
    const previousPoint = renderedPoints[renderedPoints.length - 1]
    renderedPoints.push(point)

    const lastSegment = trackSegments[trackSegments.length - 1]
    if (
      lastSegment &&
      lastSegment.quality === point.quality &&
      lastSegment.latlngs.length < TRACK_SEGMENT_POINTS
    ) {
      lastSegment.latlngs.push(point.latlng)
      touchedSegments.add(lastSegment)
    } else {
      const segment = createTrackSegment(point, previousPoint)
      if (segment) touchedSegments.add(segment)
    }
  }

  // One Leaflet geometry update per segment instead of one per imported point.
  for (const segment of touchedSegments) segment.line.setLatLngs(segment.latlngs)
  return latestPosition
}

function updateCurrentPosition(
  longitude: number | string,
  latitude: number | string,
  quality: number,
  forceFollow = false,
) {
  if (!map || !positionMarker || !isValidPosition(longitude, latitude)) return

  const latlng: L.LatLngExpression = [Number(latitude), Number(longitude)]
  const now = performance.now()
  if (!hasCentered) {
    hasCentered = true
    lastFollowUpdateAt = now
    map.setView(latlng, DEFAULT_ZOOM)
  } else if (
    isTracking.value &&
    (forceFollow || now - lastFollowUpdateAt >= MAP_FOLLOW_INTERVAL_MS)
  ) {
    lastFollowUpdateAt = now
    map.panTo(latlng, { animate: false })
  }

  positionMarker.setLatLng(latlng)
  positionMarker.setStyle({ fillColor: fixStatusColor(quality) })
  if (!map.hasLayer(positionMarker)) positionMarker.addTo(map)
}

/** 重置布局（与偏差图同款）：全轨迹 fit 视野（以抽稀后的渲染点近似，足够描边） */
function resetLayout(): void {
  fitCompleteTrack()
}

function fitCompleteTrack(): void {
  if (!map || renderedPoints.length === 0) return
  const bounds = L.latLngBounds([])
  for (const point of renderedPoints) bounds.extend(point.latlng)
  if (!bounds.isValid()) return
  map.fitBounds(bounds, {
    animate: false,
    padding: [20, 20],
    maxZoom: DEFAULT_ZOOM,
  })
  hasCentered = true
}

function pendingTrackCount(): number {
  return pendingTrackPoints.length - pendingTrackHead
}

function scheduleTrackRender() {
  if (!map || trackRenderFrame !== null || pendingTrackCount() === 0) return
  trackRenderFrame = requestAnimationFrame(renderPendingTrack)
}

function renderPendingTrack() {
  trackRenderFrame = null
  const remaining = pendingTrackCount()
  if (!map || remaining === 0) return

  const targetCount = Math.min(
    TRACK_RENDER_MAX_POINTS_PER_FRAME,
    Math.max(1, Math.ceil(remaining / TRACK_QUEUE_TARGET_FRAMES)),
  )
  const startedAt = performance.now()
  let processedCount = 0
  let latestPosition: SourceTrackPoint | undefined

  if (remaining >= TRACK_BULK_THRESHOLD) {
    const end = Math.min(pendingTrackPoints.length, pendingTrackHead + TRACK_BULK_POINTS_PER_FRAME)
    latestPosition = appendTrackRange(pendingTrackHead, end)
    pendingTrackHead = end
  } else {
    while (pendingTrackHead < pendingTrackPoints.length && processedCount < targetCount) {
      const point = pendingTrackPoints[pendingTrackHead++]
      if (appendTrackPosition(point[0], point[1], point[2])) latestPosition = point
      processedCount += 1
      if (processedCount >= 2 && performance.now() - startedAt >= TRACK_RENDER_BUDGET_MS) break
    }
  }

  const queueEmpty = pendingTrackHead >= pendingTrackPoints.length
  if (latestPosition && !fileTimeline.active.value) {
    updateCurrentPosition(latestPosition[0], latestPosition[1], latestPosition[2])
  }

  if (queueEmpty) {
    pendingTrackPoints.length = 0
    pendingTrackHead = 0
    if (fileTimeline.active.value && !isTracking.value) fitCompleteTrack()
  } else {
    scheduleTrackRender()
  }
}

/**
 * 缩放级别变化：按新精度从数据源全量重建（几十万点仅遍历一次，几十毫秒）。
 * 只清渲染层与已消费计数，保留 marker、hasCentered 与当前 zoom——
 * 走 resetTrackHistory 会把 hasCentered 置回 false，下一个定位点会把
 * 视图 setView 回默认层级，破坏用户刚选定的缩放。
 */
function handleZoomEnd(): void {
  if (observedSourceCount === 0) return
  cancelTrackRender()
  clearRenderedTrack()
  observedSourceCount = 0
  syncTrackSource()
}

function cancelTrackRender() {
  if (trackRenderFrame !== null) {
    cancelAnimationFrame(trackRenderFrame)
    trackRenderFrame = null
  }
  pendingTrackPoints.length = 0
  pendingTrackHead = 0
}

function clearRenderedTrack() {
  for (const segment of trackSegments) segment.line.remove()
  trackSegments.length = 0
  renderedPoints.length = 0
  simplifier?.reset()
}

function clearTrack() {
  cancelTrackRender()
  observedSourceCount = mapTrackPoints.value.length
  firstObservedSourcePoint = mapTrackPoints.value[0]
  lastObservedSourcePoint = mapTrackPoints.value.at(-1)
  clearRenderedTrack()
}

function resetTrackHistory() {
  cancelTrackRender()
  observedSourceCount = 0
  firstObservedSourcePoint = undefined
  lastObservedSourcePoint = undefined
  hasCentered = false
  lastFollowUpdateAt = 0
  clearRenderedTrack()
  positionMarker?.remove()
  positionMarker = null
  // 数据重置后立即重建空 marker（沿用当前尺寸）：后续定位点直接 setLatLng/addTo，
  // 各调用点不必补偿
  if (map) {
    positionMarker = L.circleMarker([0, 0], {
      radius: markerRadiusForSize(pointSize.value),
      color: '#ffffff',
      weight: 2,
      fillColor: fixStatusColor(0),
      fillOpacity: 1,
    })
  }
}

function syncTrackSource() {
  const source = mapTrackPoints.value
  const sourceReset =
    source.length < observedSourceCount ||
    (source.length > 0 &&
      observedSourceCount > 0 &&
      source[0] !== firstObservedSourcePoint)

  if (sourceReset) {
    resetTrackHistory()
  } else if (
    observedSourceCount > 0 &&
    source.length >= observedSourceCount &&
    lastObservedSourcePoint &&
    source[observedSourceCount - 1] !== lastObservedSourcePoint
  ) {
    replaceLatestTrackPoint(
      lastObservedSourcePoint,
      source[observedSourceCount - 1],
    )
  }

  for (let index = observedSourceCount; index < source.length; index++) {
    pendingTrackPoints.push(source[index])
  }
  observedSourceCount = source.length
  firstObservedSourcePoint = source[0]
  lastObservedSourcePoint = source.at(-1)
  scheduleTrackRender()
}

function copyTilesDir() {
  if (offlineTilesDir.value) void navigator.clipboard?.writeText(offlineTilesDir.value)
}

watch(mapTrackPoints, syncTrackSource)

watch(
  () =>
    [
      gnssStore.status.longitude,
      gnssStore.status.latitude,
      gnssStore.status.quality,
    ] as const,
  ([longitude, latitude, quality]) => updateCurrentPosition(longitude, latitude, quality),
)

// 文件重播开始 / 清空 GNSS 数据时，自动清除地图本地轨迹，避免新旧轨迹叠加
watch(
  () => gnssStore.trackResetToken,
  () => resetTrackHistory(),
)

onMounted(() => {
  initMap()
  syncTrackSource()
  if (isElectron) {
    window.electronAPI
      ?.getOfflineTilesDir?.()
      .then((dir) => {
        offlineTilesDir.value = dir
      })
      .catch(() => {
        offlineTilesDir.value = ''
      })
  }
})

onUnmounted(() => {
  cancelTrackRender()
  resizeObserver?.disconnect()
  resizeObserver = null
  map?.remove()
  map = null
  trackRenderer = null
  positionMarker = null
  trackSegments.length = 0
  renderedPoints.length = 0
  simplifier = null
})
</script>

<style scoped>
.gnss-map-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  color: var(--app-text);
  background: var(--app-surface);
}

.toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--app-border);
}

.toolbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
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

.point-size-control {
  display: flex;
  align-items: center;
}

.size-label {
  margin-right: 5px;
  font-size: 12px;
}

.point-slider {
  width: 60px;
  margin: 0 5px;
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
  background-color: var(--app-surface-raised);
  border: 1px solid var(--app-border);
  border-radius: 50%;
  transition: all 0.2s ease;
}

:deep(.el-slider__button:hover) {
  transform: scale(1.15);
}

:deep(.el-slider__button:active) {
  transform: scale(0.95);
}

.size-value {
  width: 24px;
  text-align: center;
  font-size: 12px;
}

.clear-btn {
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

.map-view {
  flex: 1;
  min-height: 0;
  width: 100%;
  z-index: 0;
}

.offline-help h4 {
  margin: 0 0 8px;
  font-size: 14px;
}

.offline-help p {
  margin: 6px 0;
  font-size: 13px;
  line-height: 1.6;
}

.offline-help code {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--app-surface-muted, #f0f0f0);
}

.offline-help pre {
  margin: 4px 0;
  padding: 8px;
  border-radius: 6px;
  background: var(--app-surface-muted, #f0f0f0);
  font-size: 12px;
  line-height: 1.5;
  overflow-x: auto;
}

.help-step-title {
  margin: 10px 0 4px;
  font-weight: 600;
}

.help-steps {
  margin: 4px 0;
  padding-left: 22px;
}

.help-steps li {
  margin: 4px 0;
  font-size: 13px;
  line-height: 1.6;
}

.copy-dir-btn {
  margin-left: 4px;
  vertical-align: middle;
}
</style>
