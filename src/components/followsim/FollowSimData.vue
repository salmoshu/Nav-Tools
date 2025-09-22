<template>
  <div class="data-container">
    <div class="controls">
      <div class="time-range-buttons">
        <button 
          v-for="range in timeRanges" 
          :key="range.value"
          :class="{ active: currentTimeRange === range.value }"
          @click="setTimeRange(range.value as '10s' | '30s' | '1m' | '5m' | 'all')"
        >
          {{ range.label }}
        </button>
      </div>
    </div>
    <!-- 使用从useEcharts返回的chartRef -->
    <div ref="chartRef" class="chart-container"></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useEcharts } from '@/composables/followsim/useEcharts'
import { useFollowStore } from '@/stores/followsim'
import { useSpeedRecorder } from '@/composables/followsim/useSpeedRecorder'

// 初始化存储和图表
const { checkMotionStatus, chartData, setTimeRange, currentTimeRange } = useSpeedRecorder()
const store = useFollowStore()

// 时间范围选项
const timeRanges = [
  { value: '10s', label: '10秒' },
  { value: '30s', label: '30秒' },
  { value: '1m', label: '1分钟' },
  { value: '5m', label: '5分钟' },
  { value: 'all', label: '全部' }
]

// 使用useEcharts钩子创建图表，并获取返回的chartRef
const { chartRef, updateChart } = useEcharts(
  () => {
    const data = chartData.value
    return {
      time: data.timeLabels,
      linearSpeed: data.linearSpeed,
      angularSpeed: data.angularSpeed
    }
  },
  {
    type: 'line',
    title: '速度变化曲线'
  }
)

// 监听数据变化更新图表
watch(chartData, () => {
  updateChart()
}, { immediate: true }) // 添加immediate确保初始数据也能触发更新

// 监听模拟状态和运动状态
watch(
  [() => store.status.isRunning, () => store.car.linearSpeed, () => store.car.angularSpeed],
  () => {
    checkMotionStatus()
  },
  { immediate: true }
)

// 组件挂载时初始化
onMounted(() => {
  checkMotionStatus()
  // 强制触发一次更新
  setTimeout(() => {
    updateChart()
  }, 100)
})

// 组件卸载时清理
onUnmounted(() => {
  // 清理逻辑已在useSpeedRecorder中实现
})
</script>

<style scoped>
.data-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  height: 50px;
  box-sizing: border-box;
}

.time-range-buttons {
  display: flex;
  gap: 5px;
}

.time-range-buttons button {
  padding: 4px 8px;
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.time-range-buttons button.active {
  background: #409EFF;
  color: white;
  border-color: #409EFF;
}

.chart-container {
  flex: 1;
  min-height: 200px;
  /* 确保容器有明确的尺寸 */
  width: 100%;
  height: 400px;
}
</style>
