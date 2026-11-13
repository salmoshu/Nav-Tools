<template>
  <section class="camera-player">
    <div
      class="video-stage"
      :class="{ 'has-frame': Boolean(frameUrl), 'has-bbox': Boolean(frameUrl) }"
    >
      <div
        class="video-zoom"
        :style="zoomStyle"
        @wheel.prevent="handleWheel"
        @mousedown="handlePanStart"
        @dblclick="resetZoom"
      >
        <img
          v-if="frameUrl"
          :src="frameUrl"
          :alt="t('common.video.liveVideoAlt')"
          class="video-frame"
          draggable="false"
        />
      </div>

      <div
        v-if="frameUrl"
        class="bbox-overlay"
        role="group"
        :aria-label="t('common.video.targetFields')"
      >
        <template v-if="bboxTargets.length > 0">
          <div
            v-for="(target, index) in measurementTargets"
            :key="`${target.trackId}-${index}`"
            class="bbox-target"
          >
            <div class="bbox-target-identity">
              <strong>#{{ index + 1 }}</strong>
              <span>class={{ target.classId }}</span>
              <span>track={{ target.trackId }}</span>
            </div>
            <div class="bbox-measurement">
              distance={{ target.distance.toFixed(3) }} m
              <span class="bbox-average">(2s avg {{ target.averageDistance.toFixed(3) }} m)</span>
            </div>
            <div class="bbox-measurement">
              azimuth={{ target.azimuth.toFixed(3) }}°
              <span class="bbox-average">(2s avg {{ target.averageAzimuth.toFixed(3) }}°)</span>
            </div>
          </div>
        </template>
        <div v-else class="bbox-empty">
          <span>{{ emptyTargetText }}</span>
          <button type="button" class="bbox-config" @click="openObservationConnectionSettings">
            {{ t('common.video.configureConnection') }}
          </button>
        </div>
      </div>

      <div v-if="!frameUrl" class="stage-placeholder">
        <el-icon :size="46"><VideoCamera /></el-icon>
        <strong>{{ placeholderTitle }}</strong>
        <span>{{ placeholderHint }}</span>
      </div>

      <div v-if="status === 'connecting'" class="connecting-overlay">
        <el-icon class="is-loading" :size="28"><Loading /></el-icon>
        <span>{{ t('common.video.connecting') }}</span>
      </div>

      <div v-if="zoomLevel > 1" class="zoom-hint" :title="t('common.video.zoomResetHint')">
        {{ Math.round(zoomLevel * 100) }}%
      </div>

      <div class="stream-status" :class="`status-${status}`">
        <span class="status-dot"></span>
        <span>{{ statusText }}</span>
      </div>
    </div>

    <div class="camera-controls">
      <button
        class="source-reference"
        type="button"
        :title="t('common.video.sourceConfigHint')"
        @click="openCameraSourceSettings"
      >
        <el-icon :size="16"><Link /></el-icon>
        <span class="source-reference-copy">
          <small>Camera RTSP</small>
          <strong>{{ streamUrl }}</strong>
        </span>
        <span class="source-config-action">{{ t('common.video.configure') }}</span>
      </button>
      <el-button
        v-if="!isActive"
        type="primary"
        :icon="VideoPlay"
        :loading="status === 'connecting'"
        :title="t('common.video.play')"
        :aria-label="t('common.video.play')"
        @click="startStream"
      >
        {{ t('common.video.play') }}
      </el-button>
      <el-button
        v-else
        :icon="VideoPause"
        :title="t('common.video.pause')"
        :aria-label="t('common.video.pause')"
        @click="pauseStream"
        >{{ t('common.video.pause') }}</el-button
      >
      <span class="loop-toggle" :title="t('common.video.loopReconnectHint')">
        <span class="loop-toggle-label">{{ t('common.video.loopReconnect') }}</span>
        <el-switch
          v-model="dataSourceSettings.network.loop"
          size="small"
          :aria-label="t('common.video.loopReconnect')"
          @change="handleSharedLoopChange"
        />
      </span>
    </div>

    <el-dialog
      v-model="showCameraSourceDialog"
      :title="t('common.video.rtspSettingsTitle')"
      class="app-dialog camera-video-source-dialog"
      width="min(520px, calc(100vw - 32px))"
      :close-on-click-modal="true"
      :close-on-press-escape="true"
      :append-to-body="true"
      align-center
    >
      <div class="camera-source-config">
        <p>{{ t('common.video.rtspSettingsDesc') }}</p>
        <label>
          <span>{{ t('common.video.streamProtocol') }}</span>
          <el-select v-model="streamProtocolDraft" :aria-label="t('common.video.streamProtocol')">
            <el-option label="RTSP" value="rtsp" />
          </el-select>
        </label>
        <label>
          <span>{{ t('common.video.streamPort') }}</span>
          <el-input
            v-model="streamPortDraft"
            :aria-label="t('common.video.streamPort')"
            inputmode="numeric"
            maxlength="5"
            placeholder="8554"
            @keydown.enter.prevent="saveCameraSourceSettings"
          />
        </label>
        <label>
          <span>{{ t('common.video.streamSuffix') }}</span>
          <el-input
            v-model="streamSuffixDraft"
            :aria-label="t('common.video.streamSuffix')"
            placeholder="rgbstream"
            clearable
            @keydown.enter.prevent="saveCameraSourceSettings"
          />
        </label>
      </div>
      <template #footer>
        <el-button @click="showCameraSourceDialog = false">{{ t('app.cancel') }}</el-button>
        <el-button type="primary" @click="saveCameraSourceSettings">
          {{ t('common.video.saveRtspSettings') }}
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Link, Loading, VideoCamera, VideoPause, VideoPlay } from '@element-plus/icons-vue'
import { t } from '@/i18n'
import {
  buildCameraStreamUrl,
  CameraVideoStorage,
  normalizeRtspUrl,
} from '@/core/camera/CameraVideoStorage'
import { JsonStorage } from '@/core/storage/JsonStorage'
import { useDataSourceManager } from '@/composables/useDataSourceManager'
import { useDevice } from '@/hooks/useDevice'
import { showToolBar } from '@/composables/useStatusManager'
import emitter from '@/hooks/useMitt'
import { isCameraTcpDataConnected } from '@/core/camera/CameraConnectionStatus'
import type { CameraCalibrationSnapshot } from '@/core/camera/CameraCalibrationTypes'

type StreamStatus = 'idle' | 'connecting' | 'playing' | 'stopped' | 'error' | 'unavailable'
type StreamStatusPayload = { status?: StreamStatus; message?: string }

// IP 与循环重连开关与数据接入 NETWORK 共用，相机只持久化协议/端口/后缀
const { settings: dataSourceSettings, saveSettings: saveDataSourceSettings } =
  useDataSourceManager()
const { globalDevice } = useDevice()
const cameraTcpConnected = computed(() =>
  isCameraTcpDataConnected(globalDevice.value, {
    host: dataSourceSettings.network.host,
    port: dataSourceSettings.network.port ?? 0,
  }),
)
const videoStorage = new CameraVideoStorage(new JsonStorage(window.localStorage))
const initialSettings = videoStorage.load()
const streamProtocol = ref(initialSettings.protocol)
const streamPort = ref(initialSettings.port)
const streamSuffix = ref(initialSettings.suffix)
const streamProtocolDraft = ref(initialSettings.protocol)
const streamPortDraft = ref(String(initialSettings.port))
const streamSuffixDraft = ref(initialSettings.suffix)
/** 完整流地址：协议://共享 NETWORK 主机:端口/后缀 */
const streamUrl = computed(
  () =>
    buildCameraStreamUrl(
      { protocol: streamProtocol.value, port: streamPort.value, suffix: streamSuffix.value },
      dataSourceSettings.network.host,
    ) ?? '',
)
const showCameraSourceDialog = ref(false)
const status = ref<StreamStatus>('idle')
const statusMessage = ref(t('common.video.waitingToPlay'))
const frameUrl = ref('')
const inssegState = ref<CameraCalibrationSnapshot | null>(null)
const bboxFresh = ref(false)
const BBOX_STALE_MS = 1500
let bboxFreshTimer: ReturnType<typeof setTimeout> | undefined
let bboxFrameKey = ''

const bboxTargets = computed(() =>
  frameUrl.value && bboxFresh.value && inssegState.value?.observing
    ? (inssegState.value.lastFrame?.targets ?? [])
    : [],
)

type MeasurementSample = { at: number; distance: number; azimuth: number }
const measurementSamples = new Map<number, MeasurementSample[]>()
const measurementAverages = ref<Record<number, { distance: number; azimuth: number }>>({})
const measurementTargets = computed(() =>
  bboxTargets.value.map((target) => ({
    ...target,
    averageDistance: measurementAverages.value[target.trackId]?.distance ?? target.distance,
    averageAzimuth: measurementAverages.value[target.trackId]?.azimuth ?? target.azimuth,
  })),
)

function recordMeasurementSamples(targets: typeof bboxTargets.value) {
  const at = Date.now()
  for (const target of targets) {
    const samples = measurementSamples.get(target.trackId) ?? []
    samples.push({ at, distance: target.distance, azimuth: target.azimuth })
    measurementSamples.set(target.trackId, samples)
    if (!measurementAverages.value[target.trackId]) {
      measurementAverages.value[target.trackId] = {
        distance: target.distance,
        azimuth: target.azimuth,
      }
    }
  }
}

function updateMeasurementAverages() {
  const cutoff = Date.now() - 2000
  const next: typeof measurementAverages.value = {}
  for (const [trackId, samples] of measurementSamples) {
    const recent = samples.filter((sample) => sample.at >= cutoff)
    if (recent.length === 0) {
      measurementSamples.delete(trackId)
      continue
    }
    measurementSamples.set(trackId, recent)
    next[trackId] = {
      distance: recent.reduce((sum, sample) => sum + sample.distance, 0) / recent.length,
      azimuth: recent.reduce((sum, sample) => sum + sample.azimuth, 0) / recent.length,
    }
  }
  measurementAverages.value = next
}

const measurementTimer = setInterval(updateMeasurementAverages, 2000)

function clearBboxFreshTimer() {
  if (bboxFreshTimer === undefined) return
  clearTimeout(bboxFreshTimer)
  bboxFreshTimer = undefined
}

function updateInssegState(state: CameraCalibrationSnapshot) {
  inssegState.value = state
  const frame = state.observing ? state.lastFrame : null
  const nextFrameKey = frame ? `${frame.timestamp}/${frame.index}/${frame.pictureIndex}` : ''
  if (nextFrameKey === bboxFrameKey && frame?.targets.length) return

  bboxFrameKey = nextFrameKey
  if (!frame?.targets.length) {
    measurementSamples.clear()
    measurementAverages.value = {}
  }
  recordMeasurementSamples(frame?.targets ?? [])
  clearBboxFreshTimer()
  bboxFresh.value = Boolean(frame?.targets.length)
  if (!bboxFresh.value) return
  bboxFreshTimer = setTimeout(() => {
    bboxFreshTimer = undefined
    bboxFresh.value = false
  }, BBOX_STALE_MS)
}

let observationWanted = false
let observationLease = false
let observationStart: Promise<void> | undefined
let observationGeneration = 0
const observationConnecting = ref(false)
const emptyTargetText = computed(() => {
  if (observationConnecting.value || inssegState.value?.ssh?.state === 'connecting') {
    return t('common.video.personInfoConnecting')
  }
  return inssegState.value?.observing
    ? t('common.video.noPersonDetected')
    : t('common.video.personInfoDisconnected')
})

async function openObservationConnectionSettings() {
  if (showToolBar.value === false) {
    showToolBar.value = true
    await nextTick()
  }
  emitter.emit('input-event', { tab: 'connections', protocol: 'tcp' })
}

function ensureVideoObservation(): void {
  if (!observationWanted || observationLease || observationStart) return
  const api = window.electronAPI
  if (!api?.cameraCalibrationAccess || !api.cameraCalibrationObserve) return
  observationConnecting.value = true
  const task = (async () => {
    const access = await api.cameraCalibrationAccess()
    const state = await api.cameraCalibrationObserve({
      host: access?.host || dataSourceSettings.network.host.trim(),
      port: access?.port ?? 22,
      username: access?.username || 'root',
    })
    observationLease = true
    updateInssegState(state)
  })()
    .catch(() => undefined)
    .finally(() => {
      observationConnecting.value = false
      if (observationStart === task) observationStart = undefined
    })
  observationStart = task
}

async function releaseVideoObservation(): Promise<void> {
  observationWanted = false
  const generation = ++observationGeneration
  if (observationStart) await observationStart
  if (generation !== observationGeneration || !observationLease) return
  observationLease = false
  const state = await window.electronAPI?.cameraCalibrationClose?.().catch(() => undefined)
  if (state) updateInssegState(state)
}

watch(cameraTcpConnected, (connected) => {
  if (connected) ensureVideoObservation()
})

const RECONNECT_DELAY_MS = 3000
let reconnectTimer: ReturnType<typeof setTimeout> | undefined

function clearReconnectTimer() {
  if (reconnectTimer === undefined) return
  clearTimeout(reconnectTimer)
  reconnectTimer = undefined
}

function scheduleReconnect() {
  if (!dataSourceSettings.network.loop || status.value !== 'error') return
  clearReconnectTimer()
  statusMessage.value = t('common.video.reconnectWait')
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined
    void startStream()
  }, RECONNECT_DELAY_MS)
}

function handleSharedLoopChange(enabled: boolean) {
  saveDataSourceSettings()
  if (!enabled) {
    clearReconnectTimer()
  } else if (status.value === 'error') {
    scheduleReconnect()
  }
}

function persistSettings() {
  videoStorage.save({
    version: 1,
    protocol: streamProtocol.value,
    port: streamPort.value,
    suffix: streamSuffix.value,
  })
}

// 缩放/平移:滚轮以光标为中心缩放,左键拖拽平移,双击复位
const zoomLevel = ref(1)
const panOffset = ref({ x: 0, y: 0 })
const MIN_ZOOM = 1
const MAX_ZOOM = 8

const zoomStyle = computed(() => ({
  transform: `translate(${panOffset.value.x}px, ${panOffset.value.y}px) scale(${zoomLevel.value})`,
  transformOrigin: '0 0',
  cursor: zoomLevel.value > 1 ? 'grab' : 'default',
}))

function handleWheel(event: WheelEvent) {
  const stage = (event.currentTarget as HTMLElement).parentElement
  if (!stage) return
  const rect = stage.getBoundingClientRect()
  const px = event.clientX - rect.left
  const py = event.clientY - rect.top

  const factor = event.deltaY < 0 ? 1.2 : 1 / 1.2
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomLevel.value * factor))
  if (next === zoomLevel.value) return

  const ratio = next / zoomLevel.value
  panOffset.value = {
    x: px - (px - panOffset.value.x) * ratio,
    y: py - (py - panOffset.value.y) * ratio,
  }
  zoomLevel.value = next
  if (next === MIN_ZOOM) panOffset.value = { x: 0, y: 0 }
}

function handlePanStart(event: MouseEvent) {
  if (event.button !== 0 || zoomLevel.value <= 1) return
  event.preventDefault()
  const start = { x: event.clientX - panOffset.value.x, y: event.clientY - panOffset.value.y }
  const target = event.currentTarget as HTMLElement
  target.style.cursor = 'grabbing'

  const onMove = (move: MouseEvent) => {
    panOffset.value = { x: move.clientX - start.x, y: move.clientY - start.y }
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    target.style.cursor = ''
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function resetZoom() {
  zoomLevel.value = 1
  panOffset.value = { x: 0, y: 0 }
}

const isActive = computed(() => status.value === 'connecting' || status.value === 'playing')
const statusText = computed(() => statusMessage.value || status.value)
const placeholderTitle = computed(() =>
  status.value === 'error' ? t('common.video.connectionFailed') : t('common.video.cameraView'),
)
const placeholderHint = computed(() => {
  if (status.value === 'error' || status.value === 'unavailable') return statusMessage.value
  return t('common.video.configRtspHint')
})

function revokeFrameUrl() {
  if (frameUrl.value) URL.revokeObjectURL(frameUrl.value)
  frameUrl.value = ''
}

async function startStream() {
  clearReconnectTimer()
  const url = normalizeRtspUrl(streamUrl.value)
  if (!url) {
    ElMessage.warning(t('common.video.errInvalidRtsp'))
    return
  }
  if (!window.electronAPI?.startCameraStream) {
    status.value = 'unavailable'
    statusMessage.value = t('common.video.errDesktopOnly')
    return
  }

  revokeFrameUrl()
  status.value = 'connecting'
  statusMessage.value = t('common.video.connectingStatus')

  const result = await window.electronAPI.startCameraStream(url).catch((error) => ({
    ok: false,
    message: error instanceof Error ? error.message : String(error),
  }))
  if (!result.ok) {
    status.value = 'error'
    statusMessage.value = result.message || t('common.video.errStartStream')
    scheduleReconnect()
    return
  }
  observationGeneration++
  observationWanted = true
  ensureVideoObservation()
}

function openCameraSourceSettings() {
  streamProtocolDraft.value = streamProtocol.value
  streamPortDraft.value = String(streamPort.value)
  streamSuffixDraft.value = streamSuffix.value
  showCameraSourceDialog.value = true
}

function saveCameraSourceSettings() {
  const portDigits = streamPortDraft.value.replace(/\D/g, '')
  const port = Number(portDigits)
  const suffix = streamSuffixDraft.value.trim().replace(/^\/+/, '')
  if (!portDigits || !Number.isInteger(port) || port < 1 || port > 65535 || !suffix) {
    ElMessage.warning(t('common.video.errInvalidRtsp'))
    return
  }

  streamProtocol.value = streamProtocolDraft.value
  streamPort.value = port
  streamSuffix.value = suffix
  persistSettings()
  showCameraSourceDialog.value = false
  ElMessage.success(t('data.cameraRtspSaved'))
}

async function pauseStream() {
  clearReconnectTimer()
  await window.electronAPI?.stopCameraStream?.()
  await releaseVideoObservation()
  revokeFrameUrl()
  status.value = 'stopped'
  statusMessage.value = t('common.video.paused')
}

const frameListener = (_event: unknown, data: ArrayBuffer | Uint8Array) => {
  const source = data instanceof Uint8Array ? data : new Uint8Array(data)
  const bytes = new Uint8Array(source.byteLength)
  bytes.set(source)
  const nextUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }))
  if (frameUrl.value) URL.revokeObjectURL(frameUrl.value)
  frameUrl.value = nextUrl
  status.value = 'playing'
  statusMessage.value = t('common.video.live')
}

const statusListener = (_event: unknown, payload: StreamStatusPayload) => {
  if (!payload || typeof payload !== 'object') return
  if (payload.status) status.value = payload.status
  if (payload.message) statusMessage.value = payload.message
  if (payload.status === 'error') {
    revokeFrameUrl()
    scheduleReconnect()
  }
}

let inssegListenerActive = true
const inssegStateListener = (_event: unknown, state: CameraCalibrationSnapshot) => {
  if (!inssegListenerActive || !state || typeof state !== 'object') return
  updateInssegState(state)
}

onMounted(() => {
  window.ipcRenderer?.on('camera-stream-frame', frameListener)
  window.ipcRenderer?.on('camera-stream-status', statusListener)
  window.ipcRenderer?.on('camera-calibration-state', inssegStateListener)
  void window.electronAPI
    ?.cameraCalibrationSnapshot?.()
    .then((state) => {
      if (inssegListenerActive && state) updateInssegState(state)
    })
    .catch(() => undefined)
})

onUnmounted(() => {
  inssegListenerActive = false
  clearReconnectTimer()
  clearBboxFreshTimer()
  clearInterval(measurementTimer)
  window.ipcRenderer?.off('camera-stream-frame', frameListener)
  window.ipcRenderer?.off('camera-stream-status', statusListener)
  window.ipcRenderer?.off('camera-calibration-state', inssegStateListener)
  void releaseVideoObservation()
  void window.electronAPI?.stopCameraStream?.()
  revokeFrameUrl()
})
</script>

<style scoped>
.camera-player {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  color: var(--app-text);
  background: var(--app-surface);
}

.camera-controls {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--app-border);
  background: var(--app-surface-muted);
}

.loop-toggle {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  color: var(--app-text-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.camera-source-config {
  display: grid;
  gap: 16px;
}

.camera-source-config p {
  margin: 0;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.camera-source-config label {
  display: grid;
  gap: 7px;
  color: var(--app-text-secondary);
  font-size: 12px;
}

.source-reference {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 9px;
  min-width: 120px;
  min-height: 34px;
  padding: 5px 8px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  color: var(--app-text-secondary);
  background: var(--app-surface);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
}

.source-reference:hover,
.source-reference:focus-visible {
  border-color: var(--el-color-primary);
  outline: none;
}

.source-reference-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

.source-reference-copy small {
  color: var(--app-text-muted);
  font-size: 10px;
}

.source-reference-copy strong {
  overflow: hidden;
  color: var(--app-text-secondary);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-config-action {
  flex: none;
  color: var(--el-color-primary);
  font-size: 12px;
}

.video-stage {
  position: relative;
  display: grid;
  flex: 1;
  min-width: 0;
  min-height: 0;
  place-items: center;
  overflow: hidden;
  background: radial-gradient(circle at center, rgba(52, 76, 105, 0.4), transparent 58%), #10151c;
}

.video-zoom {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.video-frame {
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
}

.bbox-overlay {
  position: absolute;
  z-index: 2;
  left: 10px;
  bottom: 10px;
  display: grid;
  gap: 6px;
  max-width: calc(100% - 20px);
  max-height: calc(100% - 64px);
  padding: 8px 10px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  color: #dbe5ee;
  background: rgba(5, 10, 15, 0.78);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 1.45;
  scrollbar-width: thin;
  backdrop-filter: blur(6px);
}

.bbox-target {
  display: grid;
  gap: 2px;
}

.bbox-target + .bbox-target {
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.14);
}

.bbox-target-identity {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
}

.bbox-measurement {
  display: block;
}

.bbox-average {
  margin-left: 4px;
  color: #a9bcc9;
}

.bbox-target-identity strong {
  color: #67e8f9;
  font-weight: 600;
}

.bbox-empty {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}

.bbox-config {
  padding: 2px 7px;
  border: 1px solid rgba(103, 232, 249, 0.4);
  border-radius: 4px;
  color: #67e8f9;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.bbox-config:hover,
.bbox-config:focus-visible {
  border-color: #67e8f9;
  background: rgba(103, 232, 249, 0.1);
  outline: none;
}

.video-stage.has-bbox .zoom-hint {
  top: 10px;
  bottom: auto;
}

.video-stage.has-bbox .stream-status {
  top: 10px;
  bottom: auto;
}

.zoom-hint {
  position: absolute;
  left: 10px;
  bottom: 10px;
  padding: 3px 8px;
  border-radius: 6px;
  color: #dbe5ee;
  background: rgba(5, 10, 15, 0.72);
  font-size: 11px;
  pointer-events: none;
}

.stage-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  max-width: min(420px, 82%);
  color: #aab7c6;
}

.stage-placeholder strong {
  color: #edf3f8;
  font-size: 16px;
}

.stage-placeholder span {
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}

.connecting-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #e7edf3;
  background: rgba(10, 15, 21, 0.72);
  backdrop-filter: blur(2px);
}

.stream-status {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: calc(100% - 20px);
  padding: 5px 9px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  color: #dbe5ee;
  background: rgba(5, 10, 15, 0.72);
  font-size: 11px;
  backdrop-filter: blur(6px);
}

.status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 50%;
  background: #8996a5;
}

.status-playing .status-dot {
  background: #37d67a;
  box-shadow: 0 0 7px rgba(55, 214, 122, 0.8);
}

.status-connecting .status-dot {
  background: #f0ad3d;
}

.status-error .status-dot,
.status-unavailable .status-dot {
  background: #f06464;
}

@media (max-width: 560px) {
  .camera-controls {
    flex-wrap: wrap;
  }

  .source-reference {
    flex-basis: 100%;
  }
}
</style>
