<template>
  <div class="gnssraw-loading">
    <div class="line">
      <span>{{ t('gnssRaw.common.loading') }}…</span>
      <span class="pct">{{ percent }}%</span>
    </div>
    <div class="track">
      <div class="fill" :style="{ width: `${percent}%` }"></div>
    </div>
    <div v-if="detail" class="detail">{{ detail }}</div>
  </div>
</template>

<script setup lang="ts">
// GNSS-Raw 加载态：百分比 + 进度条 + 明细（RTCM 按字节，RINEX 按文件数）。
// 大数据文件解码耗时较长，各面板共用同一加载指示。
import { computed } from 'vue'
import { t } from '@/i18n'
import { useGnssRaw } from '@/composables/useGnssRaw'
import { formatByteSize } from '@/core/lidar/timeFormat'

const store = useGnssRaw()

const percent = computed(() => {
  const p = store.progress.value
  if (!p || p.total <= 0) return 0
  return Math.min(100, Math.round((p.done / p.total) * 100))
})

const detail = computed(() => {
  const p = store.progress.value
  if (!p || p.total <= 0) return ''
  if (store.kind.value === 'rtcm') {
    return `${formatByteSize(p.done)} / ${formatByteSize(p.total)}`
  }
  return t('gnssRaw.common.loadingFiles', { done: p.done, total: p.total })
})
</script>

<style scoped>
.gnssraw-loading {
  padding: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.line {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}
.pct {
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}
.track {
  height: 4px;
  border-radius: 2px;
  background: var(--el-border-color-lighter);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 2px;
  background: var(--el-color-primary);
  transition: width 0.2s ease;
}
.detail {
  margin-top: 6px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
}
</style>
