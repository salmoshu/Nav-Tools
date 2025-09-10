<template>
  <div class="gnss-sky-container">
    <div class="control-panel">
      <div class="controls">
        <el-select v-model="constellationFilter" @change="updateChart" size="default" class="constellation-select">
          <el-option label="所有星座" value="all" />
          <el-option label="GPS" value="GPS" />
          <el-option label="GLONASS" value="GLONASS" />
          <el-option label="GALILEO" value="GALILEO" />
          <el-option label="BeiDou" value="BEIDOU" />
          <el-option label="QZSS" value="QZSS" />
        </el-select>
        <div class="satellite-size-control">
          <span>卫星大小: {{ satelliteSize }}px</span>
          <el-slider
            v-model="satelliteSize"
            :min="10"
            :max="40"
            :step="1"
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
            size="small"
          />
        </div>
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
const satelliteSize = ref(25)
const minSizeForLabel = 20
// 添加仰角限制状态，默认15°
const elevationLimit = ref(15)

// 用于存储需要在组件卸载时执行的清理函数
const cleanupFunctions = []
let resizeObserver = null

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
  GPS: '#BADC7E',
  GLONASS: '#9DA007',
  GALILEO: '#82C3E5',
  BEIDOU: '#FF8A80',
  QZSS: '#AF52DE',
  UNKNOWN: '#757575'
}

// 设置ResizeObserver监听容器尺寸变化
function setupResizeObserver() {
  if (!chartRef.value) return
  
  // 清理之前的ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect()
  }

  resizeObserver = new ResizeObserver(() => {
    nextTick(() => {
      if (chartInstance.value) {
        try {
          chartInstance.value.resize()
        } catch (error) {
          // 由于图表调整大小失败不会影响正常使用，所以先规避该问题：
          // task#32 GnssSky中极坐标系使用resize所引发的报错
          // console.error('图表调整大小失败:', error)
        }
      }
    })
  })
  
  const parentElement = chartRef.value.parentElement
  if (parentElement) {
    resizeObserver.observe(parentElement)
  }
}

// 初始化图表
function initChart() {
  // 确保先清理可能存在的实例
  if (chartInstance.value) {
    chartInstance.value.dispose()
    chartInstance.value = null
  }

  if (chartRef.value) {
    // 设置ResizeObserver监听
    setupResizeObserver()
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
            const color = constellationColors[data.constellation] || '#757575'
            return `
              <div style="background-color: rgba(255, 255, 255, 0.95); border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); min-width: 100px; text-align: left;">
                <div style="font-size: 16px; font-weight: bold; color: #333; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #f0f0f0;">
                  <div style="display: flex; align-items: center; margin-bottom: 5px;">
                    <div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${color}; margin-right: 8px;"></div>
                    <span style="color: #333;">${data.constellation}</span>
                    <span style="color: #666;">(${prefix}${data.prn})</span>
                  </div>
                </div>
                <div style="display: flex; margin-bottom: 5px;">
                  <span style="font-weight: 500; width: 68px; color: #555;">仰角:</span>
                  <span style="color: #333;">${data.elevation}°</span>
                </div>
                <div style="display: flex; margin-bottom: 5px;">
                  <span style="font-weight: 500; width: 68px; color: #555;">方位角:</span>
                  <span style="color: #333;">${data.azimuth}°</span>
                </div>
                <div style="display: flex;">
                  <span style="font-weight: 500; width: 68px; color: #555;">SNR:</span>
                  <span style="color: #333;">${data.snr} dB</span>
                </div>
              </div>
            `
          },
          backgroundColor: 'transparent',
          borderWidth: 0,
          padding: 0
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
  setTimeout(() => {
    initChart()
  }, 100)
})

// 组件卸载时
onUnmounted(() => {
  // 执行所有清理函数
  cleanupFunctions.forEach(func => func())
  cleanupFunctions.length = 0 // 清空数组

  // 清理ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  if (chartInstance.value) {
    chartInstance.value.dispose()
    chartInstance.value = null
  }
})
</script>

<style scoped>
.gnss-sky-container {
  display: flex;
  flex-direction: row;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.control-panel {
  width: 25%;
  padding: 20px;
  border-right: 2px solid #e6e9f0;
  display: flex;
  flex-direction: column;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.sky-chart {
  flex: 1;
  width: 100%;
  min-height: 0px;
  padding: 15px;
  background-color: #fff;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
}

.satellite-size-control,
.elevation-limit-control {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 15px 0;
}

.satellite-size-control span,
.elevation-limit-control span {
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

/* 滑块样式 */
:deep(.el-slider) {
  --el-slider-height: 5px; /* 轨道高度 */
  --el-slider-button-size: 22px; /* 滑块按钮大小，适合 SVG 图标 */
}

:deep(.el-slider__runway) {
  background-color: #e4e7ed;
  border-radius: 4px;
}

:deep(.el-slider__bar) {
  background: #6E6E6E;
  border-radius: 4px;
}

:deep(.el-slider__button) {
  width: var(--el-slider-button-size);
  height: var(--el-slider-button-size);
  background-image: url("data:image/svg+xml;charset=utf-8;base64,PHN2ZyBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHN0eWxlPSJoZWlnaHQ6IDE2cHg7IHdpZHRoOiAxNnB4OyI+PHBhdGggZD0iTTUxMiA2NGE0NDggNDQ4IDAgMCAxIDEzMC4yNCAxOS4yMzJjLTM3LjQwOCAxNDIuNzItMTUuMDQgMjM0LjQgNzUuODQgMjY0LjcwNGwxNy4yOCA1Ljg4OCAxNi40OCA1Ljg4OGMxMDUuNTM2IDM4Ljk3NiAxMjkuMzc2IDcxLjc0NCAxMDQuNjQgMTQ1Ljk4NC0xMS4yIDMzLjYtMzQuOTQ0IDQ5LjgyNC0xMDEuNjk2IDczLjE1MmwtMzUuODQgMTIuMjI0LTE3LjQ0IDYuMzA0Yy03Mi40NDggMjcuMTA0LTEwNC40MTYgNTIuMTI4LTEyMi41NiAxMDYuNTYtMjYuMTQ0IDc4LjM2OCA4LjY0IDE1My4zNzYgOTguMTc2IDIyNC42MDhBNDQ1Ljc5MiA0NDUuNzkyIDAgMCAxIDUxMiA5NjBjLTMyLjg2NCAwLTY0Ljg5Ni0zLjUyLTk1Ljc0NC0xMC4yNCA1Ni4wOTYtNDMuMDcyIDY2LjA0OC0xMDguOCAyNC44LTE5MS4yOTYtMjYuODgtNTMuNjk2LTY5LjI0OC04My4xMzYtMTI5LjkyLTEwMS4zNDRhNDgwLjk2IDQ4MC45NiAwIDAgMC0xOS43NDQtNS40NGwtMzMuNDA4LTcuOTM2Yy0zNC4yNC04LjEyOC00OC40OC0xMy45NTItNTQuNTI4LTIxLjYzMi02LjQtOC4xNi02LjM2OC0yNS45ODQgNi41OTItNjAuMzJsMi41Ni02LjY1NmM1My44MjQtMTM0LjU2IDE1LjEwNC0yMTkuMDcyLTEwNi40NjQtMjMzLjA4OEMxNzcuNjMyIDE2OS42IDMzMi40OCA2NCA1MTIgNjR6TTgyLjQ2NCAzODQuMjU2Yzg5LjYgMy42NDggMTEwLjYyNCA0My4wNCA3My41MDQgMTQwLjA2NGwtMi43ODQgNy4wNGMtMjMuMDQgNTcuNjk2LTI0LjEyOCA5OS42NDgtMC4wNjQgMTMwLjI3MiAxNy40MDggMjIuMjA4IDM4Ljg0OCAzMS43NzYgODIuNTYgNDIuNTZsMzMuMjggNy44NzJjOS4wMjQgMi4yMDggMTYuNjQgNC4yMjQgMjMuNzc2IDYuMzY4IDQ1LjI0OCAxMy41NjggNzMuMjQ4IDMzLjAyNCA5MS4wNzIgNjguNjcyIDM1LjIgNzAuMzY4IDIxLjQ0IDExMS4zNi01MS44NCAxMzUuMjMyQzE3NC4xNzYgODUzLjAyNCA2NCA2OTUuMzYgNjQgNTEyYzAtNDQuMzg0IDYuNDY0LTg3LjI2NCAxOC40NjQtMTI3Ljc0NHogbTYxOS44MDgtMjc3Ljk1MkM4NTQuNTYgMTc3LjgyNCA5NjAgMzMyLjYwOCA5NjAgNTEyYzAgMTYzLjUyLTg3LjYxNiAzMDYuNjI0LTIxOC40OTYgMzg0LjgzMi04OC4zMi02MS44MjQtMTE5LjY4LTExOS4xNjgtMTAxLjg1Ni0xNzIuNjQgMTEuMTY4LTMzLjUzNiAzNC44OC00OS43NiAxMDEuMzQ0LTczLjAyNGwxNy4xODQtNS44NTZjOTguNzItMzIuODk2IDEzOC4wNDgtNTYuNTEyIDE1OS4wNC0xMTkuMzYgNDIuMTc2LTEyNi41OTItMTUuNTUyLTE4NC4zMi0xNzguODgtMjM4LjcyLTQ3LjItMTUuNzQ0LTYyLjQ5Ni02OS42MzItMzguNzUyLTE3MC4wOGwyLjY4OC0xMC44OHogbS0yMzEuMTM2IDMyMy41MmMwIDM0LjY1NiA0MS4wODggODIuMTc2IDEyMy4yMzIgODIuMTc2IDgyLjE3NiAwIDgyLjE3Ni04Mi4xNDQgMC0xMjMuMjMyLTgyLjE0NC00MS4wODgtMTIzLjIgNi40MzItMTIzLjIgNDEuMDg4eiIgZmlsbD0iIzVDNUM1QyI+PC9wYXRoPjwvc3ZnPg==");
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  border: none; /* 移除默认边框 */
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); /* 微阴影 */
  transition: all 0.2s ease;
}

:deep(.el-slider__button:hover) {
  transform: scale(1.15); /* 悬停放大 */
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

:deep(.el-slider__button:active) {
  transform: scale(0.95); /* 点击微缩 */
}

.constellation-select {
  width: 100%;
  padding: 15px 0;
}

:deep(.el-select) {
  --el-select-border-color: #dcdfe6;
  --el-select-font-size: 14px;
}

:deep(.el-select .el-input__wrapper) {
  background-color: #fff;
  border: 1px solid var(--el-select-border-color);
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease;
}

:deep(.el-select .el-input__wrapper:hover) {
  border-color: #409EFF;
  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.2);
}

:deep(.el-select .el-input__inner) {
  font-size: var(--el-select-font-size);
  color: #333;
}

:deep(.el-select .el-input__suffix) {
  color: #409EFF;
}

:deep(.el-select-dropdown__item) {
  font-size: 14px;
  color: #333;
  padding: 8px 20px;
}

:deep(.el-select-dropdown__item:hover) {
  background-color: rgba(64, 158, 255, 0.1);
  color: #409EFF;
}

:deep(.el-select-dropdown__item.selected) {
  background-color: rgba(64, 158, 255, 0.2);
  font-weight: 500;
}

@media (max-width: 768px) {
  .gnss-sky-container {
    flex-direction: column;
  }
  .control-panel {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid #e6e9f0;
  }
  .controls {
    flex-direction: column;
    align-items: stretch;
  }
  .constellation-select {
    width: 100%;
    padding: 15px 0;
  }
}
</style>
