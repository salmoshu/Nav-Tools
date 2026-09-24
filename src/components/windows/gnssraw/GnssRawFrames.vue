<template>
  <div class="gnssraw-frames">
    <div v-if="store.status.value === 'loading'" class="state-row">
      {{ t('gnssRaw.common.loading') }}…
    </div>
    <div v-else-if="store.status.value === 'error'" class="state-row error">
      {{ t('gnssRaw.common.loadError') }}: {{ store.errorText.value }}
    </div>
    <template v-else-if="stats">
      <div v-if="store.fileInfo.value" class="source-bar">
        <span class="source-kind">{{ store.kind.value === 'rtcm' ? 'RTCM' : 'RINEX' }}</span>
        <span class="source-name" :title="store.fileInfo.value.path ?? store.fileInfo.value.name">
          {{ store.fileInfo.value.name }}
        </span>
        <span v-if="store.fileInfo.value.count > 1" class="source-count">
          {{ t('gnssRaw.frames.sourceFiles', { count: store.fileInfo.value.count }) }}
        </span>
        <el-button
          v-if="store.kind.value === 'rtcm'"
          class="export-btn"
          size="small"
          :loading="exporting"
          @click="exportRnx"
        >
          {{ t('gnssRaw.frames.exportRnx') }}
        </el-button>
      </div>
      <div class="cards">
        <div v-for="card in cards" :key="card.label" class="card">
          <div class="card-value">{{ card.value }}</div>
          <div class="card-label">{{ card.label }}</div>
        </div>
      </div>
      <div class="section-title">{{ t('gnssRaw.frames.msgType') }}</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ t('gnssRaw.frames.msgType') }}</th>
              <th>{{ t('gnssRaw.frames.name') }}</th>
              <th class="num">{{ t('gnssRaw.frames.okCount') }}</th>
              <th class="num">{{ t('gnssRaw.frames.failCount') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in msgRows" :key="row.type">
              <td>{{ row.type }}</td>
              <td>{{ row.name }}</td>
              <td class="num">{{ row.ok }}</td>
              <td class="num" :class="{ bad: row.fail > 0 }">{{ row.fail }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <template v-if="station">
        <div class="section-title">{{ t('gnssRaw.frames.station') }}</div>
        <div class="station">
          <div>{{ t('gnssRaw.frames.stationPos') }}: {{ station.pos }}</div>
          <div>{{ t('gnssRaw.frames.stationHgt') }}: {{ station.hgt }}</div>
        </div>
      </template>
    </template>
    <div v-else class="state-row">
      <div class="empty">{{ t('gnssRaw.common.noData') }}</div>
      <div class="empty-sub">{{ t('gnssRaw.common.emptyHint') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { t } from '@/i18n'
import { useGnssRaw } from '@/composables/useGnssRaw'
import { msgTypeName } from '@/core/gnssraw/analysis'

const store = useGnssRaw()

const exporting = ref(false)

async function exportRnx(): Promise<void> {
  if (exporting.value) return
  exporting.value = true
  try {
    const files = await store.convertToRnx()
    for (const file of files) {
      const url = URL.createObjectURL(new Blob([new Uint8Array(file.data)], { type: 'text/plain' }))
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      link.click()
      URL.revokeObjectURL(url)
    }
    ElMessage({
      message: t('gnssRaw.frames.exportRnxDone', { count: files.length }),
      type: 'success',
      placement: 'bottom-right',
      offset: 50,
    })
  } catch (error) {
    ElMessage.error(
      `${t('gnssRaw.frames.exportRnxFailed')}: ${error instanceof Error ? error.message : String(error)}`,
    )
  } finally {
    exporting.value = false
  }
}

const stats = computed(() => store.dataset.value?.stats ?? store.liveStats.value)

function formatInt(value: number | undefined): string {
  return value === undefined ? '—' : value.toLocaleString()
}

const cards = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    { label: t('gnssRaw.frames.bytes'), value: formatInt(s.bytes) },
    { label: t('gnssRaw.frames.framesOk'), value: formatInt(s.framesOk) },
    { label: t('gnssRaw.frames.crcErr'), value: formatInt(s.framesCrcErr) },
    { label: t('gnssRaw.frames.decodeFail'), value: formatInt(s.decodeFail) },
    { label: t('gnssRaw.frames.epochs'), value: formatInt(s.epochs) },
    { label: t('gnssRaw.frames.ephEvents'), value: formatInt(s.ephEvents) },
    { label: t('gnssRaw.frames.staEvents'), value: formatInt(s.staEvents) },
    { label: t('gnssRaw.frames.nmeaLines'), value: formatInt(s.nmeaLines) },
  ]
})

const msgRows = computed(() => {
  const s = stats.value
  if (!s) return []
  const types = new Set<number>([
    ...Object.keys(s.msgOk).map(Number),
    ...Object.keys(s.msgFail).map(Number),
  ])
  return [...types]
    .map((type) => ({
      type,
      name: msgTypeName(type),
      ok: s.msgOk[type] ?? 0,
      fail: s.msgFail[type] ?? 0,
    }))
    .sort((a, b) => b.ok + b.fail - (a.ok + a.fail))
})

const station = computed(() => {
  const sta = store.dataset.value?.staEvents[0]
  if (!sta) return null
  return {
    pos: sta.pos.map((v) => v.toFixed(3)).join(', '),
    hgt: sta.hgt.toFixed(3),
  }
})
</script>

<style scoped>
.gnssraw-frames {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
  padding: 8px;
  font-size: 12px;
  color: var(--el-text-color-primary);
}
.state-row {
  padding: 12px;
  color: var(--el-text-color-secondary);
}
.state-row.error {
  color: var(--el-color-error);
}
.empty {
  font-size: 13px;
  margin-bottom: 4px;
}
.empty-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.source-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 4px 8px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}
.source-kind {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--el-color-primary);
}
.source-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.source-count {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}
.export-btn {
  margin-left: auto;
  flex-shrink: 0;
}
.card {
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 8px 10px;
}
.card-value {
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.card-label {
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.section-title {
  font-weight: 600;
  margin: 12px 0 6px;
}
.table-wrap {
  overflow: auto;
  max-height: 46%;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 4px 10px;
  text-align: left;
  border-bottom: 1px solid var(--el-border-color-lighter);
  white-space: nowrap;
}
th {
  position: sticky;
  top: 0;
  background: var(--el-fill-color-light);
  z-index: 1;
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.bad {
  color: var(--el-color-error);
  font-weight: 600;
}
.station {
  color: var(--el-text-color-secondary);
  line-height: 1.7;
  font-variant-numeric: tabular-nums;
}
</style>
