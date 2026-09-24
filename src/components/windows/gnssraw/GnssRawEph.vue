<template>
  <div class="gnssraw-eph">
    <GnssRawLoading v-if="store.status.value === 'loading'" />
    <div v-else-if="store.status.value === 'error'" class="state-row error">
      {{ t('gnssRaw.common.loadError') }}: {{ store.errorText.value }}
    </div>
    <template v-else-if="analysis">
      <div class="cards">
        <div class="card">
          <div class="card-value">{{ analysis.totalEvents }}</div>
          <div class="card-label">{{ t('gnssRaw.eph.totalEvents') }}</div>
        </div>
        <div class="card" :class="{ warn: analysis.iodeFlapTotal > 0 }">
          <div class="card-value">{{ analysis.iodeFlapTotal }}</div>
          <div class="card-label">{{ t('gnssRaw.eph.iodeFlaps') }}</div>
        </div>
        <div class="card" :class="{ warn: analysis.expiredCount > 0 }">
          <div class="card-value">{{ analysis.expiredCount }}</div>
          <div class="card-label">{{ t('gnssRaw.eph.expired') }}</div>
        </div>
        <div class="card" :class="{ warn: decodeFailTotal > 0 }">
          <div class="card-value">{{ decodeFailTotal }}</div>
          <div class="card-label">{{ t('gnssRaw.eph.decodeFail') }}</div>
        </div>
      </div>
      <div v-if="healthy" class="healthy">{{ t('gnssRaw.eph.healthy') }}</div>
      <div class="section-title">{{ t('gnssRaw.eph.perSat') }}</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th class="num">{{ t('gnssRaw.eph.events') }}</th>
              <th class="num">{{ t('gnssRaw.eph.iodeChanges') }}</th>
              <th class="num">{{ t('gnssRaw.eph.flaps') }}</th>
              <th>{{ t('gnssRaw.eph.lastToe') }}</th>
              <th class="num">{{ t('gnssRaw.eph.age') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="sat in analysis.perSat"
              :key="`${sat.sys}:${sat.prn}`"
              :class="{ 'row-bad': sat.expired || sat.iodeFlaps > 0 }"
            >
              <td>
                <span class="dot" :style="{ background: GNSS_SYS_COLOR[sat.sys] }"></span>
                {{ satLabel(sat.sys, sat.prn, GNSS_SYS_NAME) }}
              </td>
              <td class="num">{{ sat.events }}</td>
              <td class="num">{{ sat.iodeChanges }}</td>
              <td class="num" :class="{ bad: sat.iodeFlaps > 0 }">{{ sat.iodeFlaps }}</td>
              <td class="num">{{ formatTimeOfDay(sat.lastToeS) }}</td>
              <td class="num" :class="{ bad: sat.expired }">
                {{ formatDuration(sat.ageS) }}{{ sat.expired ? ' ⚠' : '' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <template v-if="failRows.length > 0">
        <div class="section-title">{{ t('gnssRaw.eph.failByType') }}</div>
        <div class="table-wrap small">
          <table>
            <tbody>
              <tr v-for="row in failRows" :key="row.type">
                <td>{{ row.type }}</td>
                <td>{{ row.name }}</td>
                <td class="num bad">{{ row.count }}</td>
              </tr>
            </tbody>
          </table>
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
import { computed } from 'vue'
import { t } from '@/i18n'
import { useGnssRaw } from '@/composables/useGnssRaw'
import GnssRawLoading from './GnssRawLoading.vue'
import { satLabel, formatTimeOfDay, formatDuration } from './useGnssRawChart'
import { analyzeEphemeris, msgTypeName } from '@/core/gnssraw/analysis'
import { GNSS_SYS_NAME, GNSS_SYS_COLOR } from '@/core/gnssraw/types'

const store = useGnssRaw()

const analysis = computed(() =>
  store.dataset.value ? analyzeEphemeris(store.dataset.value) : null,
)

const decodeFailTotal = computed(() => {
  const map = analysis.value?.decodeFailByType ?? {}
  return Object.values(map).reduce((acc, count) => acc + count, 0)
})

const failRows = computed(() => {
  const map = analysis.value?.decodeFailByType ?? {}
  return Object.entries(map)
    .map(([type, count]) => ({ type: Number(type), name: msgTypeName(Number(type)), count }))
    .sort((a, b) => b.count - a.count)
})

const healthy = computed(() => {
  const a = analysis.value
  return a !== null && a.iodeFlapTotal === 0 && a.expiredCount === 0 && decodeFailTotal.value === 0
})
</script>

<style scoped>
.gnssraw-eph {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
  padding: 8px;
  font-size: 12px;
  color: var(--el-text-color-primary);
}
.cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.card {
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 8px 10px;
}
.card.warn .card-value {
  color: var(--el-color-error);
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
.healthy {
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--el-color-success-light-9);
  color: var(--el-color-success-dark-2);
}
.section-title {
  font-weight: 600;
  margin: 12px 0 6px;
}
.table-wrap {
  overflow: auto;
  max-height: 44%;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
.table-wrap.small {
  max-height: 24%;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 3px 10px;
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
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 5px;
}
.bad {
  color: var(--el-color-error);
  font-weight: 600;
}
.row-bad {
  background: var(--el-color-error-light-9);
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
</style>
