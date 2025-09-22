<!-- src/components/demo1/Demo1Draw.vue (最终版) -->
<template>
  <div class="chart-container">
    <div ref="chartRef" class="chart-wrapper"></div>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useEcharts } from '@/composables/demo1/useEcharts'
import { useDemo1Store } from '@/stores/demo1'

const demo1Store = useDemo1Store()

// 使用最终版hook
const { chartRef, updateChart } = useEcharts(
  () => demo1Store.config,
  {
    type: 'bar',
    title: '数据统计（来自Config）',
    colors: ['#409EFF', '#67C23A', '#E6A23C']
  }
)

// 简单监听配置变化
watch(
  () => demo1Store.config,
  () => updateChart(),
  { deep: true }
)
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: 100%;
  padding: 10px;
  box-sizing: border-box;
}

.chart-wrapper {
  width: 100%;
  height: 100%;
  min-height: 200px;
}
</style>