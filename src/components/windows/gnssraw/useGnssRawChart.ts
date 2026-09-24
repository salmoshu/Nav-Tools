// GNSS-Raw 面板共享的 echarts 生命周期：初始化、数据集/主题变更重建、
// 缩放跟随、卸载销毁。面板只需提供 option 构建函数。
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { useTheme } from '@/composables/useTheme'
import { useGnssRaw } from '@/composables/useGnssRaw'
import type { GnssRawDataset } from '@/core/gnssraw/types'

export interface ChartColors {
  background: string
  surface: string
  surfaceMuted: string
  text: string
  textMuted: string
  grid: string
  border: string
}

export interface GnssRawChartContext {
  colors: ChartColors
  dataset: GnssRawDataset
}

export function useGnssRawChart(
  build: (context: GnssRawChartContext) => echarts.EChartsOption | null,
) {
  const chartRef = ref<HTMLDivElement>()
  const store = useGnssRaw()
  const { chartTheme, resolvedTheme } = useTheme()
  let chart: echarts.ECharts | null = null
  let resizeObserver: ResizeObserver | null = null

  async function rebuild(): Promise<void> {
    // 等 DOM 更新：chart 容器在 v-else-if="dataset" 分支内，
    // 面板先于数据挂载时 chartRef 尚不存在，需惰性初始化。
    await nextTick()
    if (!chartRef.value) {
      resizeObserver?.disconnect()
      resizeObserver = null
      chart?.dispose()
      chart = null
      return
    }
    if (!chart) {
      chart = echarts.init(chartRef.value)
      resizeObserver = new ResizeObserver(() => chart?.resize())
      resizeObserver.observe(chartRef.value)
    }
    const dataset = store.dataset.value
    const option = dataset ? build({ colors: chartTheme.value, dataset }) : null
    chart.clear()
    if (option) {
      chart.setOption({ animation: false, ...option }, { notMerge: true })
    }
  }

  onMounted(() => {
    void rebuild()
  })

  onUnmounted(() => {
    resizeObserver?.disconnect()
    chart?.dispose()
    chart = null
  })

  watch([() => store.dataset.value, resolvedTheme], rebuild)

  return { chartRef, store, rebuild }
}

/** 星座+PRN 显示名（如 GPS G05） */
export function satLabel(sys: number, prn: number, sysNames: readonly string[]): string {
  const name = sysNames[sys] ?? '?'
  return `${name} ${String(prn).padStart(2, '0')}`
}

/** 相对时间轴（秒，相对首历元） */
export function relativeTimes(times: readonly number[]): number[] {
  if (times.length === 0) return []
  const t0 = times[0]
  return times.map((t) => t - t0)
}

/** unix 秒 -> HH:MM:SS（UTC） */
export function formatTimeOfDay(unixS: number): string {
  if (!Number.isFinite(unixS) || unixS <= 0) return '—'
  const d = new Date(unixS * 1000)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

/** 时长人性化（s -> 12m30s / 1.5h） */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 s'
  if (seconds < 60) return `${seconds.toFixed(0)} s`
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60)
    const s = Math.round(seconds % 60)
    return s > 0 ? `${m}m${s}s` : `${m} min`
  }
  return `${(seconds / 3600).toFixed(1)} h`
}
