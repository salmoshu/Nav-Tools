<template>
  <div class="snr-container">
    <div class="snr-content">
      <div class="view-controls">
        <el-radio-group v-model="currentView" size="small">
          <el-radio-button label="table">表格视图</el-radio-button>
          <el-radio-button label="chart">柱状图视图</el-radio-button>
          <el-radio-button label="nsat">卫星数目</el-radio-button>
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

        <!-- NSat 视图：滑窗开关（仅显示最新 40 个时刻）+ 清除卫星数目历史 -->
        <div v-show="currentView === 'nsat'" class="nsat-controls">
          <el-button
            :type="nsatSlidingWindow ? 'primary' : 'default'"
            size="small"
            class="nsat-window-btn"
            :title="nsatSlidingWindow ? '当前仅显示最新 40 个时刻，点击查看全部' : '当前显示全部时刻，点击仅显示最新 40 个'"
            @click="toggleNsatSlidingWindow"
          >
            <el-icon><Timer /></el-icon>&nbsp;{{ nsatSlidingWindow ? '滑窗(40)' : '全部' }}
          </el-button>
          <el-button
            type="primary"
            size="small"
            class="nsat-clear-btn"
            @click="clearNsatHistory"
          >
            <el-icon><Delete /></el-icon>&nbsp;清除
          </el-button>
        </div>
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

      <div
        v-show="currentView === 'nsat'"
        ref="nsatChartRef"
        class="nsat-chart-container"
      ></div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { Delete, Timer } from '@element-plus/icons-vue'
import { useNmea } from '@/composables/gnss/useNmea'
import { useTheme } from '@/composables/useTheme'

// 初始化NMEA解析器与主题
const { satelliteSnrData, currentData } = useNmea()
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

// 卫星数目（NSat）视图相关：滚动历史，参考 RTKLIB rtkplot 的 NSat 图
const nsatChartRef = ref(null)
const nsatChartInstance = ref(null)
let nsatResizeObserver = null
const NSAT_SAMPLE_INTERVAL_MS = 1000
const NSAT_MAX_SAMPLES = 600 // 1s 采样，保留最近约 10 分钟
// 卫星总数超过该阈值时关闭柱顶数字标签，避免拥挤；悬停时由 tooltip 显示具体数值
const NSAT_LABEL_COL_THRESHOLD = 40
// 滑窗：仅显示最新 N 个时刻的卫星数目（写死为 40）
const NSAT_WINDOW_SIZE = 40
const nsatHistory = ref([])
// 滑窗开关：开启时仅显示最新 NSAT_WINDOW_SIZE 个时刻，关闭时显示全部历史
const nsatSlidingWindow = ref(true)
let nsatSampleTimer = null
let lastNsatGpsTime = null // 上次采样使用的 GPS 时间字符串，未变化则跳过采样
// 清除标记：清除历史后置为 true，sampleNsat 检测到时将当前 GPS 时间记为基准，
// 直到 GPS 时间真正变化（下一秒）才采样新数据，避免清除后立即绘出当前时刻数据
let nsatCleared = false
// 增量更新状态：记录当前图表中已渲染的可见数据范围与 z 排序，
// 避免每秒全量 setOption 重设所有 series 数据
let nsatRenderedWindow = { start: -1, count: 0 } // 当前图表渲染的 nsatHistory 切片范围
let nsatLastZOrder = '' // 上次 z 排序的星座序列（序列变化时才需更新 z）

// NSat 视图“总数”折线配置（不放入堆叠）
const NSAT_TOTAL_SERIES_NAME = '总数'

// 将 GPS/UTC 时间字符串（如 "2023/7/3 9:12:23"）格式化为 HH:mm:ss，解析失败返回 null
function formatNsatGpsTime(raw) {
  if (!raw) return null
  const match = String(raw).match(/(\d{1,2}):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\s*$/)
  if (!match) return null
  const pad = n => String(n).padStart(2, '0')
  return `${pad(Number(match[1]))}:${pad(Number(match[2]))}:${pad(Math.floor(Number(match[3])))}`
}

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

// NSat 视图参与统计的星座（未知星座归入 OTHER）
const nsatConstellations = ['GPS', 'GLONASS', 'BEIDOU', 'GALILEO', 'QZSS', 'OTHER']

// NSat 视图星座配色（在柱状图配色基础上补充 QZSS）
const nsatColors = {
  ...constellationColors,
  QZSS: '#722ed1'
}

// 星座标识映射（用于柱状图 X 轴标签，如 G20、C12）
const constellationPrefixes = {
  GPS: 'G',
  GLONASS: 'R',
  GALILEO: 'E',
  BEIDOU: 'C',
  QZSS: 'J',
  OTHER: 'U',
  UNKNOWN: 'U'
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
  if (snr <= 0) return 'danger'
  if (snr >= 45) return 'success'
  if (snr >= 35) return 'primary'
  if (snr >= 25) return 'warning'
  return 'danger'
}

// 获取状态文本
function getStatusText(snr) {
  if (snr <= 0) return '无效'
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
    chartInstance.value = echarts.init(chartRef.value, null, { renderer: 'canvas' })
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
  const categoryData = data.map(sat => `${constellationPrefixes[sat.constellation] || 'U'}${sat.prn}`)
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

// 采样一次各星座可见卫星数并追加到滚动历史
function sampleNsat() {
  if (document.hidden) return

  // X 轴标签统一使用 NMEA 解析出的 GPS/UTC 时间，与位置图保持一致；
  // GPS 时间未变化时跳过本次采样，避免无数据时堆积重复点；
  // GPS 时间暂缺时同样跳过，不回退本地时间，保证横轴始终为 NMEA 时间
  const rawGpsTime = currentData.value ? currentData.value.time : null
  if (!rawGpsTime) return
  // 清除后首次采样：将当前 GPS 时间记为基准，跳过本次采样，
  // 直到 GPS 时间真正变化（下一秒）才采样新数据
  if (nsatCleared) {
    lastNsatGpsTime = rawGpsTime
    nsatCleared = false
    return
  }
  if (rawGpsTime === lastNsatGpsTime) return
  const timeLabel = formatNsatGpsTime(rawGpsTime)
  if (!timeLabel) return
  lastNsatGpsTime = rawGpsTime

  const counts = {}
  for (const name of nsatConstellations) counts[name] = 0
  for (const sat of satelliteSnrData.value) {
    const name = nsatConstellations.includes(sat.constellation) ? sat.constellation : 'OTHER'
    counts[name]++
  }

  nsatHistory.value.push({
    time: timeLabel,
    counts
  })
  if (nsatHistory.value.length > NSAT_MAX_SAMPLES) {
    nsatHistory.value.splice(0, nsatHistory.value.length - NSAT_MAX_SAMPLES)
  }

  if (currentView.value === 'nsat') {
    updateNsatChart()
  }
}

// 设置 NSat 图表的 ResizeObserver
function setupNsatResizeObserver() {
  if (!nsatChartRef.value || typeof ResizeObserver === 'undefined') return

  if (nsatResizeObserver) {
    nsatResizeObserver.disconnect()
    nsatResizeObserver = null
  }

  nsatResizeObserver = new ResizeObserver(() => {
    nextTick(() => {
      if (nsatChartInstance.value) {
        try {
          nsatChartInstance.value.resize()
        } catch (error) {
          // 图表调整大小失败不影响正常使用，静默处理
        }
      }
    })
  })

  const parentElement = nsatChartRef.value.parentElement
  if (parentElement) {
    nsatResizeObserver.observe(parentElement)
  }
}

// 初始化 NSat 图表（各星座重叠的柱状图）
function initNsatChart() {
  if (!nsatChartRef.value) return

  if (nsatChartInstance.value) {
    nsatChartInstance.value.dispose()
    nsatChartInstance.value = null
  }

  setupNsatResizeObserver()

  nextTick(() => {
    // canvas 渲染器：重叠柱状图(barGap:'-100%')下 tooltip 能正确命中所有 series，
    // 且大量数据点(600×6)时性能远优于 SVG
    nsatChartInstance.value = echarts.init(nsatChartRef.value, null, { renderer: 'canvas' })
    const colors = chartTheme.value

    const option = {
      tooltip: {
        trigger: 'axis',
        // canvas 渲染器下，cross 指示器能可靠命中所有重叠 series，确保 tooltip 包含卫星总数
        axisPointer: {
          type: 'cross',
          crossStyle: {
            color: colors.border
          },
          // 卫星数目为整数，Y 轴指示器标签格式化为整数，避免出现小数
          label: {
            precision: 0
          }
        },
        // 限制 tooltip 在容器内，避免溢出被裁剪
        confine: true,
        formatter: function (params) {
          const list = Array.isArray(params) ? params : [params]
          if (!list.length) return ''
          const axisValue = list[0].axisValue
          // 直接从 nsatHistory 按 X 轴标签查找对应采样，确保总数可靠：
          // trigger:'axis' 在重叠柱状图(barGap:'-100%')下可能不返回所有 series，
          // 导致 totalParam 缺失或各星座累加不完整
          const sample = nsatHistory.value.find(s => s.time === axisValue)
          let total = 0
          if (sample) {
            total = nsatConstellations.reduce((sum, name) => sum + (sample.counts[name] || 0), 0)
          } else {
            // 兜底：从 params 累加各星座柱状值
            const bars = list.filter(p => p.seriesName !== NSAT_TOTAL_SERIES_NAME)
            for (const p of bars) total += (p.value || 0)
          }
          // 各星座明细行：优先使用 sample 中的值，保证与总数一致
          const bars = list.filter(p => p.seriesName !== NSAT_TOTAL_SERIES_NAME)
          const rows = nsatConstellations.map(name => {
            const value = sample ? (sample.counts[name] || 0) : (bars.find(p => p.seriesName === name)?.value || 0)
            if (value <= 0) return ''
            return `
              <div style="display: flex; align-items: center; margin-bottom: 4px;">
                <div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${nsatColors[name]}; margin-right: 8px;"></div>
                <span style="width: 80px; color: ${colors.textMuted};">${name}</span>
                <span style="font-weight: bold;">${value}</span>
              </div>
            `
          }).join('')
          return `
            <div style="background-color: ${colors.surface}; border: 1px solid ${colors.border}; border-radius: 8px; padding: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.24); min-width: 150px; text-align: left; color: ${colors.text};">
              <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid ${colors.border};">
                ${axisValue}
              </div>
              ${rows}
              <div style="display: flex; margin-top: 6px; padding-top: 6px; border-top: 1px solid ${colors.border};">
                <span style="width: 98px; color: ${colors.textMuted};">卫星总数</span>
                <span style="font-weight: bold;">${total}</span>
              </div>
            </div>
          `
        },
        backgroundColor: 'transparent',
        borderWidth: 0,
        padding: 0
      },
      legend: {
        data: [...nsatConstellations, NSAT_TOTAL_SERIES_NAME],
        top: 0,
        textStyle: {
          color: colors.textMuted,
          fontSize: 12
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '8%',
        top: '14%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: [],
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
          show: false
        }
      },
      yAxis: {
        type: 'value',
        min: 0,
        minInterval: 1,
        name: '卫星数',
        nameTextStyle: {
          color: colors.text
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
      series: [
        ...nsatConstellations.map(name => ({
          name,
          type: 'bar',
          // 各星座独立从 0 起绘制并通过 barGap:'-100%' 完全重叠，不再堆叠：
          // 每根柱子的高度即该星座自身的卫星数。卫星数最多的星座置于底层
          // （最小 z，最先绘制），其余按数量递减叠加在前，保证所有柱子的顶端均可见。
          // z 在 updateNsatChart 中按最新采样动态分配。
          // label.show 在 updateNsatChart 中按数据密度动态切换，
          // 数据较多时关闭柱顶数字避免拥挤，悬停时由 tooltip 显示具体数值。
          barGap: '-100%',
          data: [],
          barMaxWidth: 20,
          z: 2,
          itemStyle: {
            color: nsatColors[name]
          },
          label: {
            show: true,
            position: 'top',
            fontSize: 10,
            color: '#fff',
            textBorderColor: 'rgba(0, 0, 0, 0.65)',
            textBorderWidth: 2,
            formatter: (params) => (params.value > 0 ? String(params.value) : '')
          },
          emphasis: {
            focus: 'series'
          }
        })),
        {
          name: NSAT_TOTAL_SERIES_NAME,
          type: 'line',
          // 总数折线不平滑，置于最上层
          data: [],
          z: 100,
          symbol: 'none',
          lineStyle: {
            width: 2.5,
            color: colors.text
          },
          itemStyle: {
            color: colors.text
          },
          emphasis: {
            focus: 'series'
          }
        }
      ],
      animation: false
    }

    nsatChartInstance.value.setOption(option)
    // 图表重建后重置增量状态，确保首次 updateNsatChart 全量渲染
    nsatRenderedWindow = { start: -1, count: 0 }
    nsatLastZOrder = ''
    updateNsatChart()
  })
}

// 清除 NSat 卫星数目历史（仅清除本视图的滚动历史，不影响其它 NMEA 数据）
function clearNsatHistory() {
  nsatHistory.value = []
  lastNsatGpsTime = null
  // 设置清除标记：下次 sampleNsat 将当前 GPS 时间记为基准并跳过，
  // 避免清除后立即采样新数据并绘制
  nsatCleared = true
  // 重置增量更新状态，下次 updateNsatChart 将全量重建
  nsatRenderedWindow = { start: -1, count: 0 }
  nsatLastZOrder = ''
  if (nsatChartInstance.value) {
    nsatChartInstance.value.dispatchAction({ type: 'hideTip' })
    nsatChartInstance.value.setOption({
      xAxis: { data: [] },
      series: [
        ...nsatConstellations.map(name => ({ name, data: [] })),
        { name: NSAT_TOTAL_SERIES_NAME, data: [] }
      ]
    })
  }
}

// 切换滑窗：开启时仅显示最新 NSAT_WINDOW_SIZE 个时刻，关闭时显示全部历史
function toggleNsatSlidingWindow() {
  nsatSlidingWindow.value = !nsatSlidingWindow.value
  // 切换模式时重置增量状态，强制全量重建
  nsatRenderedWindow = { start: -1, count: 0 }
  updateNsatChart()
}

// 更新 NSat 图表数据（增量优化：滑窗模式下仅追加新数据点，不全量重设）
function updateNsatChart() {
  if (!nsatChartInstance.value) return
  if (document.hidden) return

  const colors = chartTheme.value
  const history = nsatHistory.value
  const historyLen = history.length

  if (historyLen === 0) {
    // 无数据时清空图表
    nsatRenderedWindow = { start: -1, count: 0 }
    nsatChartInstance.value.setOption({
      xAxis: { data: [] },
      series: [
        ...nsatConstellations.map(name => ({ name, data: [] })),
        { name: NSAT_TOTAL_SERIES_NAME, data: [] }
      ]
    })
    return
  }

  // 滑窗：开启时仅显示最新 NSAT_WINDOW_SIZE 个时刻，关闭时显示全部历史
  const windowSize = nsatSlidingWindow.value
    ? Math.max(1, Math.min(NSAT_WINDOW_SIZE, historyLen))
    : historyLen
  const visibleStart = historyLen - windowSize
  const visibleEnd = historyLen
  const visible = history.slice(visibleStart, visibleEnd)

  // 计算最新采样的 z 排序
  const latest = visible[visible.length - 1]
  const ordered = [...nsatConstellations].sort((a, b) => {
    const ca = latest.counts[a] || 0
    const cb = latest.counts[b] || 0
    return cb - ca
  })
  const zOrderKey = ordered.join(',')
  const zChanged = zOrderKey !== nsatLastZOrder
  const zMap = {}
  ordered.forEach((name, idx) => { zMap[name] = 2 + idx })

  // 显示列数 ≤ 阈值时显示柱顶数字；超过则关闭，悬停时由 tooltip 显示具体数值
  const showLabels = visible.length <= NSAT_LABEL_COL_THRESHOLD
  const largeMode = !showLabels

  // 增量更新判断：
  // 滑窗模式下，若窗口已满且仅新增 1 个采样，只需 shift 最旧数据 + append 新数据，
  // 无需全量重建 series.data
  const renderedStart = nsatRenderedWindow.start
  const renderedCount = nsatRenderedWindow.count
  const canAppend = nsatSlidingWindow.value
    && renderedStart >= 0
    && renderedCount === windowSize
    && visibleStart === renderedStart + 1 // 窗口整体右移 1
    && !zChanged
    && visible.length === windowSize

  if (canAppend) {
    // 增量更新：取出最旧时间标签移除，追加新时间标签
    const oldTime = history[renderedStart].time
    const newTime = latest.time
    // shift + append X 轴数据
    const currentTimes = nsatChartInstance.value.getOption().xAxis[0].data
    currentTimes.shift()
    currentTimes.push(newTime)

    // 各星座 series：shift 旧值 + append 新值
    const seriesUpdates = nsatConstellations.map(name => ({
      name,
      data: (() => {
        const arr = nsatChartInstance.value.getOption().series.find(s => s.name === name)?.data ?? []
        arr.shift()
        arr.push(latest.counts[name] || 0)
        return arr
      })(),
    }))
    // 总数折线
    const newTotal = nsatConstellations.reduce((sum, name) => sum + (latest.counts[name] || 0), 0)
    const totalArr = nsatChartInstance.value.getOption().series.find(s => s.name === NSAT_TOTAL_SERIES_NAME)?.data ?? []
    totalArr.shift()
    totalArr.push(newTotal)

    nsatChartInstance.value.setOption({
      xAxis: { data: currentTimes },
      series: [...seriesUpdates, { name: NSAT_TOTAL_SERIES_NAME, data: totalArr }]
    }, { replace: false })
    nsatRenderedWindow = { start: visibleStart, count: windowSize }
    return
  }

  // 全量更新：首次渲染、窗口大小变化、z 排序变化、清除/切换滑窗时走此路径
  const times = visible.map(sample => sample.time)
  nsatChartInstance.value.dispatchAction({ type: 'hideTip' })
  nsatChartInstance.value.setOption({
    xAxis: { data: times },
    series: [
      ...nsatConstellations.map(name => ({
        name,
        data: visible.map(sample => sample.counts[name] || 0),
        z: zMap[name],
        large: largeMode,
        label: { show: showLabels }
      })),
      {
        name: NSAT_TOTAL_SERIES_NAME,
        data: visible.map(sample =>
          nsatConstellations.reduce((sum, name) => sum + (sample.counts[name] || 0), 0)
        ),
        z: 100,
        // 总数折线上方显示数字标签，与柱状图标签同步开关
        label: {
          show: showLabels,
          position: 'top',
          fontSize: 11,
          fontWeight: 'bold',
          color: colors.text,
          textBorderColor: colors.surface,
          textBorderWidth: 2,
          formatter: (params) => (params.value > 0 ? String(params.value) : '')
        }
      }
    ]
  })
  nsatRenderedWindow = { start: visibleStart, count: windowSize }
  nsatLastZOrder = zOrderKey
}

// 监听数据变化
watch(satelliteSnrData, () => {
  scheduleDataUpdate()
})

// 监听星座过滤变化
watch(constellationFilter, () => {
  updateChart()
})

// 监听视图切换：切换到对应图表时初始化或更新
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
  } else if (view === 'nsat') {
    nextTick(() => {
      if (!nsatChartInstance.value) {
        initNsatChart()
      } else {
        nsatChartInstance.value.resize()
        updateNsatChart()
      }
    })
  }
})

// 监听主题变化
watch(resolvedTheme, () => {
  if (currentView.value === 'chart') {
    initChart()
  } else if (currentView.value === 'nsat') {
    initNsatChart()
  }
})

// 组件挂载时
onMounted(() => {
  nsatSampleTimer = window.setInterval(sampleNsat, NSAT_SAMPLE_INTERVAL_MS)

  setTimeout(() => {
    if (currentView.value === 'chart') {
      initChart()
    } else if (currentView.value === 'nsat') {
      initNsatChart()
    }
  }, 100)
})

// 组件卸载时
onUnmounted(() => {
  if (dataUpdateTimer !== null) {
    clearTimeout(dataUpdateTimer)
    dataUpdateTimer = null
  }

  if (nsatSampleTimer !== null) {
    clearInterval(nsatSampleTimer)
    nsatSampleTimer = null
  }

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  if (nsatResizeObserver) {
    nsatResizeObserver.disconnect()
    nsatResizeObserver = null
  }

  if (chartInstance.value) {
    chartInstance.value.dispose()
    chartInstance.value = null
  }

  if (nsatChartInstance.value) {
    nsatChartInstance.value.dispose()
    nsatChartInstance.value = null
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

.nsat-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.nsat-window-btn,
.nsat-clear-btn {
  display: flex;
  align-items: center;
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

.nsat-chart-container {
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
