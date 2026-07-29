<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, Clock, Close, VideoPause, VideoPlay } from '@element-plus/icons-vue'
import { ElIcon } from 'element-plus'
import { useFileTimeline } from '@/composables/useFileTimeline'
import { t } from '@/i18n'

const props = withDefaults(
  defineProps<{
    position?: 'top' | 'right' | 'bottom' | 'left'
  }>(),
  {
    position: 'bottom',
  },
)

const {
  active,
  indexing,
  indexingProgress,
  playing,
  cursorIndex,
  totalEpochs,
  elapsedMilliseconds,
  durationMilliseconds,
  cursorTime,
  progress,
  togglePlayback,
  stepEpoch,
  beginDrag,
  previewElapsedTime,
  endDrag,
} = useFileTimeline()

const isVertical = computed(() => props.position === 'right' || props.position === 'left')
const popoverOpen = ref(false)
const rootElement = ref<HTMLElement | null>(null)

const elapsedLabel = computed(() => {
  const format = (milliseconds: number) => {
    const total = Math.max(0, Math.floor(milliseconds))
    const hours = Math.floor(total / 3_600_000)
    const minutes = Math.floor((total % 3_600_000) / 60_000)
    const seconds = Math.floor((total % 60_000) / 1000)
    const millis = total % 1000
    const pad = (value: number, length = 2) => String(value).padStart(length, '0')
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`
  }
  return `${format(elapsedMilliseconds.value)} / ${format(durationMilliseconds.value)}`
})

function togglePopover(): void {
  if (active.value && !indexing.value) popoverOpen.value = !popoverOpen.value
}

function previewSlider(event: Event): void {
  previewElapsedTime(Number((event.target as HTMLInputElement).value))
}

function closeOnOutsidePointer(event: MouseEvent): void {
  if (popoverOpen.value && rootElement.value && !rootElement.value.contains(event.target as Node)) {
    popoverOpen.value = false
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

watch(active, (visible) => {
  if (!visible) popoverOpen.value = false
})
</script>

<template>
  <div
    v-if="active"
    ref="rootElement"
    class="file-timeline"
    :class="{ 'file-timeline--vertical': isVertical }"
    @mousedown.stop
    @click.stop
    @dblclick.stop
    @wheel.stop
  >
    <div v-if="indexing" class="timeline-indexing" :title="t('data.timelineIndexing')">
      <span>{{
        isVertical
          ? `${Math.round(indexingProgress)}%`
          : `${t('data.timelineIndexing')} ${Math.round(indexingProgress)}%`
      }}</span>
      <span class="indexing-track">
        <span class="indexing-fill" :style="{ width: `${indexingProgress}%` }"></span>
      </span>
    </div>

    <template v-else-if="!isVertical">
      <div class="timeline-panel timeline-panel--horizontal">
        <button
          class="timeline-button"
          :title="playing ? t('data.timelinePause') : t('data.timelinePlay')"
          @click.stop="togglePlayback"
        >
          <el-icon><VideoPause v-if="playing" /><VideoPlay v-else /></el-icon>
        </button>
        <button
          class="timeline-button"
          :title="t('data.timelinePrevious')"
          :disabled="cursorIndex <= 0"
          @click.stop="stepEpoch(-1)"
        >
          <el-icon><ArrowLeft /></el-icon>
        </button>
        <button
          class="timeline-button"
          :title="t('data.timelineNext')"
          :disabled="cursorIndex >= totalEpochs - 1"
          @click.stop="stepEpoch(1)"
        >
          <el-icon><ArrowRight /></el-icon>
        </button>
        <input
          class="timeline-slider"
          type="range"
          min="0"
          :max="durationMilliseconds"
          step="1"
          :value="elapsedMilliseconds"
          :disabled="durationMilliseconds <= 0"
          :title="elapsedLabel"
          :aria-label="elapsedLabel"
          :style="{ '--timeline-progress': `${progress}%` }"
          @mousedown.stop="beginDrag"
          @touchstart.stop="beginDrag"
          @input.stop="previewSlider"
          @change.stop="endDrag"
        />
        <span class="timeline-time" :title="elapsedLabel">{{ cursorTime }}</span>
        <span class="timeline-epoch">{{ cursorIndex + 1 }} / {{ totalEpochs }}</span>
      </div>
    </template>

    <template v-else>
      <button
        class="timeline-button timeline-trigger"
        :title="t('data.timelineOpen')"
        @click.stop="togglePopover"
      >
        <el-icon><Clock /></el-icon>
      </button>
      <div
        v-if="popoverOpen"
        class="timeline-panel timeline-popover"
        :class="`timeline-popover--${position}`"
      >
        <div class="timeline-actions">
          <button
            class="timeline-button"
            :title="playing ? t('data.timelinePause') : t('data.timelinePlay')"
            @click.stop="togglePlayback"
          >
            <el-icon><VideoPause v-if="playing" /><VideoPlay v-else /></el-icon>
          </button>
          <button
            class="timeline-button"
            :title="t('data.timelinePrevious')"
            :disabled="cursorIndex <= 0"
            @click.stop="stepEpoch(-1)"
          >
            <el-icon><ArrowLeft /></el-icon>
          </button>
          <button
            class="timeline-button"
            :title="t('data.timelineNext')"
            :disabled="cursorIndex >= totalEpochs - 1"
            @click.stop="stepEpoch(1)"
          >
            <el-icon><ArrowRight /></el-icon>
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
          min="0"
          :max="durationMilliseconds"
          step="1"
          :value="elapsedMilliseconds"
          :disabled="durationMilliseconds <= 0"
          :title="elapsedLabel"
          :aria-label="elapsedLabel"
          :style="{ '--timeline-progress': `${progress}%` }"
          @mousedown.stop="beginDrag"
          @touchstart.stop="beginDrag"
          @input.stop="previewSlider"
          @change.stop="endDrag"
        />
        <div class="timeline-details">
          <span class="timeline-time" :title="elapsedLabel">{{ cursorTime }}</span>
          <span class="timeline-epoch">{{ cursorIndex + 1 }} / {{ totalEpochs }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.file-timeline {
  display: inline-flex;
  align-items: center;
  color: var(--app-text);
  font-size: 12px;
  line-height: 1;
  user-select: none;
}

.file-timeline--vertical {
  position: relative;
}

.timeline-panel,
.timeline-actions,
.timeline-details,
.timeline-indexing {
  display: flex;
  align-items: center;
}

.timeline-panel--horizontal {
  gap: 6px;
  padding: 4px 7px;
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 14%, var(--app-border));
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
  color: var(--el-color-primary);
  background: var(--app-hover);
}

.timeline-button:disabled {
  cursor: default;
  opacity: 0.4;
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
    var(--el-color-primary) 0 var(--timeline-progress),
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
  background: var(--el-color-primary);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--el-color-primary) 68%, var(--app-border)),
    0 3px 8px color-mix(in srgb, var(--el-color-primary) 30%, transparent);
  transition:
    box-shadow 140ms ease,
    transform 140ms ease;
}

.timeline-slider:hover::-webkit-slider-thumb,
.timeline-slider:focus-visible::-webkit-slider-thumb {
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--el-color-primary) 18%, transparent),
    0 3px 9px color-mix(in srgb, var(--el-color-primary) 35%, transparent);
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
  background: var(--el-color-primary);
}

.timeline-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: 3px solid var(--app-surface);
  border-radius: 50%;
  background: var(--el-color-primary);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--el-color-primary) 68%, var(--app-border)),
    0 3px 8px color-mix(in srgb, var(--el-color-primary) 30%, transparent);
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

.timeline-indexing {
  gap: 6px;
  padding: 2px 6px;
  color: var(--app-text-secondary);
  white-space: nowrap;
}

.indexing-track {
  width: 120px;
  height: 4px;
  overflow: hidden;
  background: var(--app-surface-muted);
  border-radius: 999px;
}

.indexing-fill {
  display: block;
  height: 100%;
  background: var(--el-color-primary);
  transition: width 0.12s linear;
}

.file-timeline--vertical .timeline-indexing {
  width: 30px;
  padding: 2px 0;
  flex-direction: column;
  font-size: 10px;
}

.file-timeline--vertical .indexing-track {
  width: 24px;
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
</style>
