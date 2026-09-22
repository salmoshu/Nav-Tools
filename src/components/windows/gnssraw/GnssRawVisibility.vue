<template>
  <div class="gnssraw-visibility">
    <div v-if="store.status.value === 'loading'" class="state-row">
      {{ t('gnssRaw.common.loading') }}…
    </div>
    <div v-else-if="store.status.value === 'error'" class="state-row error">
      {{ t('gnssRaw.common.loadError') }}: {{ store.errorText.value }}
    </div>
    <template v-else-if="store.dataset.value">
      <div ref="chartRef" class="chart"></div>
      <div class="sampling" v-if="summary">
        <span>{{ t('gnssRaw.visibility.epochCount') }}: {{ summary.sampling.epochCount }}</span>
        <span>{{ t('gnssRaw.visibility.span') }}: {{ formatDuration(summary.sampling.spanS) }}</span>
        <span>
          {{ t('gnssRaw.visibility.medianInterval') }}:
          {{ summary.sampling.medianIntervalS.toFixed(2) }} s
        </span>
        <span :class="{ bad: summary.sampling.completeness < 0.9 }">
          {{ t('gnssRaw.visibility.completeness') }}:
          {{ (summary.sampling.completeness * 100).toFixed(1) }}%
        </span>
      </div>
      <div class="section-title">{{ t('gnssRaw.visibility.perSat') }}</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th class="num">{{ t('gnssRaw.visibility.epochs') }}</th>
              <th>{{ t('gnssRaw.visibility.firstLast') }}</th>
              <th class="num">{{ t('gnssRaw.visibility.presence') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="sat in summary?.perSat ?? []" :key="`${sat.sys}:${sat.prn}`">
              <td>
                <span class="dot" :style="{ background: sysColor(sat.sys) }"></span>
                {{ satLabel(sat.sys, sat.prn, GNSS_SYS_NAME) }}
              </td>
              <td class="num">{{ sat.epochs }}</td>
              <td class="num">{{ formatTimeOfDay(sat.firstS) }}–{{ formatTimeOfDay(sat.lastS) }}</td>
              <td class="num" :class="{ bad: sat.presenceRatio < 0.5 }">
                {{ (sat.presenceRatio * 100).toFixed(0) }}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>
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
import {
  useGnssRawChart,
  satLabel,
  relativeTimes,
  formatTimeOfDay,
  formatDuration,
} from './useGnssRawChart'
import { computeVisibility } from '@/core/gnssraw/analysis'
import { GNSS_SYS_NAME, GNSS_SYS_COLOR } from '@/core/gnssraw/types'

const { chartRef, store } = useGnssRawChart(({ colors, dataset }) => {
  const times = relativeTimes(dataset.epochTimes)
  if (times.length === 0) return null
  const activeSys: number[] = []
  for (let sys = 1; sys < 8; sys++) {
    if (dataset.epochSysCounts.some((counts) => (counts[sys] ?? 0) > 0)) activeSys.push(sys)
  }
  return {
    backgroundColor: colors.background,
    textStyle: { color: colors.text },
    tooltip: {
      trigger: 'axis',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text },
    },
    legend: { top: 2, textStyle: { color: colors.text, fontSize: 11 } },
    grid: { left: 36, right: 12, top: 26, bottom: 22 },
    xAxis: {
      type: 'value',
      min: 0,
      max: times[times.length - 1],
      name: t('gnssRaw.common.relativeTime'),
      nameLocation: 'middle',
      nameGap: 18,
      nameTextStyle: { color: colors.textMuted, fontSize: 10 },
      axisLabel: { color: colors.textMuted },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      name: t('gnssRaw.common.satCount'),
      nameTextStyle: { color: colors.textMuted, fontSize: 10 },
      axisLabel: { color: colors.textMuted },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { lineStyle: { color: colors.grid } },
    },
    series: activeSys.map((sys) => ({
      name: GNSS_SYS_NAME[sys],
      type: 'bar' as const,
      stack: 'sats',
      color: GNSS_SYS_COLOR[sys],
      barMaxWidth: 6,
      data: times.map((time, i) => [time, dataset.epochSysCounts[i][sys] ?? 0]),
    })),
    dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }],
  }
})

const summary = computed(() =>
  store.dataset.value ? computeVisibility(store.dataset.value) : null,
)

function sysColor(sys: number): string {
  return GNSS_SYS_COLOR[sys] ?? '#9ca3af'
}
</script>

<style scoped>
.gnssraw-visibility {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 8px;
  font-size: 12px;
  color: var(--el-text-color-primary);
}
.chart {
  flex: 0 0 42%;
  min-height: 120px;
}
.sampling {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  padding: 6px 2px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.sampling .bad,
.bad {
  color: var(--el-color-error);
  font-weight: 600;
}
.section-title {
  font-weight: 600;
  margin: 6px 0 4px;
}
.table-wrap {
  flex: 1;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
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
