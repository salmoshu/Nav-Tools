<template>
  <div class="lidar-plot">
    <div class="plot-toolbar">
      <el-select v-model="preset" size="small" style="width: 180px" @change="rebuild">
        <el-option value="cmd" :label="t('lidar.plot.presetCmd')" />
        <el-option value="cmdVsOdom" :label="t('lidar.plot.presetCmdVsOdom')" />
        <el-option value="scores" :label="t('lidar.plot.presetScores')" />
        <el-option value="odom" :label="t('lidar.plot.presetOdom')" />
      </el-select>
      <el-button size="small" :disabled="!hasBlocked" @click="jumpBlocked(-1)">
        <el-icon><DArrowLeft /></el-icon>&nbsp;{{ t('lidar.plot.prevBlocked') }}
      </el-button>
      <el-button size="small" :disabled="!hasBlocked" @click="jumpBlocked(1)">
        {{ t('lidar.plot.nextBlocked') }}&nbsp;<el-icon><DArrowRight /></el-icon>
      </el-button>
      <span class="plot-hint" v-if="empty">{{ t('lidar.plot.empty') }}</span>
      <span class="plot-hint" v-else>{{ t('lidar.plot.clickToSeek') }}</span>
    </div>
    <div ref="chartRef" class="plot-chart"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { DArrowLeft, DArrowRight } from '@element-plus/icons-vue'
import { useTheme } from '@/composables/useTheme'
import { t } from '@/i18n'
import { useLidarPanelPresence, useMcapPlayer } from '@/composables/useMcapPlayer'

type PresetKey = 'cmd' | 'cmdVsOdom' | 'scores' | 'odom'

const player = useMcapPlayer()
useLidarPanelPresence()
const { chartTheme, resolvedTheme } = useTheme()

const chartRef = ref<HTMLDivElement>()
const preset = ref<PresetKey>('cmd')
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const empty = computed(() => {
  const series = player.series.value
  if (!series) return true
  if (preset.value === 'cmd') return series.cmd.t.length === 0
  if (preset.value === 'cmdVsOdom') return series.cmd.t.length === 0 && series.odom.t.length === 0
  if (preset.value === 'odom') return series.odom.t.length === 0
  return series.scores.t.length === 0
})

/** 是否存在受阻帧（success=false），供「上一/下一处受阻」按钮置灰 */
const hasBlocked = computed(() => {
  const success = player.series.value?.scores.success
  return success ? Array.from(success).some((value) => value === 0) : false
})

/** 跳转到播放头之后（或之前）最近的受阻帧；越过边界时环绕 */
function jumpBlocked(direction: 1 | -1): void {
  const doc = player.document.value
  const scores = player.series.value?.scores
  if (!doc || doc.startNs === undefined || !scores || scores.t.length === 0) return
  const base = doc.startNs
  const rel = player.playheadNs.value - base
  const blocked: number[] = []
  for (let i = 0; i < scores.t.length; i++) {
    if (scores.success[i] === 0) blocked.push(scores.t[i])
  }
  if (blocked.length === 0) return
  let target: number | undefined
  if (direction > 0) {
    target = blocked.find((time) => time > rel) ?? blocked[0]
  } else {
    for (let i = blocked.length - 1; i >= 0; i--) {
      if (blocked[i] < rel) {
        target = blocked[i]
        break
      }
    }
    target = target ?? blocked[blocked.length - 1]
  }
  player.seek(base + target)
}

/** 相对秒 → 图表 x 值；播放头 → 竖直游标。 */
const durationS = computed(() => {
  const doc = player.document.value
  return doc ? doc.durationNs / 1e9 : 0
})

const playheadS = computed(() => {
  const startNs = player.document.value?.startNs
  if (startNs === undefined) return 0
  return Math.min(durationS.value, Math.max(0, (player.playheadNs.value - startNs) / 1e9))
})

function toPairs(t: Float64Array, values: Float64Array): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < t.length; i++) {
    out.push([t[i] / 1e9, values[i]])
  }
  return out
}

interface SeriesSpec {
  name: string
  data: [number, number][]
  color: string
  yAxisIndex: number
}

function buildSeries(): SeriesSpec[] {
  const series = player.series.value
  if (!series) return []
  if (preset.value === 'cmd') {
    return [
      {
        name: 'cmd v (m/s)',
        data: toPairs(series.cmd.t, series.cmd.v),
        color: '#22d3ee',
        yAxisIndex: 0,
      },
      {
        name: 'cmd w (rad/s)',
        data: toPairs(series.cmd.t, series.cmd.w),
        color: '#f59e0b',
        yAxisIndex: 1,
      },
    ]
  }
  if (preset.value === 'odom') {
    return [
      {
        name: 'odom v (m/s)',
        data: toPairs(series.odom.t, series.odom.v),
        color: '#22d3ee',
        yAxisIndex: 0,
      },
      {
        name: 'odom w (rad/s)',
        data: toPairs(series.odom.t, series.odom.w),
        color: '#f59e0b',
        yAxisIndex: 1,
      },
    ]
  }
  if (preset.value === 'cmdVsOdom') {
    return [
      {
        name: 'cmd v (m/s)',
        data: toPairs(series.cmd.t, series.cmd.v),
        color: '#22d3ee',
        yAxisIndex: 0,
      },
      {
        name: 'odom v (m/s)',
        data: toPairs(series.odom.t, series.odom.v),
        color: '#34d399',
        yAxisIndex: 0,
      },
      {
        name: 'cmd w (rad/s)',
        data: toPairs(series.cmd.t, series.cmd.w),
        color: '#f59e0b',
        yAxisIndex: 1,
      },
      {
        name: 'odom w (rad/s)',
        data: toPairs(series.odom.t, series.odom.w),
        color: '#f472b6',
        yAxisIndex: 1,
      },
    ]
  }
  return [
    {
      name: 'best tot',
      data: toPairs(series.scores.t, series.scores.bestTot),
      color: '#22c55e',
      yAxisIndex: 0,
    },
    {
      name: 'plan ms',
      data: toPairs(series.scores.t, series.scores.planMs),
      color: '#a78bfa',
      yAxisIndex: 1,
    },
    {
      name: 'collision #',
      data: toPairs(series.scores.t, series.scores.collisionCount),
      color: '#ef4444',
      yAxisIndex: 1,
    },
  ]
}

/** success=false 的连续区段（相对秒），用于 markArea 红色底纹标出全灭区间 */
function blockedAreas(): [{ xAxis: number }, { xAxis: number }][] {
  const scores = player.series.value?.scores
  if (!scores || scores.t.length === 0) return []
  const areas: [{ xAxis: number }, { xAxis: number }][] = []
  let start: number | undefined
  for (let i = 0; i < scores.t.length; i++) {
    const blocked = scores.success[i] === 0
    if (blocked && start === undefined) start = scores.t[i] / 1e9
    if (!blocked && start !== undefined) {
      areas.push([{ xAxis: start }, { xAxis: scores.t[i] / 1e9 }])
      start = undefined
    }
  }
  if (start !== undefined) areas.push([{ xAxis: start }, { xAxis: durationS.value }])
  return areas
}

function rebuild(): void {
  if (!chart) return
  const colors = chartTheme.value
  const specs = buildSeries()
  const markLine = {
    symbol: 'none',
    silent: true,
    label: {
      show: true,
      position: 'insideEndTop' as const,
      formatter: ({ value }: { value: number }) => `${value.toFixed(2)} s`,
      color: '#fff',
      fontSize: 10,
      backgroundColor: '#f97316',
      borderRadius: 3,
      padding: [2, 5],
    },
    lineStyle: { color: '#f97316', type: 'solid' as const, width: 2 },
    data: [{ xAxis: playheadS.value }],
  }
  const markArea = {
    silent: true,
    itemStyle: { color: 'rgba(239, 68, 68, 0.12)' },
    data: blockedAreas(),
  }
  chart.setOption(
    {
      backgroundColor: colors.background,
      textStyle: { color: colors.text },
      animation: false,
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.surface,
        borderColor: colors.border,
        textStyle: { color: colors.text },
        valueFormatter: (value: unknown) =>
          typeof value === 'number' ? value.toFixed(3) : String(value),
      },
      legend: {
        top: 4,
        textStyle: { color: colors.text, fontSize: 11 },
      },
      grid: { left: 44, right: 44, top: 30, bottom: 42 },
      xAxis: {
        type: 'value',
        min: 0,
        max: Math.max(durationS.value, 0.1),
        name: 's',
        nameTextStyle: { color: colors.textMuted },
        axisLabel: { color: colors.textMuted, formatter: (value: number) => value.toFixed(1) },
        axisLine: { lineStyle: { color: colors.border } },
        splitLine: { lineStyle: { color: colors.grid } },
      },
      yAxis: [
        {
          type: 'value',
          axisLabel: { color: colors.textMuted, formatter: (value: number) => value.toFixed(2) },
          axisLine: { lineStyle: { color: colors.border } },
          splitLine: { lineStyle: { color: colors.grid } },
        },
        {
          type: 'value',
          axisLabel: { color: colors.textMuted, formatter: (value: number) => value.toFixed(2) },
          axisLine: { lineStyle: { color: colors.border } },
          splitLine: { show: false },
        },
      ],
      series: specs.map((spec, index) => ({
        name: spec.name,
        type: 'line',
        yAxisIndex: spec.yAxisIndex,
        data: spec.data,
        color: spec.color,
        showSymbol: false,
        lineWidth: 1.5,
        sampling: 'lttb',
        // 播放头游标与全灭区段底纹只挂在第一个系列上（同一 grid，竖线贯穿全图）
        markLine: index === 0 ? markLine : undefined,
        markArea: index === 0 ? markArea : undefined,
      })),
      dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }],
    },
    { notMerge: true },
  )
}

// 播放头游标：只更新第一个系列的 markLine，避免整图重建
watch(playheadS, (seconds) => {
  chart?.setOption({
    series: [{ markLine: { data: [{ xAxis: seconds }] } }],
  })
})

watch([() => player.series.value, preset], () => rebuild())
watch(resolvedTheme, () => rebuild())
watch(empty, () => rebuild())

onMounted(() => {
  if (!chartRef.value) return
  chart = echarts.init(chartRef.value)
  chart.getZr().on('click', (event) => {
    if (!chart) return
    // 只有绘图区内的点击才跳转播放头（legend/边框点击不跳）
    if (!chart.containPixel('grid', [event.offsetX, event.offsetY])) return
    const seconds = chart.convertFromPixel({ xAxisIndex: 0 }, event.offsetX)
    if (!Number.isFinite(seconds)) return
    const doc = player.document.value
    if (doc?.startNs !== undefined) {
      player.seek(doc.startNs + seconds * 1e9)
    }
  })
  rebuild()
  resizeObserver = new ResizeObserver(() => chart?.resize())
  if (chartRef.value) resizeObserver.observe(chartRef.value)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<style scoped>
.lidar-plot {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--app-surface);
  color: var(--app-text);
}

.plot-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface-muted);
}

.plot-hint {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.plot-chart {
  flex: 1;
  min-height: 200px;
}
</style>
