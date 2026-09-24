<script setup lang="ts">
// GNSS-Raw 解码加载指示：固定在工具栏，形态对齐 FileTimelineControl 的 indexing 块。
// 数据来自 useGnssRaw 单例（Worker 每 1MiB 上报 progress；RTCM 单位为字节，RINEX 为文件数）。
import { computed } from 'vue'
import { t } from '@/i18n'
import { useGnssRaw } from '@/composables/useGnssRaw'
import { formatByteSize } from '@/core/lidar/timeFormat'

const props = withDefaults(
  defineProps<{
    position?: 'top' | 'right' | 'bottom' | 'left'
  }>(),
  { position: 'bottom' },
)

const store = useGnssRaw()
const isVertical = computed(() => props.position === 'right' || props.position === 'left')

const percent = computed(() => {
  const p = store.progress.value
  if (!p || p.total <= 0) return 0
  return Math.min(100, Math.round((p.done / p.total) * 100))
})

const fileName = computed(() => store.fileInfo.value?.name ?? '')

const detail = computed(() => {
  const p = store.progress.value
  if (!p || p.total <= 0) return ''
  if (store.kind.value === 'rtcm') {
    return `${formatByteSize(p.done)} / ${formatByteSize(p.total)}`
  }
  return t('gnssRaw.common.loadingFiles', { done: p.done, total: p.total })
})
</script>

<template>
  <div
    v-if="store.status.value === 'loading'"
    class="gnssraw-loading"
    :class="{ 'gnssraw-loading--vertical': isVertical }"
    :title="detail ? `${fileName} ${detail}` : fileName"
    @mousedown.stop
    @click.stop
    @dblclick.stop
    @wheel.stop
  >
    <span v-if="!isVertical" class="gnssraw-loading-name">{{ fileName }}</span>
    <span>{{
      isVertical
        ? `${percent}%`
        : `${t('gnssRaw.common.loading')}… ${percent}%`
    }}</span>
    <span class="gnssraw-loading-track">
      <span class="gnssraw-loading-fill" :style="{ width: `${percent}%` }"></span>
    </span>
  </div>
</template>

<style scoped>
.gnssraw-loading {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  user-select: none;
}

.gnssraw-loading-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gnssraw-loading-track {
  width: 120px;
  height: 4px;
  overflow: hidden;
  background: var(--app-surface-muted);
  border-radius: 999px;
}

.gnssraw-loading-fill {
  display: block;
  height: 100%;
  background: var(--el-color-primary);
  transition: width 0.12s linear;
}

.gnssraw-loading--vertical {
  width: 30px;
  padding: 2px 0;
  flex-direction: column;
  font-size: 10px;
}

.gnssraw-loading--vertical .gnssraw-loading-track {
  width: 24px;
}
</style>
