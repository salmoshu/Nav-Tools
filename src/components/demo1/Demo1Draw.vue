<template>
  <div>
    <div ref="chartRef" style="width: 100%; height: 200px;"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useDemo1Store } from '@/stores/demo1'

const chartRef = ref<HTMLDivElement>()
const demo1Store = useDemo1Store()

let chart: echarts.ECharts | null = null

function updateChart() {
  if (!chart) return
  chart.setOption({
    title: { text: 'Sales Statistics (from Config)' },
    tooltip: {},
    xAxis: { type: 'category', data: Object.keys(demo1Store.config) },
    yAxis: { type: 'value' },
    series: [
      {
        name: 'Sales',
        type: 'bar',
        data: Object.values(demo1Store.config),
        itemStyle: { color: '#409EFF' }
      }
    ]
  })
}

onMounted(() => {
  chart = echarts.init(chartRef.value!)
  updateChart()
  window.addEventListener('resize', () => chart?.resize())
})

// 关键：监听 Pinia 的响应式对象
watch(
  () => demo1Store.config,
  () => nextTick(updateChart),
  { deep: true }
)
</script>
