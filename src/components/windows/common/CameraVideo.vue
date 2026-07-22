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
          alt="相机实时视频"
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
        <span>正在连接视频流…</span>
      </div>

      <div v-if="zoomLevel > 1" class="zoom-hint" title="双击复位">
        {{ Math.round(zoomLevel * 100) }}%
      </div>

      <div class="stream-status" :class="`status-${status}`">
        <span class="status-dot"></span>
        <span>{{ statusText }}</span>
      </div>
    </div>

    <div class="camera-controls">
      <el-input
        v-model="streamUrl"
        class="stream-input"
        aria-label="RTSP 视频地址"
        placeholder="rtsp://192.168.3.14:8554/rgbstream"
        :disabled="isActive"
        clearable
        @keyup.enter="startStream"
      >
        <template #prefix
          ><el-icon><Link /></el-icon
        ></template>
      </el-input>
      <el-button
        v-if="!isActive"
        type="primary"
        :icon="VideoPlay"
        :loading="status === 'connecting'"
        @click="startStream"
      >
        播放
      </el-button>
      <el-button v-else :icon="VideoPause" @click="pauseStream">暂停</el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Link, Loading, VideoCamera, VideoPause, VideoPlay } from '@element-plus/icons-vue'

type StreamStatus = 'idle' | 'connecting' | 'playing' | 'stopped' | 'error' | 'unavailable'
type StreamStatusPayload = { status?: StreamStatus; message?: string }

const STORAGE_KEY = 'nav-tools:camera-stream-url'
const DEFAULT_STREAM_URL = 'rtsp://192.168.3.14:8554/rgbstream'

const streamUrl = ref(localStorage.getItem(STORAGE_KEY) || DEFAULT_STREAM_URL)
const status = ref<StreamStatus>('idle')
const statusMessage = ref('等待播放')
const frameUrl = ref('')

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
const placeholderTitle = computed(() => (status.value === 'error' ? '视频连接失败' : '相机画面'))
const placeholderHint = computed(() => {
  if (status.value === 'error' || status.value === 'unavailable') return statusMessage.value
  return '输入 RTSP 地址后点击播放'
})

function revokeFrameUrl() {
  if (frameUrl.value) URL.revokeObjectURL(frameUrl.value)
  frameUrl.value = ''
}

function validateUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'rtsp:' && parsed.hostname ? parsed.toString() : undefined
  } catch {
    return undefined
  }
}

async function startStream() {
  const url = validateUrl(streamUrl.value)
  if (!url) {
    ElMessage.warning('请输入以 rtsp:// 开头的有效视频地址')
    return
  }

  if (!window.electronAPI?.startCameraStream) {
    status.value = 'unavailable'
    statusMessage.value = 'RTSP 播放仅支持 Nav-Tools 桌面版'
    return
  }

  localStorage.setItem(STORAGE_KEY, url)
  streamUrl.value = url
  revokeFrameUrl()
  status.value = 'connecting'
  statusMessage.value = '正在连接…'

  const result = await window.electronAPI.startCameraStream(url).catch((error) => ({
    ok: false,
    message: error instanceof Error ? error.message : String(error),
  }))
  if (!result.ok) {
    status.value = 'error'
    statusMessage.value = result.message || '无法启动视频流'
  }
}

async function pauseStream() {
  await window.electronAPI?.stopCameraStream?.()
  revokeFrameUrl()
  status.value = 'stopped'
  statusMessage.value = '已暂停'
}

const frameListener = (_event: unknown, data: ArrayBuffer | Uint8Array) => {
  const source = data instanceof Uint8Array ? data : new Uint8Array(data)
  const bytes = new Uint8Array(source.byteLength)
  bytes.set(source)
  const nextUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }))
  if (frameUrl.value) URL.revokeObjectURL(frameUrl.value)
  frameUrl.value = nextUrl
  status.value = 'playing'
  statusMessage.value = '直播中'
}

const statusListener = (_event: unknown, payload: StreamStatusPayload) => {
  if (!payload || typeof payload !== 'object') return
  if (payload.status) status.value = payload.status
  if (payload.message) statusMessage.value = payload.message
  if (payload.status === 'error') revokeFrameUrl()
}

onMounted(() => {
  window.ipcRenderer?.on('camera-stream-frame', frameListener)
  window.ipcRenderer?.on('camera-stream-status', statusListener)
})

onUnmounted(() => {
  window.ipcRenderer?.off('camera-stream-frame', frameListener)
  window.ipcRenderer?.off('camera-stream-status', statusListener)
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

.stream-input {
  flex: 1;
  min-width: 120px;
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

  .stream-input {
    flex-basis: 100%;
  }
}
</style>
