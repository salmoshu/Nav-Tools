// src/composables/follow/useSpeedRecorder.ts
import { ref, computed, onUnmounted } from 'vue'
import { useFollowStore } from '@/stores/followsim'

// 定义数据点接口
interface SpeedDataPoint {
  time: number
  linearSpeed: number
  angularSpeed: number
}

export function useSpeedRecorder() {
  const store = useFollowStore()
  const data = ref<SpeedDataPoint[]>([])
  const maxDuration = 10 * 60 * 30 // 10分钟 @ 30fps
  const recordingInterval = ref<number | null>(null)
  const isRecording = ref(false)
  const currentTimeRange = ref<'10s' | '30s' | '1m' | '5m' | 'all'>('30s')

  // 开始记录数据
  const startRecording = () => {
    if (isRecording.value) return
    isRecording.value = true

    recordingInterval.value = window.setInterval(() => {
      const now = Date.now()
      const newDataPoint: SpeedDataPoint = {
        time: now,
        linearSpeed: Math.abs(store.car.linearSpeed),
        angularSpeed: Math.abs(store.car.angularSpeed)
      }

      // 添加新数据点
      data.value.push(newDataPoint)

      // 超出最大数据量时移除最旧的数据
      if (data.value.length > maxDuration) {
        data.value.shift()
      }
    }, 1000 / 30) // 30fps
  }

  // 停止记录数据
  const stopRecording = () => {
    if (!isRecording.value) return
    isRecording.value = false
    if (recordingInterval.value) {
      clearInterval(recordingInterval.value)
      recordingInterval.value = null
    }
  }

  // 根据当前时间范围过滤数据
  const filteredData = computed(() => {
    const now = Date.now()
    let timeRangeMs = 0

    switch (currentTimeRange.value) {
      case '10s':
        timeRangeMs = 10 * 1000
        break
      case '30s':
        timeRangeMs = 30 * 1000
        break
      case '1m':
        timeRangeMs = 60 * 1000
        break
      case '5m':
        timeRangeMs = 5 * 60 * 1000
        break
      case 'all':
        return data.value
    }

    return data.value.filter(point => now - point.time <= timeRangeMs)
  })

  // 格式化数据用于图表显示
  const chartData = computed(() => {
    const filtered = filteredData.value
    if (filtered.length === 0) {
      return { timeLabels: [], linearSpeed: [], angularSpeed: [] }
    }

    // 将时间戳转换为相对时间标签
    const firstTime = filtered[0].time
    const timeLabels = filtered.map(point => {
      const seconds = Math.round((point.time - firstTime) / 1000)
      return `${seconds}s`
    })

    return {
      timeLabels,
      linearSpeed: filtered.map(point => point.linearSpeed),
      angularSpeed: filtered.map(point => point.angularSpeed)
    }
  })

  // 检测运动是否停止
  const isMotionStopped = computed(() => {
    return (
      Math.abs(store.car.linearSpeed) < 0.1 && 
      Math.abs(store.car.angularSpeed) < 0.01
    )
  })

  // 监听运动状态，自动开始/停止记录
  const checkMotionStatus = () => {
    if (store.status.isRunning) {
      if (isMotionStopped.value) {
        stopRecording()
      } else {
        startRecording()
      }
    } else {
      stopRecording()
    }
  }

  // 组件卸载时清理
  onUnmounted(() => {
    stopRecording()
  })

  return {
    data,
    startRecording,
    stopRecording,
    currentTimeRange,
    setTimeRange: (range: '10s' | '30s' | '1m' | '5m' | 'all') => {
      currentTimeRange.value = range
    },
    chartData,
    checkMotionStatus
  }
}