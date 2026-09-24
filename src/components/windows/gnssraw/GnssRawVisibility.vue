<template>
  <div class="gnssraw-visibility">
    <div v-if="store.status.value === 'loading'" class="state-row">
      {{ t('gnssRaw.common.loading') }}…
    </div>
    <div v-else-if="store.status.value === 'error'" class="state-row error">
      {{ t('gnssRaw.common.loadError') }}: {{ store.errorText.value }}
    </div>
    <template v-else-if="store.dataset.value">
      <div class="section-title first">{{ t('gnssRaw.visibility.timeline') }}</div>
      <div ref="chartRef" class="chart count-chart"></div>
      <div class="section-title">{{ t('gnssRaw.visibility.perSatTimeline') }}</div>
      <div ref="timelineChartRef" class="chart timeline-chart"></div>
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
import { computeSampling, computeVisibility } from '@/core/gnssraw/analysis'
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

// 逐星时间线（甘特）：每颗星一行，连续覆盖压缩为横条，间断 > 2×中位间隔即分段
const { chartRef: timelineChartRef } = useGnssRawChart(({ colors, dataset }) => {
  const epochTimes = dataset.epochTimes
  if (epochTimes.length === 0) return null
  const t0 = epochTimes[0]
  const xMax = epochTimes[epochTimes.length - 1] - t0
  const gapS = Math.max(computeSampling(epochTimes).medianIntervalS * 2, 1)
  const sats = Object.values(dataset.sats)
    .filter((sat) => sat.times.length > 0)
    .sort((a, b) => a.sys - b.sys || a.prn - b.prn)
  if (sats.length === 0) return null
  const categories = sats.map((sat) => satLabel(sat.sys, sat.prn, GNSS_SYS_NAME))
  // [类目索引, 起点(相对秒), 终点(相对秒), 星座]
  const segments: Array<[number, number, number, number]> = []
  sats.forEach((sat, index) => {
    let segStart = sat.times[0]
    let prev = sat.times[0]
    for (let i = 1; i <= sat.times.length; i++) {
      const cur = i < sat.times.length ? sat.times[i] : Number.NaN
      if (!Number.isFinite(cur) || cur - prev > gapS) {
        segments.push([index, segStart - t0, prev - t0, sat.sys])
        segStart = cur
      }
      prev = cur
    }
  })
  const maxVisible = 12
  const needSlider = categories.length > maxVisible
  return {
    backgroundColor: colors.background,
    textStyle: { color: colors.text },
    tooltip: {
      trigger: 'item',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text },
      formatter: (params: any) => {
        const v = params.value as [number, number, number, number]
        return (
          `${categories[v[0]]}<br/>` +
          `${formatTimeOfDay(t0 + v[1])} – ${formatTimeOfDay(t0 + v[2])}<br/>` +
          formatDuration(v[2] - v[1])
        )
      },
    },
    grid: { left: 62, right: needSlider ? 20 : 12, top: 6, bottom: 26 },
    xAxis: {
      type: 'value',
      min: 0,
      max: xMax,
      name: t('gnssRaw.common.relativeTime'),
      nameLocation: 'middle',
      nameGap: 16,
      nameTextStyle: { color: colors.textMuted, fontSize: 10 },
      axisLabel: { color: colors.textMuted, fontSize: 10, hideOverlap: true },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'category',
      data: categories,
      inverse: true,
      axisLabel: { color: colors.textMuted, fontSize: 10 },
      axisLine: { lineStyle: { color: colors.border } },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'custom',
        // encode 让 y 轴 dataZoom 能过滤窗口外的数据点
        encode: { x: [1, 2], y: 0 },
        clip: true,
        renderItem: (_params: unknown, api: any) => {
          const categoryIndex = api.value(0) as number
          const start = api.coord([api.value(1), categoryIndex]) as [number, number]
          const end = api.coord([api.value(2), categoryIndex]) as [number, number]
          const size = api.size([0, 1]) as [number, number]
          const height = Math.min(size[1] * 0.6, 14)
          return {
            type: 'rect',
            shape: {
              x: start[0],
              y: start[1] - height / 2,
              width: Math.max(end[0] - start[0], 2),
              height,
              r: 1,
            },
            style: { fill: GNSS_SYS_COLOR[Number(api.value(3))] ?? '#9ca3af' },
          }
        },
        data: segments,
      },
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
      ...(needSlider
        ? [
            {
              type: 'slider',
              yAxisIndex: 0,
              width: 10,
              right: 2,
              top: 4,
              bottom: 20,
              startValue: 0,
              endValue: maxVisible - 1,
              showDetail: false,
              brushSelect: false,
              borderColor: colors.border,
              fillerColor: colors.surfaceMuted,
              handleStyle: { color: colors.surfaceMuted },
            } as const,
          ]
        : []),
    ],
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
  min-height: 100px;
}
.count-chart {
  flex: 0 0 28%;
}
.timeline-chart {
  flex: 0 0 36%;
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
.section-title.first {
  margin-top: 0;
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
