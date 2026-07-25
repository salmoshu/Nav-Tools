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
import { fixStatusColor } from '@/components/windows/gnss/fixStatusColors'

const gnssStore = useGnssStore()

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
const slidingWindow = ref(true)
const offlineTilesDir = ref('')

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

  // 组件挂载前可能已有有效定位（例如从其他面板切换过来），立即应用一次
  applyPosition(gnssStore.status.longitude, gnssStore.status.latitude, gnssStore.status.quality)
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

function applyPosition(longitude: number, latitude: number, quality: number) {
  if (!map || !positionMarker) return
  if (!isValidPosition(longitude, latitude)) return

  const latlng: L.LatLngExpression = [latitude, longitude]

  if (!hasCentered) {
    hasCentered = true
    map.setView(latlng, DEFAULT_ZOOM)
  } else if (follow.value) {
    map.panTo(latlng)
  }

  positionMarker.setLatLng(latlng)
  positionMarker.setStyle({ fillColor: fixStatusColor(quality) })
  if (!map.hasLayer(positionMarker)) positionMarker.addTo(map)

  const previousPoint = trackPoints[trackPoints.length - 1]
  const point = { id: nextTrackPointId++, latlng, quality }
  trackPoints.push(point)
  appendTrackPoint(point, previousPoint)
  if (slidingWindow.value) trimTrackToWindow()
}

function clearTrack() {
  trackPoints.length = 0
  for (const segment of trackSegments) segment.line.remove()
  trackSegments.length = 0
  nextTrackPointId = 1
}

function copyTilesDir() {
  if (offlineTilesDir.value) void navigator.clipboard?.writeText(offlineTilesDir.value)
}

watch(
  () => [gnssStore.status.longitude, gnssStore.status.latitude, gnssStore.status.quality] as const,
  ([longitude, latitude, quality]) => applyPosition(longitude, latitude, quality),
)

watch(slidingWindow, (enabled) => {
  if (enabled) trimTrackToWindow()
})

onMounted(() => {
  initMap()
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
