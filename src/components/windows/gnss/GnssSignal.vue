<template>
  <div class="snr-container">
    <div class="snr-content">
      <div class="view-controls">
        <el-radio-group v-model="currentView" size="small">
          <el-radio-button label="table">表格视图</el-radio-button>
          <el-radio-button label="chart">柱状图视图</el-radio-button>
        </el-radio-group>

        <el-select
          v-show="currentView === 'chart'"
          v-model="constellationFilter"
          placeholder="选择星座"
          size="small"
          class="constellation-filter"
        >
          <el-option label="所有星座" value="all" />
          <el-option label="GPS" value="GPS" />
          <el-option label="GLONASS" value="GLONASS" />
          <el-option label="BEIDOU" value="BEIDOU" />
          <el-option label="GALILEO" value="GALILEO" />
          <el-option label="OTHER" value="OTHER" />
        </el-select>
      </div>

      <div v-show="currentView === 'table'" class="snr-table-container">
        <el-table
          :data="filteredSatelliteData"
          style="width: 100%"
          height="100%"
          stripe
          border
          :default-sort="{ prop: 'constellation', order: 'ascending' }"
          :fit="true"
          :show-overflow-tooltip="true"
        >
          <el-table-column
            prop="constellation"
            label="星座"
            width="100"
            sortable
            :filters="constellationFilters"
            :filter-method="filterConstellation"
            filter-placement="bottom-end"
          >
            <template #default="{ row }">
              <el-tag :type="getConstellationTagType(row.constellation)" size="small">
                {{ row.constellation }}
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column
            prop="prn"
            label="PRN"
            min-width="80"
            sortable
          />

          <el-table-column
            prop="snr"
            label="信号强度 (SNR)"
            min-width="150"
            sortable
          >
            <template #default="{ row }">
              <div class="snr-cell">
                <el-progress
                  :percentage="Math.min(row.snr, 60) * (100/60)"
                  :color="getSnrColor(row.snr)"
                  :stroke-width="10"
                  :show-text="false"
                  style="width: 100px; margin-right: 10px"
                />
                <span :style="{ color: getSnrColor(row.snr) }" class="snr-value">
                  {{ row.snr }} dB
                </span>
              </div>
            </template>
          </el-table-column>

          <el-table-column
            prop="elevation"
            label="仰角"
            min-width="100"
            sortable
          >
            <template #default="{ row }">
              {{ row.elevation }}°
            </template>
          </el-table-column>

          <el-table-column
            prop="azimuth"
            label="方位角"
            min-width="100"
            sortable
          >
            <template #default="{ row }">
              {{ row.azimuth }}°
            </template>
          </el-table-column>

          <el-table-column
            prop="timestamp"
            label="更新时间"
            min-width="180"
            sortable
          >
            <template #default="{ row }">
              {{ formatTime(row.timestamp) }}
            </template>
          </el-table-column>

          <el-table-column
            prop="status"
            label="状态"
            min-width="100"
            fixed="right"
          >
            <template #default="{ row }">
              <el-tag :type="getStatusTagType(row.snr)" size="small">
                {{ getStatusText(row.snr) }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div
        v-show="currentView === 'chart'"
        ref="chartRef"
        class="snr-chart-container"
      ></div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useNmea } from '@/composables/gnss/useNmea'
import { useTheme } from '@/composables/useTheme'

// 初始化NMEA解析器与主题
const { satelliteSnrData } = useNmea()
const { chartTheme, resolvedTheme } = useTheme()

// 视图状态
const currentView = ref('table')
const constellationFilter = ref('all')

// 图表相关
const chartRef = ref(null)
const chartInstance = ref(null)
let resizeObserver = null
const DATA_UPDATE_INTERVAL_MS = 200
let dataUpdateTimer = null

// 星座过滤选项
const constellationFilters = [
  { text: 'GPS', value: 'GPS' },
  { text: 'GLONASS', value: 'GLONASS' },
  { text: 'BEIDOU', value: 'BEIDOU' },
  { text: 'GALILEO', value: 'GALILEO' },
  { text: 'OTHER', value: 'OTHER' }
]

// 星座颜色映射（用于 tooltip 与图例提示）
const constellationColors = {
  GPS: '#52c41a',
  GLONASS: '#1890ff',
  BEIDOU: '#faad14',
  GALILEO: '#13c2c2',
  OTHER: '#ff4d4f'
}

// 获取卫星数据（useNmea 已按 constellation-prn 去重，这里只做星座+PRN 排序，
// 避免每次更新都做时间戳解析排序和 Map 去重的重复开销）
function getLatestSatelliteData() {
  return [...satelliteSnrData.value].sort((a, b) => {
    // 首先按星座升序排序
    if (a.constellation !== b.constellation) {
      return a.constellation.localeCompare(b.constellation)
    }
    // 然后按PRN数字升序排序
    return parseInt(a.prn) - parseInt(b.prn)
  })
}

// 过滤后的卫星数据（现在显示所有星座的数据）
const filteredSatelliteData = computed(() => {
  return getLatestSatelliteData()
})

// 柱状图使用的数据：按星座过滤后仍保持排序
const chartData = computed(() => {
  let data = getLatestSatelliteData()
  if (constellationFilter.value !== 'all') {
    data = data.filter(sat => sat.constellation === constellationFilter.value)
  }
  return data
})

// 获取星座标签类型
function getConstellationTagType(constellation) {
  const typeMap = {
    'GPS': 'success',
    'GLONASS': 'primary',
    'BEIDOU': 'warning',
    'GALILEO': 'info',
    'OTHER': 'danger'
  }
  return typeMap[constellation] || 'info'
}

// 获取SNR颜色
function getSnrColor(snr) {
  if (snr >= 45) return '#52c41a'
  if (snr >= 35) return '#1890ff'
  if (snr >= 25) return '#faad14'
  return '#ff4d4f'
}

// 获取状态标签类型
function getStatusTagType(snr) {
  if (snr >= 45) return 'success'
  if (snr >= 35) return 'primary'
  if (snr >= 25) return 'warning'
  return 'danger'
}

// 获取状态文本
function getStatusText(snr) {
  if (snr >= 45) return '优秀'
  if (snr >= 35) return '良好'
  if (snr >= 25) return '一般'
  return '较差'
}

// 格式化时间
function formatTime(timestamp) {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 星座过滤方法
function filterConstellation(value, row) {
  return row.constellation === value
}

// 设置ResizeObserver监听容器尺寸变化
function setupResizeObserver() {
  if (!chartRef.value || typeof ResizeObserver === 'undefined') return

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  resizeObserver = new ResizeObserver(() => {
    nextTick(() => {
      if (chartInstance.value) {
        try {
          chartInstance.value.resize()
        } catch (error) {
          // 图表调整大小失败不影响正常使用，静默处理
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
  if (!chartRef.value) return

  if (chartInstance.value) {
    chartInstance.value.dispose()
    chartInstance.value = null
  }

  setupResizeObserver()

  nextTick(() => {
    chartInstance.value = echarts.init(chartRef.value, null, { renderer: 'svg' })
    const colors = chartTheme.value

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        formatter: function (params) {
          const param = Array.isArray(params) ? params[0] : params
          if (!param || !param.data) return ''
          const data = param.data
          const constellation = data.constellation || 'OTHER'
          const color = constellationColors[constellation] || '#757575'
          return `
            <div style="background-color: ${colors.surface}; border: 1px solid ${colors.border}; border-radius: 8px; padding: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.24); min-width: 140px; text-align: left; color: ${colors.text};">
              <div style="font-size: 16px; font-weight: bold; color: ${colors.text}; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid ${colors.border};">
                <div style="display: flex; align-items: center;">
                  <div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${color}; margin-right: 8px;"></div>
                  <span>${constellation}</span>
                  <span style="color: ${colors.textMuted}; margin-left: 6px;">PRN ${data.prn}</span>
                </div>
              </div>
              <div style="display: flex; margin-bottom: 5px;">
                <span style="font-weight: 500; width: 68px; color: ${colors.textMuted};">仰角:</span>
                <span>${data.elevation}°</span>
              </div>
              <div style="display: flex; margin-bottom: 5px;">
                <span style="font-weight: 500; width: 68px; color: ${colors.textMuted};">方位角:</span>
                <span>${data.azimuth}°</span>
              </div>
              <div style="display: flex;">
                <span style="font-weight: 500; width: 68px; color: ${colors.textMuted};">SNR:</span>
                <span style="font-weight: bold; color: ${getSnrColor(data.value)};">${data.value} dB</span>
              </div>
            </div>
          `
        },
        backgroundColor: 'transparent',
        borderWidth: 0,
        padding: 0
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '10%',
        top: '12%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: [],
        axisLabel: {
          color: colors.textMuted,
          fontSize: 12,
          interval: 0,
          rotate: 45
        },
        axisLine: {
          lineStyle: {
            color: colors.border
          }
        },
        axisTick: {
          alignWithLabel: true,
          lineStyle: {
            color: colors.border
          }
        },
        splitLine: {
          show: false
        }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 60,
        name: 'SNR (dB)',
        nameTextStyle: {
          color: colors.text,
          padding: [0, 0, 0, 40]
        },
        axisLabel: {
          color: colors.textMuted,
          fontSize: 12
        },
        axisLine: {
          lineStyle: {
            color: colors.border
          }
        },
        splitLine: {
          lineStyle: {
            color: colors.grid
          }
        }
      },
      series: [{
        name: 'SNR',
        type: 'bar',
        data: [],
        barMaxWidth: 30,
        itemStyle: {
          borderRadius: [4, 4, 0, 0]
        },
        emphasis: {
          focus: 'self',
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.3)'
          }
        },
        markLine: {
          symbol: 'none',
          label: {
            position: 'end',
            color: colors.textMuted,
            fontSize: 11,
            formatter: '{b}'
          },
          lineStyle: {
            type: 'dashed'
          },
          data: [
            { yAxis: 25, name: '较差', lineStyle: { color: '#ff4d4f' } },
            { yAxis: 35, name: '一般', lineStyle: { color: '#faad14' } },
            { yAxis: 45, name: '良好', lineStyle: { color: '#1890ff' } }
          ]
        }
      }],
      animation: false
    }

    chartInstance.value.setOption(option)
    updateChart()
  })
}

// 更新图表数据
function updateChart() {
  if (!chartInstance.value) return
  if (document.hidden) return

  const data = chartData.value
  const categoryData = data.map(sat => sat.prn)
  const seriesData = data.map(sat => ({
    value: sat.snr,
    prn: sat.prn,
    constellation: sat.constellation,
    elevation: sat.elevation,
    azimuth: sat.azimuth,
    itemStyle: {
      color: getSnrColor(sat.snr)
    }
  }))

  chartInstance.value.dispatchAction({ type: 'hideTip' })
  chartInstance.value.setOption({
    xAxis: { data: categoryData },
    series: [{ data: seriesData }]
  })
}

function scheduleDataUpdate() {
  if (dataUpdateTimer !== null) return
  dataUpdateTimer = window.setTimeout(() => {
    dataUpdateTimer = null
    updateChart()
  }, DATA_UPDATE_INTERVAL_MS)
}

// 监听数据变化
watch(satelliteSnrData, () => {
  scheduleDataUpdate()
})

// 监听星座过滤变化
watch(constellationFilter, () => {
  updateChart()
})

// 监听视图切换：切换到柱状图时初始化或更新图表
watch(currentView, (view) => {
  if (view === 'chart') {
    nextTick(() => {
      if (!chartInstance.value) {
        initChart()
      } else {
        chartInstance.value.resize()
        updateChart()
      }
    })
  }
})

// 监听主题变化
watch(resolvedTheme, () => {
  if (currentView.value === 'chart') {
    initChart()
  }
})

// 组件挂载时
onMounted(() => {
  setTimeout(() => {
    if (currentView.value === 'chart') {
      initChart()
    }
  }, 100)
})

// 组件卸载时
onUnmounted(() => {
  if (dataUpdateTimer !== null) {
    clearTimeout(dataUpdateTimer)
    dataUpdateTimer = null
  }

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
.snr-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  color: var(--app-text);
  background-color: var(--app-surface);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px 0 var(--app-shadow);
}

.snr-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 15px;
  gap: 12px;
}

.view-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.constellation-filter {
  width: 140px;
}

.snr-table-container {
  flex: 1;
  background-color: var(--app-surface);
  border-radius: 4px;
  overflow: hidden;
}

.snr-chart-container {
  flex: 1;
  width: 100%;
  min-height: 0;
  border-radius: 4px;
  background-color: var(--app-surface);
}

.snr-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.snr-value {
  font-weight: bold;
  font-size: 14px;
}

:deep(.el-table__header-wrapper) {
  background-color: var(--app-surface-muted);
}

:deep(.el-table__row:hover) {
  background-color: var(--app-hover);
}

/* 全屏模式下表格样式优化 */
.full-screen-card .snr-table-container {
  height: 100%;
  overflow: hidden;
}

.full-screen-card .el-table {
  height: 100% !important;
}
</style>
