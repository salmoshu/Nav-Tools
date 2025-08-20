<template>
  <div class="gnss-sky-container">
    <div class="control-panel">
      <div class="controls">
        <div class="satellite-size-control">
          <span>卫星大小: {{ satelliteSize }}px</span>
          <el-slider
            v-model="satelliteSize"
            :min="10"
            :max="40"
            :step="1"
            @change="updateChart"
            size="small"
          />
        </div>
        <div class="elevation-limit-control">
          <span>仰角限制: {{ elevationLimit }}°</span>
          <el-slider
            v-model="elevationLimit"
            :min="0"
            :max="30"
            :step="1"
            @change="updateChart"
            size="small"
          />
        </div>
        <el-select v-model="constellationFilter" @change="updateChart" size="medium" class="constellation-select">
          <el-option label="所有星座" value="all" />
          <el-option label="GPS" value="GPS" />
          <el-option label="GLONASS" value="GLONASS" />
          <el-option label="GALILEO" value="GALILEO" />
          <el-option label="BeiDou" value="BEIDOU" />
          <el-option label="QZSS" value="QZSS" />
        </el-select>
      </div>
    </div>
    <div class="sky-chart" ref="chartRef"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useNmea } from '@/composables/gnss/useNmea'

// 获取卫星数据
const { satelliteSnrData } = useNmea()

// 组件状态
const chartRef = ref(null)
const chartInstance = ref(null)
const constellationFilter = ref('all')
const satelliteSize = ref(20)
const minSizeForLabel = 20
// 添加仰角限制状态，默认15°
const elevationLimit = ref(15)

// 用于存储需要在组件卸载时执行的清理函数
const cleanupFunctions = []

// 星座标识映射
const constellationPrefixes = {
  GPS: 'G',
  GLONASS: 'R',
  GALILEO: 'E',
  BEIDOU: 'C',
  QZSS: 'J',
  UNKNOWN: 'U'
}

// 星座颜色映射
const constellationColors = {
  GPS: '#43A047',
  GLONASS: '#FF9500',
  GALILEO: '#007AFF',
  BEIDOU: '#FF8A80',
  QZSS: '#AF52DE',
  UNKNOWN: '#757575'
}

// 初始化图表
function initChart() {
  // 确保先清理可能存在的实例
  if (chartInstance.value) {
    chartInstance.value.dispose()
    chartInstance.value = null
  }

  if (chartRef.value) {
    // 使用nextTick确保DOM已经更新
    nextTick(() => {
      chartInstance.value = echarts.init(chartRef.value, null, { renderer: 'svg' })

      // 设置图表选项
      const option = {
        tooltip: {
          trigger: 'item',
          formatter: function(params) {
            const data = params.data
            const prefix = constellationPrefixes[data.constellation] || 'U'
            return `
              <div style="font-size: 14px;">卫星信息</div>
              <div>星座: ${data.constellation}</div>
              <div>仰角: ${data.elevation}°</div>
              <div>方位角: ${data.azimuth}°</div>
              <div>SNR: ${data.snr} dB</div>
            `
          }
        },
        legend: {
          data: [{
            name: 'sky view',
            icon: 'circle',
            textStyle: { color: '#333' }
          }],
          bottom: 10,
          show: false,
        },
        polar: {
          radius: '75%',
          splitNumber: 6,
          center: ['50%', '50%']
        },
        angleAxis: {
          type: 'value',
          coordinateSystem: 'polar',
          startAngle: 90,
          clockwise: true,
          min: 0,
          max: 360,
          interval: 45,
          axisLabel: {
            formatter: function(value) {
              if (value === 0) return 'N'
              if (value === 90) return 'E'
              if (value === 180) return 'S'
              if (value === 270) return 'W'
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
          interval: 30,
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
          name: 'sky view',
          type: 'scatter',
          coordinateSystem: 'polar',
          data: [],
          symbolSize: satelliteSize.value,
          label: {
            show: satelliteSize.value >= minSizeForLabel,
            position: 'inside',
            formatter: function(params) {
              const prefix = constellationPrefixes[params.data.constellation] || 'U'
              return `${prefix}${params.data.prn}`
            },
            color: '#333',
            fontSize: Math.max(6, satelliteSize.value / 3),
          },
          itemStyle: {
            color: function(params) {
              return constellationColors[params.data.constellation] || '#757575'
            },
            borderColor: '#fff',
            borderWidth: 1,
            opacity: 1.0
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.3)'
            },
            label: {
              show: true,
              fontSize: 12
            }
          }
        }],
        animation: false
      }

      chartInstance.value.setOption(option)
      updateChart() // 初始化后立即更新数据

      // 添加窗口大小变化监听
      const resizeHandler = () => {
        if (chartInstance.value) {
          chartInstance.value.resize()
        }
      }

      window.addEventListener('resize', resizeHandler)

      // 将清理函数添加到数组中
      cleanupFunctions.push(() => {
        window.removeEventListener('resize', resizeHandler)
      })
    })
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

  // 按仰角过滤
  filteredData = filteredData.filter(sat => 
    sat.elevation >= elevationLimit.value
  )

  // 去重：保留每个PRN的最新数据
  const uniqueDataMap = new Map()
  filteredData.forEach(sat => {
    const key = `${sat.constellation}-${sat.prn}`
    uniqueDataMap.set(key, sat)
  })
  const uniqueData = Array.from(uniqueDataMap.values())

  // 转换为极坐标数据格式 [仰角, 方位角, SNR, 其他信息]
  const polarData = uniqueData.map(sat => ({
    value: [sat.elevation, sat.azimuth, sat.snr],
    prn: sat.prn,
    constellation: sat.constellation,
    elevation: sat.elevation,
    azimuth: sat.azimuth,
    snr: sat.snr
  }))

  // 更新图表
  chartInstance.value.setOption({
    series: [{
      name: 'sky view',
      data: polarData,
      symbolSize: satelliteSize.value,
      label: {
        show: satelliteSize.value >= minSizeForLabel,
        fontSize: Math.max(6, satelliteSize.value / 3),
      }
    }]
  })
}

// 监听卫星大小变化
watch(satelliteSize, () => {
  updateChart();
})

// 监听仰角限制变化
watch(elevationLimit, () => {
  updateChart();
})

// 监听卫星数据变化
watch(satelliteSnrData, () => {
  updateChart();
}, { deep: true });

// 组件挂载时
onMounted(() => {
  // 确保图表被初始化
  initChart()
})

// 组件卸载时
onUnmounted(() => {
  // 执行所有清理函数
  cleanupFunctions.forEach(func => func())
  cleanupFunctions.length = 0 // 清空数组

  if (chartInstance.value) {
    chartInstance.value.dispose()
    chartInstance.value = null
  }
})
</script>

<style scoped>
.gnss-sky-container {
  display: flex;
  flex-direction: row; /* 改为水平布局 */
  height: 100%;
  width: 100%;
  background-color: #f5f7fa;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.control-panel {
  width: 25%; /* 固定宽度 */
  padding: 15px;
  background-color: #fff;
  border-right: 1px solid #eaeaea; /* 右侧边框 */
  display: flex;
  flex-direction: column;
}

.controls {
  display: flex;
  flex-direction: column; /* 改为垂直布局 */
  gap: 20px; /* 垂直间距 */
  width: 100%;
}

.constellation-select {
  width: 100%; /* 宽度100% */
  margin-left: 0; /* 移除左侧margin */
  padding-top: 20px;
}

.sky-chart {
  flex: 1; /* 占满剩余空间 */
  width: 100%;
  min-height: 400px;
  padding: 15px;
  background-color: #fff;
}

.satellite-size-control {
  display: flex;
  flex-direction: column;
  width: 100%;
  margin-left: 0; /* 移除左侧margin */
  padding-top: 20px;
}

.satellite-size-control span {
  margin-bottom: 5px;
  font-size: 14px;
  color: #666;
}

.elevation-limit-control {
  display: flex;
  flex-direction: column;
  width: 100%;
  margin-left: 0; /* 移除左侧margin */
  padding-top: 20px;
}

.elevation-limit-control span {
  margin-bottom: 5px;
  font-size: 14px;
  color: #666;
}

@media (max-width: 768px) {
  .gnss-sky-container {
    flex-direction: column; /* 小屏幕恢复垂直布局 */
  }
  .control-panel {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid #eaeaea;
  }
  .controls {
    flex-direction: column;
    align-items: stretch;
  }
  .constellation-select {
    width: 100%;
    margin-top: 0;
  }
}
</style>