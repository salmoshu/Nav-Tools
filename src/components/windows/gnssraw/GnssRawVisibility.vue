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

// 分星座卫星数：折线形态对齐 GNSS 信号组件的 NSat 视图——每星座一条细线 + 总数粗线，
// 不用堆叠柱/面积，避免系列间互相遮挡。
const { chartRef, store } = useGnssRawChart(({ colors, dataset }) => {
  const times = relativeTimes(dataset.epochTimes)
  if (times.length === 0) return null
  const activeSys: number[] = []
  for (let sys = 1; sys < 8; sys++) {
    if (dataset.epochSysCounts.some((counts) => (counts[sys] ?? 0) > 0)) activeSys.push(sys)
  }
  const totals = dataset.epochSysCounts.map((counts) =>
    counts.reduce((sum, n) => sum + (n ?? 0), 0),
  )
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
    series: [
      ...activeSys.map((sys) => ({
        name: GNSS_SYS_NAME[sys],
        type: 'line' as const,
        color: GNSS_SYS_COLOR[sys],
        symbol: 'none',
        lineStyle: { width: 1.5 },
        emphasis: { focus: 'series' as const },
        data: times.map((time, i) => [time, dataset.epochSysCounts[i][sys] ?? 0]),
      })),
      {
        name: t('gnssRaw.visibility.total'),
        type: 'line' as const,
        color: colors.text,
        symbol: 'none',
        lineStyle: { width: 2 },
        emphasis: { focus: 'series' as const },
        data: times.map((time, i) => [time, totals[i]]),
      },
    ],
    dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }],
  }
})

/** 星座色加透明度（报告风格：浅色填充 + 深色描边） */
function hexAlpha(hex: string, alpha: number): string {
  const v = hex.replace('#', '')
  const n =
    v.length === 3
      ? v
          .split('')
          .map((c) => c + c)
          .join('')
      : v
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// sys 字段哨兵：观测历元刻度带行
const EPOCH_ROW = -1

// 逐星时间线（甘特）：报告风格——按星座分组（彩色组标题行）、浅色填充+深色描边圆角条、
// 行末段标注可见率、底部观测历元刻度带（连续段粗条、孤立历元 tick）。
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

  // 类目：星座组标题行 + 逐星行 + 末尾历元刻度行
  const categories: string[] = []
  const titleToSys = new Map<string, number>()
  const satRows: number[] = []
  let prevSys = -1
  for (const sat of sats) {
    if (sat.sys !== prevSys) {
      const title = GNSS_SYS_NAME[sat.sys] ?? `SYS${sat.sys}`
      titleToSys.set(title, sat.sys)
      categories.push(title)
      prevSys = sat.sys
    }
    satRows.push(categories.length)
    categories.push(satLabel(sat.sys, sat.prn, GNSS_SYS_NAME))
  }
  const epochRowLabel = t('gnssRaw.visibility.epochTicks')
  categories.push(epochRowLabel)
  const epochRowIndex = categories.length - 1

  // [行, 起点(相对秒), 终点(相对秒), 星座, 行末段(0/1), 可见率%]
  const segments: Array<[number, number, number, number, number, number]> = []
  sats.forEach((sat, index) => {
    const row = satRows[index]
    const presence = Math.round((sat.times.length / epochTimes.length) * 100)
    const rowSegments: Array<[number, number]> = []
    let segStart = sat.times[0]
    let prev = sat.times[0]
    for (let i = 1; i <= sat.times.length; i++) {
      const cur = i < sat.times.length ? sat.times[i] : Number.NaN
      if (!Number.isFinite(cur) || cur - prev > gapS) {
        rowSegments.push([segStart - t0, prev - t0])
        segStart = cur
      }
      prev = cur
    }
    rowSegments.forEach(([start, end], i) => {
      segments.push([row, start, end, sat.sys, i === rowSegments.length - 1 ? 1 : 0, presence])
    })
  })
  segments.push([epochRowIndex, 0, xMax, EPOCH_ROW, 0, 0])

  const relTimes = epochTimes.map((time) => time - t0)
  const maxVisible = 14
  const needSlider = categories.length > maxVisible

  // 组标题/历元行的 y 轴标签 rich 样式
  const labelRich: Record<string, Record<string, unknown>> = {
    epoch: { color: colors.textMuted, fontSize: 10 },
  }
  for (const sys of new Set(titleToSys.values())) {
    labelRich[`sys${sys}`] = {
      color: GNSS_SYS_COLOR[sys] ?? '#9ca3af',
      fontWeight: 600,
      fontSize: 11,
    }
  }

  return {
    backgroundColor: colors.background,
    textStyle: { color: colors.text },
    tooltip: {
      trigger: 'item',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text },
      formatter: (params: any) => {
        const v = params.value as [number, number, number, number, number, number]
        if (v[3] === EPOCH_ROW) {
          return `${epochRowLabel}: ${epochTimes.length}`
        }
        return (
          `${categories[v[0]]} · ${t('gnssRaw.visibility.presence')} ${v[5]}%<br/>` +
          `${formatTimeOfDay(t0 + v[1])} – ${formatTimeOfDay(t0 + v[2])}<br/>` +
          formatDuration(v[2] - v[1])
        )
      },
    },
    grid: { left: 68, right: 40, top: 6, bottom: 26 },
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
      axisLabel: {
        color: colors.textMuted,
        fontSize: 10,
        formatter: (value: string) => {
          const sys = titleToSys.get(value)
          if (sys !== undefined) return `{sys${sys}|${value}}`
          if (value === epochRowLabel) return `{epoch|${value}}`
          return value
        },
        rich: labelRich,
      },
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
          const row = api.value(0) as number
          const sys = api.value(3) as number
          const start = api.coord([api.value(1), row]) as [number, number]
          const end = api.coord([api.value(2), row]) as [number, number]
          const size = api.size([0, 1]) as [number, number]

          // 观测历元刻度带：连续段（间隔 ≤ 2×中位间隔）合并为粗条，孤立历元画 tick
          if (sys === EPOCH_ROW) {
            const children: any[] = []
            const y = start[1]
            const tickH = Math.min(size[1] * 0.5, 8)
            let segStartS: number | null = null
            for (let i = 0; i < relTimes.length; i++) {
              const cur = relTimes[i]
              const next = i + 1 < relTimes.length ? relTimes[i + 1] : Number.NaN
              if (segStartS === null) segStartS = cur
              if (!Number.isFinite(next) || next - cur > gapS) {
                const x1 = (api.coord([segStartS, row]) as [number, number])[0]
                if (cur > segStartS) {
                  const x2 = (api.coord([cur, row]) as [number, number])[0]
                  children.push({
                    type: 'rect',
                    shape: { x: x1, y: y - 1.5, width: Math.max(x2 - x1, 1.5), height: 3, r: 1 },
                    style: { fill: colors.text },
                  })
                } else {
                  children.push({
                    type: 'line',
                    shape: { x1, y1: y - tickH / 2, x2: x1, y2: y + tickH / 2 },
                    style: { stroke: colors.text, lineWidth: 1 },
                  })
                }
                segStartS = null
              }
            }
            return { type: 'group', children }
          }

          const color = GNSS_SYS_COLOR[sys] ?? '#9ca3af'
          const height = Math.min(size[1] * 0.62, 12)
          const children: any[] = [
            {
              type: 'rect',
              shape: {
                x: start[0],
                y: start[1] - height / 2,
                width: Math.max(end[0] - start[0], 2),
                height,
                r: 2,
              },
              style: { fill: hexAlpha(color, 0.35), stroke: color, lineWidth: 1 },
            },
          ]
          // 行末段标注可见率：条后有余量则外置，否则内置右对齐
          if (api.value(4) === 1) {
            const pct = `${api.value(5)}%`
            const gridRight = (api.coord([xMax, row]) as [number, number])[0]
            const estWidth = pct.length * 6 + 6
            const outside = end[0] + 4 + estWidth <= gridRight
            children.push({
              type: 'text',
              style: {
                text: pct,
                x: outside ? end[0] + 4 : end[0] - 3,
                y: start[1],
                align: outside ? 'left' : 'right',
                verticalAlign: 'middle',
                fontSize: 10,
                fill: colors.textMuted,
              },
            })
          }
          return { type: 'group', children }
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
