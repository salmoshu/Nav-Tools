<template>
  <div class="gnssraw-prnoise">
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
              <th>{{ t('gnssRaw.prnoise.band') }}</th>
              <th class="num">{{ t('gnssRaw.prnoise.samples') }}</th>
              <th class="num">{{ t('gnssRaw.prnoise.median') }}</th>
              <th class="num">{{ t('gnssRaw.prnoise.rms') }}</th>
              <th class="num">{{ t('gnssRaw.prnoise.p95') }}</th>
              <th class="num">{{ t('gnssRaw.prnoise.outliers') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="band in bands" :key="`${band.sys}:${band.slot}`">
              <td>
                <span class="dot" :style="{ background: GNSS_SYS_COLOR[band.sys] }"></span>
                {{ bandLabel(band) }}
              </td>
              <td class="num">{{ band.samples.toLocaleString() }}</td>
              <td class="num">{{ band.medianM.toFixed(3) }}</td>
              <td class="num">{{ band.rmsM.toFixed(3) }}</td>
              <td class="num">{{ band.p95M.toFixed(3) }}</td>
              <td class="num" :class="{ bad: band.outlierRatio > 0.05 }">
                {{ (band.outlierRatio * 100).toFixed(1) }}%
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
import { useGnssRawChart } from './useGnssRawChart'
import { computePseudorangeNoise, type FreqBandNoise } from '@/core/gnssraw/analysis'
import { GNSS_SYS_NAME, GNSS_SYS_COLOR } from '@/core/gnssraw/types'

const { chartRef, store } = useGnssRawChart(({ colors, dataset }) => {
  const list = computePseudorangeNoise(dataset)
  if (list.length === 0) return null
  const categories = list.map(bandLabel)
  const metrics: { name: string; pick: (b: FreqBandNoise) => number }[] = [
    { name: t('gnssRaw.prnoise.median'), pick: (b) => b.medianM },
    { name: t('gnssRaw.prnoise.rms'), pick: (b) => b.rmsM },
    { name: t('gnssRaw.prnoise.p95'), pick: (b) => b.p95M },
  ]
  return {
    backgroundColor: colors.background,
    textStyle: { color: colors.text },
    tooltip: {
      trigger: 'axis',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text },
      valueFormatter: (value: unknown) =>
        typeof value === 'number' ? `${value.toFixed(3)} m` : String(value),
    },
    legend: { top: 2, textStyle: { color: colors.text, fontSize: 11 } },
    grid: { left: 44, right: 12, top: 26, bottom: 22 },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: { color: colors.textMuted, interval: 0, rotate: categories.length > 5 ? 24 : 0 },
      axisLine: { lineStyle: { color: colors.border } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: colors.textMuted },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { lineStyle: { color: colors.grid } },
    },
    series: metrics.map((metric, i) => ({
      name: metric.name,
      type: 'bar' as const,
      color: ['#3b82f6', '#f59e0b', '#ef4444'][i],
      barMaxWidth: 22,
      data: list.map((band) => Number(metric.pick(band).toFixed(4))),
    })),
  }
})

const bands = computed(() =>
  store.dataset.value ? computePseudorangeNoise(store.dataset.value) : [],
)

function bandLabel(band: FreqBandNoise): string {
  return `${GNSS_SYS_NAME[band.sys]} L${band.slot + 1}`
}
</script>

<style scoped>
.gnssraw-prnoise {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 8px;
  font-size: 12px;
  color: var(--el-text-color-primary);
}
.chart {
  flex: 0 0 46%;
  min-height: 130px;
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
  color: var(--el-color-error);
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
