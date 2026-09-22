<template>
  <div class="gnssraw-snr">
    <div v-if="store.status.value === 'loading'" class="state-row">
      {{ t('gnssRaw.common.loading') }}…
    </div>
    <div v-else-if="store.status.value === 'error'" class="state-row error">
      {{ t('gnssRaw.common.loadError') }}: {{ store.errorText.value }}
    </div>
    <template v-else-if="store.dataset.value">
      <div ref="chartRef" class="chart"></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ t('gnssRaw.snr.band') }}</th>
              <th class="num">{{ t('gnssRaw.snr.samples') }}</th>
              <th class="num">{{ t('gnssRaw.snr.mean') }}</th>
              <th class="num">{{ t('gnssRaw.snr.range') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="band in bands" :key="`${band.sys}:${band.slot}`">
              <td>
                <span class="dot" :style="{ background: bandColor(band) }"></span>
                {{ bandLabel(band) }}
              </td>
              <td class="num">{{ band.samples.toLocaleString() }}</td>
              <td class="num" :class="{ bad: band.mean < 35 }">{{ band.mean.toFixed(1) }}</td>
              <td class="num">{{ band.min.toFixed(0) }}–{{ band.max.toFixed(0) }}</td>
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
import { useGnssRawChart } from './useGnssRawChart'
import { computeSnrStats, type SnrBand } from '@/core/gnssraw/analysis'
import { GNSS_SYS_NAME, GNSS_SYS_COLOR } from '@/core/gnssraw/types'

const SLOT_LIGHTEN = ['', '66', '99']

const { chartRef, store } = useGnssRawChart(({ colors, dataset }) => {
  const list = computeSnrStats(dataset)
  if (list.length === 0) return null
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
    grid: { left: 44, right: 12, top: 26, bottom: 24 },
    xAxis: {
      type: 'value',
      name: 'dBHz',
      nameLocation: 'middle',
      nameGap: 18,
      nameTextStyle: { color: colors.textMuted, fontSize: 10 },
      min: (value: { min: number }) => Math.floor(value.min - 1),
      max: (value: { max: number }) => Math.ceil(value.max + 1),
      axisLabel: { color: colors.textMuted },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: t('gnssRaw.snr.histogram'),
      nameTextStyle: { color: colors.textMuted, fontSize: 10 },
      axisLabel: { color: colors.textMuted },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { lineStyle: { color: colors.grid } },
    },
    series: list.map((band) => ({
      name: bandLabel(band),
      type: 'line' as const,
      color: bandColor(band),
      showSymbol: false,
      step: 'middle' as const,
      lineWidth: 1.6,
      areaStyle: { opacity: 0.12 },
      data: band.histogram.map((bin) => [bin.binStart + 0.5, bin.count]),
    })),
  }
})

const bands = computed(() => (store.dataset.value ? computeSnrStats(store.dataset.value) : []))

function bandLabel(band: SnrBand): string {
  return `${GNSS_SYS_NAME[band.sys]} L${band.slot + 1}`
}

/** 星座色 + 槽位透明度后缀区分同星座不同频点 */
function bandColor(band: SnrBand): string {
  const base = GNSS_SYS_COLOR[band.sys] ?? '#9ca3af'
  return band.slot === 0 ? base : `${base}${SLOT_LIGHTEN[Math.min(band.slot, 2)]}`
}
</script>

<style scoped>
.gnssraw-snr {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 8px;
  font-size: 12px;
  color: var(--el-text-color-primary);
}
.chart {
  flex: 0 0 50%;
  min-height: 140px;
}
.table-wrap {
  flex: 1;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  margin-top: 6px;
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
  color: var(--el-color-warning);
  font-weight: 600;
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
