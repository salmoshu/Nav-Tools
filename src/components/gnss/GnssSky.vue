<template>
  <div class="gnss-sky-container">
    <div class="control-panel">
      <h3>卫星天空视图</h3>
      <div class="buttons">
        <button @click="refreshData" :disabled="isRefreshing">刷新数据</button>
        <button @click="clearData">清除数据</button>
        <label>
          <input type="checkbox" v-model="autoRefresh" @change="toggleAutoRefresh"> 自动刷新
        </label>
        <select v-model="constellationFilter" @change="updateChart">
          <option value="all">所有星座</option>
          <option value="GPS">GPS</option>
          <option value="GLONASS">GLONASS</option>
          <option value="GALILEO">GALILEO</option>
          <option value="BEIDOU">BeiDou</option>
          <option value="QZSS">QZSS</option>
        </select>
      </div>
    </div>
    <div class="sky-chart" ref="chartRef"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import { useNmea } from '@/composables/gnss/useNmea'
import { useDebounceFn } from '@vueuse/core'

// 获取卫星数据
const { satelliteSnrData, clearData: clearNmeaData } = useNmea()

// 组件状态
const chartRef = ref(null)
const chartInstance = ref(null)
const isRefreshing = ref(false)
const autoRefresh = ref(true)
const refreshInterval = ref(null)
const constellationFilter = ref('all')

// 星座颜色映射
const constellationColors = {
  GPS: '#1E88E5',
  GLONASS: '#43A047',
  GALILEO: '#FB8C00',
  BEIDOU: '#E53935',
  QZSS: '#8E24AA',
  UNKNOWN: '#757575'
}

// 防抖处理刷新函数
const debouncedUpdateChart = useDebounceFn(updateChart, 500)

// 初始化图表
function initChart() {
  if (chartRef.value && !chartInstance.value) {
    chartInstance.value = echarts.init(chartRef.value)

    // 设置图表选项
    const option = {
      tooltip: {
        trigger: 'item',
        formatter: function(params) {
          const data = params.data
          return `
            <div style="font-size: 14px;">卫星信息</div>
            <div>PRN: ${data.prn}</div>
            <div>星座: ${data.constellation}</div>
            <div>仰角: ${data.elevation}°</div>
            <div>方位角: ${data.azimuth}°</div>
            <div>SNR: ${data.snr} dB</div>
          `
        }
      },
      legend: {
        data: [{  // 修改为单个图例项
          name: '卫星分布',
          icon: 'circle',
          textStyle: { color: '#333' }
        }],
        bottom: 10
      },
      polar: {
        radius: '75%',
        splitNumber: 6,  // 增加分割数量使网格更精细
        center: ['50%', '50%']  // 确保图表居中
      },
      angleAxis: {
        type: 'value',
        coordinateSystem: 'polar',
        startAngle: 90,
        clockwise: true,
        min: 0,
        max: 360,
        interval: 45,  // 每隔45度显示一个标签
        axisLabel: {
          formatter: function(value) {
            if (value === 0) return '北'
            if (value === 90) return '东'
            if (value === 180) return '南'
            if (value === 270) return '西'
            if (value > 0 && value < 90) return '东北'
            if (value > 90 && value < 180) return '东南'
            if (value > 180 && value < 270) return '西南'
            if (value > 270 && value < 360) return '西北'
            return ''
          },
          color: '#666',
          fontSize: 12
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(211, 211, 211, 0.8)'
          }
        }
      },
      radiusAxis: {
        type: 'value',
        coordinateSystem: 'polar',
        min: 0,
        max: 90,
        inverse: true,
        interval: 18,  // 每隔18度显示一个标签
        axisLabel: {
          formatter: '{value}°',
          color: '#666',
          fontSize: 12
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(211, 211, 211, 0.8)'
          }
        },
        splitArea: {
          show: true,
          areaStyle: {
            color: ['rgba(255, 255, 255, 0.9)', 'rgba(235, 238, 245, 0.8)']
          }
        }
      },
      series: [{
        name: '卫星分布',
        type: 'scatter',
        coordinateSystem: 'polar',
        data: [],
        symbolSize: function(val) {
          // 根据SNR值调整点的大小
          const snr = val[2]
          return snr > 40 ? 12 : snr > 30 ? 10 : snr > 20 ? 8 : 6
        },
        itemStyle: {
          color: function(params) {
            return constellationColors[params.data.constellation] || '#757575'
          },
          borderColor: '#fff',
          borderWidth: 1
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.3)'
          }
        }
      }]
    }

    chartInstance.value.setOption(option)
  }
}

// 更新图表数据
function updateChart() {
  if (!chartInstance.value) return

  // 过滤数据
  let filteredData = [...satelliteSnrData.value]

  // 按星座过滤
  if (constellationFilter.value !== 'all') {
    filteredData = filteredData.filter(sat => 
      sat.constellation === constellationFilter.value
    )
  }

  // 去重：保留每个PRN的最新数据
  const uniqueDataMap = new Map()
  filteredData.forEach(sat => {
    // 使用星座+PRN作为唯一键
    const key = `${sat.constellation}-${sat.prn}`
    // 始终保留最新的卫星数据
    uniqueDataMap.set(key, sat)
  })
  const uniqueData = Array.from(uniqueDataMap.values())

  // 转换为极坐标数据格式 [方位角, 仰角, SNR, 其他信息]
  const polarData = uniqueData.map(sat => ({
    value: [sat.azimuth, sat.elevation, sat.snr],
    prn: sat.prn,
    constellation: sat.constellation,
    elevation: sat.elevation,
    azimuth: sat.azimuth,
    snr: sat.snr
  }))

  // 更新图表
  chartInstance.value.setOption({
    series: [{
      data: polarData
    }]
  })
}

// 刷新数据
function refreshData() {
  isRefreshing.value = true
  updateChart()
  setTimeout(() => {
    isRefreshing.value = false
  }, 1000)
}

// 清除数据
function clearData() {
  clearNmeaData()
  updateChart()
}

// 切换自动刷新
function toggleAutoRefresh() {
  if (autoRefresh.value) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
}

// 开始自动刷新
function startAutoRefresh() {
  if (!refreshInterval.value) {
    refreshInterval.value = setInterval(refreshData, 5000)
  }
}

// 停止自动刷新
function stopAutoRefresh() {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
    refreshInterval.value = null
  }
}

// 监听卫星数据变化
watch(satelliteSnrData, () => {
  if (autoRefresh.value) {
    debouncedUpdateChart()
  }
})

// 组件挂载时
onMounted(() => {
  initChart()
  updateChart()
  if (autoRefresh.value) {
    startAutoRefresh()
  }

  // 处理窗口大小变化
  window.addEventListener('resize', () => {
    if (chartInstance.value) {
      chartInstance.value.resize()
    }
  })
})

// 组件卸载时
onUnmounted(() => {
  stopAutoRefresh()
  if (chartInstance.value) {
    chartInstance.value.dispose()
    chartInstance.value = null
  }
})
</script>

<style scoped>
.gnss-sky-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background-color: #f5f5f5;
  border-radius: 8px;
  overflow: hidden;
}

.control-panel {
  padding: 10px 15px;
  background-color: #fff;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
}

.control-panel h3 {
  margin: 0 0 10px 0;
  font-size: 16px;
  color: #333;
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

button {
  padding: 6px 12px;
  background-color: #1E88E5;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

button:hover:not(:disabled) {
  background-color: #1565C0;
}

button:disabled {
  background-color: #90CAF9;
  cursor: not-allowed;
}

select {
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background-color: white;
  font-size: 14px;
}

.sky-chart {
  flex: 1;
  width: 100%;
  min-height: 400px;
}

@media (max-width: 768px) {
  .buttons {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>