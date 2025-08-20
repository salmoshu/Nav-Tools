<template>
  <div class="gnss-sky-container">
    <div class="control-panel">
      <div class="controls">
        <el-button type="primary" size="small" @click="toggleAutoRefresh" class="refresh-btn">
          <el-icon v-if="autoRefresh"><RefreshRight /></el-icon>
          <el-icon v-else><VideoPause /></el-icon>
          {{ autoRefresh ? '停止刷新' : '自动刷新' }}
        </el-button>
        <el-button type="default" size="small" @click="refreshData" class="refresh-btn">
          <el-icon><Refresh /></el-icon>
          手动刷新
        </el-button>
        <el-select v-model="constellationFilter" @change="updateChart" size="small" class="constellation-select">
          <el-option label="所有星座" value="all" />
          <el-option label="GPS" value="GPS" />
          <el-option label="GLONASS" value="GLONASS" />
          <el-option label="GALILEO" value="GALILEO" />
          <el-option label="BeiDou" value="BEIDOU" />
          <el-option label="QZSS" value="QZSS" />
        </el-select>
        <el-checkbox v-model="showSatelliteLabels" size="small">卫星标识</el-checkbox>
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
import { Refresh, RefreshRight, VideoPause } from '@element-plus/icons-vue'

// 获取卫星数据
const { satelliteSnrData } = useNmea()

// 组件状态
const chartRef = ref(null)
const chartInstance = ref(null)
const autoRefresh = ref(true)
const constellationFilter = ref('all')
const showSatelliteLabels = ref(false) // 新增：控制卫星标识显示

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
        bottom: 10
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
        symbolSize: 30,
        label: {
          show: showSatelliteLabels.value,
          position: 'inside',
          formatter: function(params) {
            const prefix = constellationPrefixes[params.data.constellation] || 'U'
            return `${prefix}${params.data.prn}`
          },
          color: '#333',
          fontSize: 8,
          // fontWeight: 'bold',
          // textBorderColor: '#000',
          // textBorderWidth: 1
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
      label: {
        show: showSatelliteLabels.value
      }
    }]
  })
}

// 监听卫星标识显示状态变化
watch(showSatelliteLabels, () => {
  updateChart();
})

// 刷新数据 - 简化版本
function refreshData() {
  updateChart();
}

function toggleAutoRefresh() {
  autoRefresh.value = !autoRefresh.value;
}

// 监听卫星数据变化
watch(satelliteSnrData, () => {
  if (autoRefresh.value) {
    updateChart();
  }
}, { deep: true });

// 组件挂载时
onMounted(() => {
  initChart();
  updateChart();
  // 移除自动刷新相关逻辑
})

// 组件卸载时
onUnmounted(() => {
  // 移除停止自动刷新逻辑
  if (chartInstance.value) {
    chartInstance.value.dispose();
    chartInstance.value = null;
  }
})
</script>

<style scoped>
.gnss-sky-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background-color: #f5f7fa;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.control-panel {
  padding: 15px;
  background-color: #fff;
  border-bottom: 1px solid #eaeaea;
}

.controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.refresh-btn {
  margin-right: 5px;
}

.constellation-select {
  margin-left: auto;
  width: 120px; /* 可根据需要调整宽度 */
}

.sky-chart {
  flex: 1;
  width: 100%;
  min-height: 400px;
  padding: 15px;
  background-color: #fff;
}

@media (max-width: 768px) {
  .controls {
    flex-direction: column;
    align-items: flex-start;
  }
  .constellation-select {
    margin-left: 0;
    margin-top: 10px;
    width: 100%;
  }
}
</style>