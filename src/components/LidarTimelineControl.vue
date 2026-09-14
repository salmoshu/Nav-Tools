<script setup lang="ts">
// LiDAR MCAP 回放时间轴：对齐 FileTimelineControl（NMEA 回放）的形态与交互，
// 数据源换为 useMcapPlayer 单例。挂在工具栏内，随工具栏停靠位置自适应：
// 横向（上/下）内联展示，纵向（左/右）折叠为时钟按钮 + 弹出面板。
// 信息按钮弹出「话题 / 会话 / 快捷键」诊断面板（原回放控制面板的只读信息区）；
// 文件接入走 Input 对话框的文件输入或全窗拖放，时间轴不承担接入。
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Close,
  InfoFilled,
  RefreshRight,
  VideoPause,
  VideoPlay,
} from '@element-plus/icons-vue'
import { ElIcon } from 'element-plus'
import { useMcapPlayer, SPEED_OPTIONS } from '@/composables/useMcapPlayer'
import { formatByteSize, formatRelativeNs } from '@/core/lidar/timeFormat'
import { t } from '@/i18n'

const props = withDefaults(
  defineProps<{
    position?: 'top' | 'right' | 'bottom' | 'left'
  }>(),
  {
    position: 'bottom',
  },
)

const player = useMcapPlayer()
const ready = computed(() => player.status.value === 'ready')
const fileInfo = player.fileInfo

const isVertical = computed(() => props.position === 'right' || props.position === 'left')
const popoverOpen = ref(false)
const infoOpen = ref(false)
const infoTab = ref('topics')
const rootElement = ref<HTMLElement | null>(null)

const startNs = computed(() => player.document.value?.startNs ?? 0)
const endNs = computed(() => player.document.value?.endNs ?? 0)
const durationNs = computed(() => Math.max(0, endNs.value - startNs.value))
const elapsedNs = computed(() => Math.max(0, player.playheadNs.value - startNs.value))
const progress = computed(() =>
  durationNs.value <= 0 ? 0 : Math.min(100, (elapsedNs.value / durationNs.value) * 100),
)

const elapsedLabel = computed(
  () => `${formatRelativeNs(player.playheadNs.value, startNs.value)} / ${formatRelativeNs(endNs.value, startNs.value)}`,
)

const durationLabel = computed(() => formatRelativeNs(endNs.value, startNs.value))

/** 播放头所在的全局帧序号（跨话题合并去重后的消息时间点）。 */
const frameIndex = computed(() => {
  const times = player.document.value?.allTimesNs
  if (!times || times.length === 0) return 0
  let lo = 0
  let hi = times.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (times[mid] <= player.playheadNs.value) lo = mid + 1
    else hi = mid
  }
  return lo
})

const frameTotal = computed(() => player.document.value?.allTimesNs.length ?? 0)

// —— 诊断信息（话题表 / 会话指纹 / 加载提示），原回放控制面板内容 ——

const meta = computed(() => player.document.value?.meta)
const problems = computed(() => meta.value?.problems ?? [])
const hasIssues = computed(() => (meta.value?.truncated ?? false) || problems.value.length > 0)

const sessionMetadata = computed<Record<string, string>>(() => {
  const entries = meta.value?.metadata ?? []
  const result: Record<string, string> = {}
  for (const entry of entries) {
    for (const [key, value] of Object.entries(entry.data)) result[key] = value
  }
  return result
})

const topicRows = computed(() => {
  const doc = player.document.value
  if (!doc) return []
  const durationS = doc.durationNs / 1e9
  return doc.meta.topics.map((info) => ({
    ...info,
    frequency:
      info.messageCount > 1 && durationS > 0 ? `${(info.messageCount / durationS).toFixed(1)} Hz` : '-',
  }))
})

// —— 拖动时间轴：暂停-拖动-恢复（对齐 NMEA 时间轴手感） ——
let wasPlayingBeforeDrag = false
const dragging = ref(false)

function beginDrag(): void {
  if (!ready.value) return
  wasPlayingBeforeDrag = player.playing.value
  player.pause()
  dragging.value = true
}

function previewSlider(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (!dragging.value) beginDrag()
  player.seek(value)
}

function endDrag(): void {
  if (!dragging.value) return
  dragging.value = false
  if (wasPlayingBeforeDrag) player.play()
  wasPlayingBeforeDrag = false
}

function onSpeedChange(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value)
  if (Number.isFinite(value)) player.setSpeed(value)
}

function togglePopover(): void {
  if (!ready.value) return
  popoverOpen.value = !popoverOpen.value
  if (popoverOpen.value) infoOpen.value = false
}

function toggleInfo(): void {
  if (!ready.value) return
  infoOpen.value = !infoOpen.value
  if (infoOpen.value) popoverOpen.value = false
}

function closeOnOutsidePointer(event: MouseEvent): void {
  if (rootElement.value && !rootElement.value.contains(event.target as Node)) {
    popoverOpen.value = false
    infoOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', closeOnOutsidePointer)
  document.addEventListener('mouseup', endDrag)
  document.addEventListener('touchend', endDrag)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', closeOnOutsidePointer)
  document.removeEventListener('mouseup', endDrag)
  document.removeEventListener('touchend', endDrag)
})

watch(ready, (visible) => {
  if (!visible) {
    popoverOpen.value = false
    infoOpen.value = false
  }
})
</script>

<template>
  <div
    v-if="ready"
    ref="rootElement"
    class="lidar-timeline"
    :class="{ 'lidar-timeline--vertical': isVertical }"
    @mousedown.stop
    @click.stop
    @dblclick.stop
    @wheel.stop
  >
    <template v-if="!isVertical">
      <div class="timeline-panel timeline-panel--horizontal">
        <button
          class="timeline-button"
          :title="player.playing.value ? t('data.timelinePause') : t('data.timelinePlay')"
          @click.stop="player.toggle()"
        >
          <el-icon><VideoPause v-if="player.playing.value" /><VideoPlay v-else /></el-icon>
        </button>
        <button
          class="timeline-button"
          :title="t('lidar.timeline.prevFrame')"
          :disabled="frameIndex <= 0"
          @click.stop="player.stepFrames(-1)"
        >
          <el-icon><ArrowLeft /></el-icon>
        </button>
        <button
          class="timeline-button"
          :title="t('lidar.timeline.nextFrame')"
          :disabled="frameIndex >= frameTotal - 1"
          @click.stop="player.stepFrames(1)"
        >
          <el-icon><ArrowRight /></el-icon>
        </button>
        <input
          class="timeline-slider"
          type="range"
          :min="startNs"
          :max="endNs"
          step="1000000"
          :value="player.playheadNs.value"
          :disabled="durationNs <= 0"
          :title="elapsedLabel"
          :aria-label="elapsedLabel"
          :style="{ '--timeline-progress': `${progress}%` }"
          @mousedown.stop="beginDrag"
          @touchstart.stop="beginDrag"
          @input.stop="previewSlider"
          @change.stop="endDrag"
        />
        <span class="timeline-time" :title="elapsedLabel">{{ elapsedLabel.split(' / ')[0] }}</span>
        <span class="timeline-epoch">{{ frameIndex + 1 }} / {{ frameTotal }}</span>
        <select
          class="timeline-speed"
          :title="t('lidar.timeline.speed')"
          :value="player.speed.value"
          @change.stop="onSpeedChange"
        >
          <option v-for="option in SPEED_OPTIONS" :key="option" :value="option">×{{ option }}</option>
        </select>
        <button
          class="timeline-button"
          :class="{ 'timeline-button--active': player.loop.value }"
          :title="t('lidar.timeline.loop')"
          @click.stop="player.setLoop(!player.loop.value)"
        >
          <el-icon><RefreshRight /></el-icon>
        </button>
        <button
          class="timeline-button timeline-info-trigger"
          :class="{ 'timeline-button--warn': hasIssues }"
          :title="t('lidar.playback.info')"
          @click.stop="toggleInfo"
        >
          <el-icon><InfoFilled /></el-icon>
        </button>
      </div>
    </template>

    <template v-else>
      <div class="timeline-triggers">
        <button
          class="timeline-button timeline-trigger"
          :title="t('data.timelineOpen')"
          @click.stop="togglePopover"
        >
          <el-icon><Clock /></el-icon>
        </button>
        <button
          class="timeline-button timeline-trigger"
          :class="{ 'timeline-button--warn': hasIssues }"
          :title="t('lidar.playback.info')"
          @click.stop="toggleInfo"
        >
          <el-icon><InfoFilled /></el-icon>
        </button>
      </div>
      <div
        v-if="popoverOpen"
        class="timeline-panel timeline-popover"
        :class="`timeline-popover--${position}`"
      >
        <div class="timeline-actions">
          <button
            class="timeline-button"
            :title="player.playing.value ? t('data.timelinePause') : t('data.timelinePlay')"
            @click.stop="player.toggle()"
          >
            <el-icon><VideoPause v-if="player.playing.value" /><VideoPlay v-else /></el-icon>
          </button>
          <button
            class="timeline-button"
            :title="t('lidar.timeline.prevFrame')"
            :disabled="frameIndex <= 0"
            @click.stop="player.stepFrames(-1)"
          >
            <el-icon><ArrowLeft /></el-icon>
          </button>
          <button
            class="timeline-button"
            :title="t('lidar.timeline.nextFrame')"
            :disabled="frameIndex >= frameTotal - 1"
            @click.stop="player.stepFrames(1)"
          >
            <el-icon><ArrowRight /></el-icon>
          </button>
          <button
            class="timeline-button"
            :class="{ 'timeline-button--active': player.loop.value }"
            :title="t('lidar.timeline.loop')"
            @click.stop="player.setLoop(!player.loop.value)"
          >
            <el-icon><RefreshRight /></el-icon>
          </button>
          <button
            class="timeline-button timeline-close"
            :title="t('data.timelineClose')"
            @click.stop="popoverOpen = false"
          >
            <el-icon><Close /></el-icon>
          </button>
        </div>
        <input
          class="timeline-slider timeline-slider--popover"
          type="range"
          :min="startNs"
          :max="endNs"
          step="1000000"
          :value="player.playheadNs.value"
          :disabled="durationNs <= 0"
          :title="elapsedLabel"
          :aria-label="elapsedLabel"
          :style="{ '--timeline-progress': `${progress}%` }"
          @mousedown.stop="beginDrag"
          @touchstart.stop="beginDrag"
          @input.stop="previewSlider"
          @change.stop="endDrag"
        />
        <div class="timeline-details">
          <span class="timeline-time" :title="elapsedLabel">{{ elapsedLabel }}</span>
          <span class="timeline-epoch">{{ frameIndex + 1 }} / {{ frameTotal }}</span>
        </div>
        <select
          class="timeline-speed timeline-speed--popover"
          :title="t('lidar.timeline.speed')"
          :value="player.speed.value"
          @change.stop="onSpeedChange"
        >
          <option v-for="option in SPEED_OPTIONS" :key="option" :value="option">×{{ option }}</option>
        </select>
      </div>
    </template>

    <!-- 诊断信息弹层：话题表 / 会话指纹与加载提示 / 快捷键（原回放控制面板内容） -->
    <div v-if="infoOpen" class="lidar-info-popover" :class="`lidar-info-popover--${position}`">
      <div class="info-header">
        <span class="info-file" :title="fileInfo?.path ?? fileInfo?.name">
          {{ fileInfo?.name }}<template v-if="(fileInfo?.partCount ?? 1) > 1">（{{ t('lidar.playback.partCount', { count: fileInfo!.partCount }) }}）</template>
        </span>
        <el-tooltip v-if="meta?.truncated" :content="t('lidar.playback.truncatedTip')" placement="bottom">
          <el-tag type="warning" size="small" disable-transitions>{{ t('lidar.playback.truncated') }}</el-tag>
        </el-tooltip>
        <button class="timeline-button info-close" :title="t('data.timelineClose')" @click.stop="infoOpen = false">
          <el-icon><Close /></el-icon>
        </button>
      </div>
      <el-tabs v-model="infoTab" class="info-tabs">
        <el-tab-pane :label="t('lidar.playback.tabTopics')" name="topics">
          <el-table :data="topicRows" size="small" height="260">
            <el-table-column prop="topic" label="topic" min-width="140" />
            <el-table-column prop="schemaName" label="schema" min-width="170" />
            <el-table-column prop="messageCount" label="msg" width="64" />
            <el-table-column :label="t('lidar.playback.colFrequency')" width="76">
              <template #default="{ row }">{{ row.frequency }}</template>
            </el-table-column>
            <el-table-column :label="t('lidar.playback.colVisible')" width="70">
              <template #default="{ row }">
                <el-switch
                  size="small"
                  :model-value="player.isTopicVisible(row.topic)"
                  @change="(value: unknown) => player.setTopicVisible(row.topic, value === true)"
                />
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane :label="t('lidar.playback.tabSession')" name="session">
          <div class="session-info">
            <div class="info-row"><span>profile</span><b>{{ meta?.profile || '-' }}</b></div>
            <div class="info-row"><span>library</span><b>{{ meta?.library || '-' }}</b></div>
            <div class="info-row"><span>{{ t('lidar.playback.size') }}</span><b>{{ formatByteSize(fileInfo?.sizeBytes ?? 0) }}</b></div>
            <div class="info-row"><span>{{ t('lidar.playback.duration') }}</span><b>{{ durationLabel }}</b></div>
            <div class="info-row" v-for="(value, key) in sessionMetadata" :key="key">
              <span>{{ key }}</span><b>{{ value }}</b>
            </div>
          </div>
          <div class="problems" v-if="problems.length > 0">
            <div class="problems-title">{{ t('lidar.playback.problems') }}</div>
            <p v-for="(problem, index) in problems" :key="index" class="problem-line">{{ problem }}</p>
          </div>
        </el-tab-pane>
        <el-tab-pane :label="t('lidar.playback.tabShortcuts')" name="shortcuts">
          <div class="session-info">
            <div class="info-row"><span>Space</span><b>{{ t('lidar.playback.playPause') }}</b></div>
            <div class="info-row"><span>← / →</span><b>{{ t('lidar.playback.stepShortcut') }}</b></div>
            <div class="info-row"><span>Shift + ← / →</span><b>{{ t('lidar.playback.step10Shortcut') }}</b></div>
            <div class="info-row"><span>Home / End</span><b>{{ t('lidar.playback.jumpShortcut') }}</b></div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<style scoped>
/* 结构样式对齐 FileTimelineControl（保持两个时间轴在工具栏里的观感一致） */
.lidar-timeline {
  position: relative;
  display: inline-flex;
  align-items: center;
  color: var(--app-text);
  font-size: 12px;
  line-height: 1;
  user-select: none;
}

.lidar-timeline--vertical {
  position: relative;
}

.timeline-panel,
.timeline-actions,
.timeline-details,
.timeline-triggers {
  display: flex;
  align-items: center;
}

.timeline-triggers {
  flex-direction: column;
  gap: 5px;
}

.timeline-panel--horizontal {
  gap: 6px;
  padding: 4px 7px;
  border: 1px solid color-mix(in srgb, #06b6d4 24%, var(--app-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--app-surface) 88%, var(--app-surface-muted));
  box-shadow: 0 2px 8px color-mix(in srgb, var(--app-shadow) 18%, transparent);
}

.timeline-button {
  display: inline-grid;
  width: 24px;
  height: 24px;
  padding: 0;
  flex: none;
  color: var(--app-text);
  background: var(--app-surface-muted);
  border: 1px solid var(--app-border);
  border-radius: 5px;
  cursor: pointer;
  place-items: center;
}

.timeline-button:hover:not(:disabled) {
  color: #06b6d4;
  background: var(--app-hover);
}

.timeline-button:disabled {
  cursor: default;
  opacity: 0.4;
}

.timeline-button--active {
  color: #06b6d4;
  border-color: color-mix(in srgb, #06b6d4 45%, var(--app-border));
  background: color-mix(in srgb, #06b6d4 12%, var(--app-surface));
}

/* 有截断/加载提示时信息按钮转琥珀色，提示有东西值得看 */
.timeline-button--warn {
  color: #f59e0b;
  border-color: color-mix(in srgb, #f59e0b 45%, var(--app-border));
  background: color-mix(in srgb, #f59e0b 12%, var(--app-surface));
}

.timeline-button--warn:hover:not(:disabled) {
  color: #d97706;
  background: color-mix(in srgb, #f59e0b 18%, var(--app-surface));
}

.timeline-slider {
  --timeline-progress: 0%;

  appearance: none;
  -webkit-appearance: none;
  width: clamp(120px, 24vw, 360px);
  height: 24px;
  margin: 0 2px;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  cursor: pointer;
}

.timeline-slider::-webkit-slider-runnable-track {
  height: 6px;
  border: 1px solid color-mix(in srgb, var(--app-border-strong) 76%, transparent);
  border-radius: 999px;
  background: linear-gradient(
    to right,
    #06b6d4 0 var(--timeline-progress),
    var(--app-surface-muted) var(--timeline-progress) 100%
  );
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--app-shadow) 20%, transparent);
}

.timeline-slider::-webkit-slider-thumb {
  width: 16px;
  height: 16px;
  margin-top: -6px;
  appearance: none;
  -webkit-appearance: none;
  border: 3px solid var(--app-surface);
  border-radius: 50%;
  background: #06b6d4;
  box-shadow:
    0 0 0 1px color-mix(in srgb, #06b6d4 68%, var(--app-border)),
    0 3px 8px color-mix(in srgb, #06b6d4 30%, transparent);
  transition:
    box-shadow 140ms ease,
    transform 140ms ease;
}

.timeline-slider:hover::-webkit-slider-thumb,
.timeline-slider:focus-visible::-webkit-slider-thumb {
  box-shadow:
    0 0 0 3px color-mix(in srgb, #06b6d4 18%, transparent),
    0 3px 9px color-mix(in srgb, #06b6d4 35%, transparent);
  transform: scale(1.08);
}

.timeline-slider::-moz-range-track {
  height: 6px;
  border: 1px solid color-mix(in srgb, var(--app-border-strong) 76%, transparent);
  border-radius: 999px;
  background: var(--app-surface-muted);
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--app-shadow) 20%, transparent);
}

.timeline-slider::-moz-range-progress {
  height: 6px;
  border-radius: 999px;
  background: #06b6d4;
}

.timeline-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: 3px solid var(--app-surface);
  border-radius: 50%;
  background: #06b6d4;
  box-shadow:
    0 0 0 1px color-mix(in srgb, #06b6d4 68%, var(--app-border)),
    0 3px 8px color-mix(in srgb, #06b6d4 30%, transparent);
}

.timeline-slider:disabled {
  cursor: default;
  opacity: 0.45;
}

.timeline-time,
.timeline-epoch {
  color: var(--app-text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.timeline-time {
  min-width: 82px;
}

.timeline-epoch {
  min-width: 64px;
  color: var(--app-text-muted);
  text-align: center;
}

.timeline-speed {
  height: 24px;
  padding: 0 2px;
  flex: none;
  color: var(--app-text);
  font-size: 11px;
  background: var(--app-surface-muted);
  border: 1px solid var(--app-border);
  border-radius: 5px;
  cursor: pointer;
  outline: none;
}

.timeline-speed--popover {
  align-self: stretch;
}

.timeline-trigger {
  width: 28px;
}

.timeline-popover {
  position: absolute;
  top: 0;
  z-index: 1000;
  width: 280px;
  padding: 9px;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px var(--app-shadow);
}

.timeline-popover--right {
  right: calc(100% + 7px);
}

.timeline-popover--left {
  left: calc(100% + 7px);
}

.timeline-actions {
  gap: 5px;
}

.timeline-close {
  margin-left: auto;
}

.timeline-slider--popover {
  width: 100%;
  margin: 0;
}

.timeline-details {
  justify-content: space-between;
  gap: 8px;
}

/* —— 诊断信息弹层 —— */
.lidar-info-popover {
  position: absolute;
  z-index: 1001;
  width: min(560px, 86vw);
  padding: 8px 12px 10px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px var(--app-shadow);
}

.lidar-info-popover--bottom {
  bottom: calc(100% + 7px);
  right: 0;
}

.lidar-info-popover--top {
  top: calc(100% + 7px);
  right: 0;
}

.lidar-info-popover--right {
  right: calc(100% + 7px);
  top: 0;
}

.lidar-info-popover--left {
  left: calc(100% + 7px);
  top: 0;
}

.info-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.info-file {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-close {
  margin-left: auto;
  flex: none;
}

.info-tabs :deep(.el-tabs__content) {
  overflow: auto;
  max-height: 300px;
}

.session-info {
  padding: 4px 2px;
}

.info-row {
  display: flex;
  gap: 10px;
  font-size: 12px;
  padding: 2px 0;
}

.info-row span {
  min-width: 120px;
  flex: none;
  color: var(--app-text-secondary);
}

.info-row b {
  font-weight: 500;
  word-break: break-all;
}

.problems {
  padding: 6px 2px;
}

.problems-title {
  font-size: 12px;
  color: #f59e0b;
  margin-bottom: 4px;
}

.problem-line {
  font-size: 12px;
  color: var(--app-text-secondary);
  padding: 1px 0;
}
</style>
