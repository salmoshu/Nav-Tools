<template>
  <section class="camera-player">
    <div class="video-stage" :class="{ 'has-frame': Boolean(frameUrl) }">
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

    <div v-if="labels.length" class="label-hints" :aria-label="t('common.video.recognizedLabelsDesc')">
      <span class="hints-title">{{ t('common.video.recognizedLabels') }}</span>
      <span v-for="(label, index) in labels" :key="index" class="label-chip">{{ label }}</span>
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
        @click="startStream"
      >
        {{ t('common.video.play') }}
      </el-button>
      <el-button v-else :icon="VideoPause" @click="pauseStream">{{ t('common.video.pause') }}</el-button>
      <span class="loop-toggle" :title="t('common.video.loopReconnectHint')">
        <span class="loop-toggle-label">{{ t('common.video.loopReconnect') }}</span>
        <el-switch
          v-model="autoReconnect"
          size="small"
          :aria-label="t('common.video.loopReconnect')"
          @change="handleAutoReconnectChange"
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
          <span>{{ t('common.video.rtspAddress') }}</span>
          <el-input
            v-model="streamUrlDraft"
            :aria-label="t('common.video.rtspAddress')"
            placeholder="rtsp://192.168.3.14:8554/rgbstream"
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
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Link, Loading, VideoCamera, VideoPause, VideoPlay } from '@element-plus/icons-vue'
import { t } from '@/i18n'
import {
  CameraVideoStorage,
  normalizeRtspUrl,
} from '@/core/camera/CameraVideoStorage'
import { JsonStorage } from '@/core/storage/JsonStorage'

type StreamStatus = 'idle' | 'connecting' | 'playing' | 'stopped' | 'error' | 'unavailable'
type StreamStatusPayload = { status?: StreamStatus; message?: string }

const videoStorage = new CameraVideoStorage(new JsonStorage(window.localStorage))
const initialSettings = videoStorage.load()
const streamUrl = ref(initialSettings.streamUrl)
const streamUrlDraft = ref(streamUrl.value)
/** 循环重连开关:断开后自动重新拉起视频流,面向频繁插拔设备的场景 */
const autoReconnect = ref(initialSettings.autoReconnect)
const showCameraSourceDialog = ref(false)
const status = ref<StreamStatus>('idle')
const statusMessage = ref(t('common.video.waitingToPlay'))
const frameUrl = ref('')
/** 主进程标签识别结果(模板匹配 + 时序投票) */
const labels = ref<string[]>([])

const RECONNECT_DELAY_MS = 3000
let reconnectTimer: ReturnType<typeof setTimeout> | undefined

function clearReconnectTimer() {
  if (reconnectTimer === undefined) return
  clearTimeout(reconnectTimer)
  reconnectTimer = undefined
}

function scheduleReconnect() {
  if (!autoReconnect.value || status.value !== 'error') return
  clearReconnectTimer()
  statusMessage.value = t('common.video.reconnectWait')
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined
    void startStream()
  }, RECONNECT_DELAY_MS)
}

function handleAutoReconnectChange(enabled: boolean) {
  persistSettings()
  if (!enabled) {
    clearReconnectTimer()
  } else if (status.value === 'error') {
    scheduleReconnect()
  }
}

function persistSettings() {
  videoStorage.save({ version: 1, streamUrl: streamUrl.value, autoReconnect: autoReconnect.value })
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
  }
}

function openCameraSourceSettings() {
  streamUrlDraft.value = streamUrl.value
  showCameraSourceDialog.value = true
}

function saveCameraSourceSettings() {
  const url = normalizeRtspUrl(streamUrlDraft.value)
  if (!url) {
    ElMessage.warning(t('common.video.errInvalidRtsp'))
    return
  }

  streamUrl.value = url
  streamUrlDraft.value = url
  persistSettings()
  showCameraSourceDialog.value = false
  ElMessage.success(t('data.cameraRtspSaved'))
}

async function pauseStream() {
  clearReconnectTimer()
  await window.electronAPI?.stopCameraStream?.()
  revokeFrameUrl()
  labels.value = []
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
    labels.value = []
    scheduleReconnect()
  }
}

const labelListener = (_event: unknown, payload: { labels?: unknown }) => {
  if (!payload || !Array.isArray(payload.labels)) return
  labels.value = payload.labels.filter((item): item is string => typeof item === 'string')
}

onMounted(() => {
  window.ipcRenderer?.on('camera-stream-frame', frameListener)
  window.ipcRenderer?.on('camera-stream-status', statusListener)
  window.ipcRenderer?.on('camera-stream-labels', labelListener)
})

onUnmounted(() => {
  clearReconnectTimer()
  window.ipcRenderer?.off('camera-stream-frame', frameListener)
  window.ipcRenderer?.off('camera-stream-status', statusListener)
  window.ipcRenderer?.off('camera-stream-labels', labelListener)
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

.label-hints {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 10px;
  border-top: 1px solid var(--app-border);
  background: var(--app-surface);
}

.hints-title {
  font-size: 12px;
  color: var(--app-text-muted);
}

.label-chip {
  padding: 2px 8px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: var(--app-surface-muted);
  color: var(--el-color-danger);
  font-size: 12px;
  font-family: 'Courier New', monospace;
  font-weight: 600;
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
