<template>
  <div ref="containerRef" class="gnss-map-container">
    <div class="toolbar">
      <el-switch v-model="follow" inline-prompt active-text="跟随" inactive-text="跟随" />
      <el-switch
        v-model="slidingWindow"
        inline-prompt
        active-text="滑窗"
        inactive-text="全部"
        aria-label="轨迹保留模式"
        title="滑窗：保留最近 2000 点；全部：持续保留后续所有点"
      />
      <el-button size="small" @click="clearTrack">清除轨迹</el-button>
      <el-popover placement="bottom-start" :width="420" trigger="click">
        <template #reference>
          <el-button size="small" circle class="info-btn">
            <el-icon><InfoFilled /></el-icon>
          </el-button>
        </template>
        <div class="offline-help">
          <h4>离线地图</h4>
          <template v-if="isElectron">
            <p>
              应用不预置离线地图。把栅格瓦片按
              <code>{z}/{x}/{y}.png</code> 目录结构放入下面的目录后，地图会优先使用本地瓦片，
              缺失的瓦片自动回退到在线 OSM 源：
            </p>
            <p class="tiles-dir" :title="'点击复制'" @click="copyTilesDir">
              {{ offlineTilesDir || '目录获取中…' }}
            </p>
            <p>目录结构示例：</p>
            <pre>
offline-tiles/
  15/
    27455/
      13208.png</pre>
            <p>
              可用 QGIS、MOBAC（Mobile Atlas Creator）或 wget/脚本从公开瓦片源下载所需区域与 zoom
              层级的瓦片。请遵守所用瓦片源的使用条款（如 OSM Tile Usage Policy），
              避免大批量抓取在线服务。
            </p>
          </template>
          <p v-else>
            当前为浏览器环境，离线瓦片仅在桌面版（Electron）中可用，现使用在线 OSM 瓦片。
          </p>
        </div>
      </el-popover>
    </div>
    <div ref="mapRef" class="map-view"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useGnssStore } from '@/stores/gnss'
import { useNmea } from '@/composables/gnss/useNmea'
import { fixStatusColor } from '@/components/windows/gnss/fixStatusColors'

const gnssStore = useGnssStore()
const { mapTrackPoints } = useNmea()

// 滑窗模式只保留最近的点；Polyline 分块后，追加或淘汰点都只影响一个小分块。
const TRACK_WINDOW_POINTS = 2000
const TRACK_SEGMENT_POINTS = 200
const DEFAULT_ZOOM = 16
// Electron 下走自定义协议（本地离线瓦片优先，缺失回退在线），浏览器环境直接用在线 OSM
const ELECTRON_TILE_URL = 'nav-tiles://tiles/{z}/{x}/{y}.png'
const WEB_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

const isElectron = typeof window !== 'undefined' && !!window.ipcRenderer

const containerRef = ref<HTMLElement | null>(null)
const mapRef = ref<HTMLElement | null>(null)
const follow = ref(true)
const slidingWindow = ref(false)
const offlineTilesDir = ref('')

type SourceTrackPoint = [longitude: number, latitude: number, quality: number]

interface TrackPoint {
  id: number
  latlng: L.LatLngExpression
  quality: number
}

interface TrackSegment {
  quality: number
  line: L.Polyline
  pointIds: number[]
  latlngs: L.LatLngExpression[]
}

let map: L.Map | null = null
let positionMarker: L.CircleMarker | null = null
const trackPoints: TrackPoint[] = []
const trackSegments: TrackSegment[] = []
let nextTrackPointId = 1
let hasCentered = false
let resizeObserver: ResizeObserver | null = null
let trackRenderFrame: number | null = null
let observedSourceCount = 0
let firstObservedSourcePoint: SourceTrackPoint | undefined
let pendingTrackHead = 0
let lastFollowUpdateAt = 0
const pendingTrackPoints: SourceTrackPoint[] = []

const TRACK_QUEUE_TARGET_FRAMES = 2
const TRACK_RENDER_MAX_POINTS_PER_FRAME = 128
const TRACK_RENDER_BUDGET_MS = 4
const MAP_FOLLOW_INTERVAL_MS = 50

const tileUrl = computed(() => (isElectron ? ELECTRON_TILE_URL : WEB_TILE_URL))

function isValidPosition(longitude: number, latitude: number): boolean {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false
  if (longitude === 0 && latitude === 0) return false
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
}

function initMap() {
  if (!mapRef.value || map) return

  // 未定位前展示全球视图，首次有效定位时再居中
  map = L.map(mapRef.value, {
    center: [30, 114],
    zoom: 3,
    zoomControl: true,
  })

  L.tileLayer(tileUrl.value, {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map)

  // 用 circleMarker 代替默认 marker，避免打包后默认图标资源路径失效
  positionMarker = L.circleMarker([0, 0], {
    radius: 7,
    color: '#ffffff',
    weight: 2,
    fillColor: fixStatusColor(0),
    fillOpacity: 1,
  })

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

// 追加一个轨迹点：相邻同解状态的点连成一段 polyline，状态切换或分块满时另起一段。
function appendTrackPoint(point: TrackPoint, previousPoint?: TrackPoint) {
  if (!map) return

  const lastSegment = trackSegments[trackSegments.length - 1]
  if (
    lastSegment &&
    lastSegment.quality === point.quality &&
    lastSegment.pointIds.length < TRACK_SEGMENT_POINTS
  ) {
    lastSegment.pointIds.push(point.id)
    lastSegment.latlngs.push(point.latlng)
    lastSegment.line.addLatLng(point.latlng)
    return
  }

  // 新分段以上一个点为起点，保证轨迹连续不断开
  const startPoints = previousPoint ? [previousPoint.latlng, point.latlng] : [point.latlng]
  const pointIds = previousPoint ? [previousPoint.id, point.id] : [point.id]
  const line = L.polyline(startPoints, {
    color: fixStatusColor(point.quality),
    weight: 3,
    opacity: 0.8,
    smoothFactor: 0,
  }).addTo(map)
  trackSegments.push({
    quality: point.quality,
    line,
    pointIds,
    latlngs: startPoints,
  })
}

// 从轨迹头部批量淘汰点。完整旧分块直接移除，边界分块最多重设 TRACK_SEGMENT_POINTS 个点。
function trimOldestTrackPoints(count: number) {
  const removeCount = Math.min(Math.max(0, count), trackPoints.length)
  if (removeCount === 0) return

  const cutoffId = trackPoints[removeCount - 1].id
  trackPoints.splice(0, removeCount)

  while (trackSegments.length > 0) {
    const firstSegment = trackSegments[0]
    let segmentRemoveCount = 0
    while (
      segmentRemoveCount < firstSegment.pointIds.length &&
      firstSegment.pointIds[segmentRemoveCount] <= cutoffId
    ) {
      segmentRemoveCount += 1
    }

    if (segmentRemoveCount === 0) break

    firstSegment.pointIds.splice(0, segmentRemoveCount)
    firstSegment.latlngs.splice(0, segmentRemoveCount)

    if (firstSegment.pointIds.length < 2) {
      firstSegment.line.remove()
      trackSegments.shift()
      continue
    }

    firstSegment.line.setLatLngs(firstSegment.latlngs)
    break
  }
}

function trimTrackToWindow() {
  trimOldestTrackPoints(trackPoints.length - TRACK_WINDOW_POINTS)
}

function appendTrackPosition(longitude: number, latitude: number, quality: number): boolean {
  if (!map || !isValidPosition(longitude, latitude)) return false

  const latlng: L.LatLngExpression = [latitude, longitude]
  const previousPoint = trackPoints[trackPoints.length - 1]
  const point = { id: nextTrackPointId++, latlng, quality }
  trackPoints.push(point)
  appendTrackPoint(point, previousPoint)
  return true
}

function updateCurrentPosition(
  longitude: number,
  latitude: number,
  quality: number,
  forceFollow = false,
) {
  if (!map || !positionMarker || !isValidPosition(longitude, latitude)) return

  const latlng: L.LatLngExpression = [latitude, longitude]
  const now = performance.now()
  if (!hasCentered) {
    hasCentered = true
    lastFollowUpdateAt = now
    map.setView(latlng, DEFAULT_ZOOM)
  } else if (
    follow.value &&
    (forceFollow || now - lastFollowUpdateAt >= MAP_FOLLOW_INTERVAL_MS)
  ) {
    lastFollowUpdateAt = now
    map.panTo(latlng, { animate: false })
  }

  positionMarker.setLatLng(latlng)
  positionMarker.setStyle({ fillColor: fixStatusColor(quality) })
  if (!map.hasLayer(positionMarker)) positionMarker.addTo(map)
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

  while (pendingTrackHead < pendingTrackPoints.length && processedCount < targetCount) {
    const point = pendingTrackPoints[pendingTrackHead++]
    if (appendTrackPosition(point[0], point[1], point[2])) latestPosition = point
    processedCount += 1
    if (processedCount >= 2 && performance.now() - startedAt >= TRACK_RENDER_BUDGET_MS) break
  }

  if (slidingWindow.value) trimTrackToWindow()

  const queueEmpty = pendingTrackHead >= pendingTrackPoints.length
  if (latestPosition) {
    updateCurrentPosition(latestPosition[0], latestPosition[1], latestPosition[2])
  }

  if (queueEmpty) {
    pendingTrackPoints.length = 0
    pendingTrackHead = 0
  } else {
    scheduleTrackRender()
  }
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
  trackPoints.length = 0
  for (const segment of trackSegments) segment.line.remove()
  trackSegments.length = 0
  nextTrackPointId = 1
}

function clearTrack() {
  cancelTrackRender()
  observedSourceCount = mapTrackPoints.value.length
  firstObservedSourcePoint = mapTrackPoints.value[0]
  clearRenderedTrack()
}

function resetTrackHistory() {
  cancelTrackRender()
  observedSourceCount = 0
  firstObservedSourcePoint = undefined
  hasCentered = false
  lastFollowUpdateAt = 0
  clearRenderedTrack()
}

function syncTrackSource() {
  const source = mapTrackPoints.value
  const sourceReset =
    source.length < observedSourceCount ||
    (source.length > 0 &&
      observedSourceCount > 0 &&
      source[0] !== firstObservedSourcePoint)

  if (sourceReset) resetTrackHistory()

  for (let index = observedSourceCount; index < source.length; index++) {
    pendingTrackPoints.push(source[index])
  }
  observedSourceCount = source.length
  firstObservedSourcePoint = source[0]
  scheduleTrackRender()
}

function rebuildTrackFromSource() {
  resetTrackHistory()
  syncTrackSource()
}

function copyTilesDir() {
  if (offlineTilesDir.value) void navigator.clipboard?.writeText(offlineTilesDir.value)
}

watch(mapTrackPoints, syncTrackSource)

watch(slidingWindow, (enabled, wasEnabled) => {
  if (enabled) {
    trimTrackToWindow()
  } else if (wasEnabled && mapTrackPoints.value.length > trackPoints.length) {
    rebuildTrackFromSource()
  }
})

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
  positionMarker = null
  trackSegments.length = 0
  trackPoints.length = 0
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

.tiles-dir {
  font-family: monospace;
  word-break: break-all;
  cursor: pointer;
  color: #409eff;
}
</style>
