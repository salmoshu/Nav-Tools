<template>
  <div class="gnss-sky-container" ref="containerRef" :class="{ 'is-narrow': isNarrow }">
    <aside
      v-show="panelOpen"
      class="control-panel"
      :class="{ drawer: isNarrow }"
    >
      <div class="panel-header">
        <span class="panel-title">控制面板</span>
        <button
          class="icon-btn collapse-btn"
          type="button"
          @click="collapsePanel"
          :title="isNarrow ? '关闭面板' : '折叠面板'"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>

      <div class="controls">
        <div class="control-group">
          <span class="control-label">视图模式</span>
          <el-select v-model="viewMode" @change="applyViewMode" size="default" class="view-mode-select">
            <el-option label="星座视图" value="constellation" />
            <el-option label="SNR 视图" value="snr" />
            <el-option label="仰角视图" value="elevation" />
          </el-select>
        </div>

        <div class="control-group">
          <span class="control-label">星座过滤</span>
          <el-select v-model="constellationFilter" @change="updateChartData" size="default" class="constellation-select">
            <el-option label="所有星座" value="all" />
            <el-option label="GPS" value="GPS" />
            <el-option label="GLONASS" value="GLONASS" />
            <el-option label="GALILEO" value="GALILEO" />
            <el-option label="BeiDou" value="BEIDOU" />
            <el-option label="QZSS" value="QZSS" />
          </el-select>
        </div>

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

        <div v-if="viewMode === 'constellation'" class="constellation-legend">
          <span class="control-label">星座图例</span>
          <div class="legend-items">
            <div v-for="(color, name) in constellationColors" :key="name" class="legend-item">
              <span class="legend-dot" :style="{ backgroundColor: color }"></span>
              <span class="legend-name">{{ name }}</span>
            </div>
          </div>
        </div>

        <div v-else-if="viewMode === 'snr'" class="mode-hint">
          <span class="control-label">颜色 / 大小 = SNR (0–60 dB)</span>
          <div class="gradient-bar snr-gradient"></div>
          <div class="gradient-labels">
            <span>低</span>
            <span>高</span>
          </div>
        </div>

        <div v-else-if="viewMode === 'elevation'" class="mode-hint">
          <span class="control-label">颜色 = 仰角 (0–90°)</span>
          <div class="gradient-bar elevation-gradient"></div>
          <div class="gradient-labels">
            <span>低</span>
            <span>高</span>
          </div>
        </div>
      </div>
    </aside>

    <div
      v-if="panelOpen && isNarrow"
      class="panel-backdrop"
      @click="collapsePanel"
    ></div>

    <div class="chart-area">
      <button
        v-if="!panelOpen"
        class="icon-btn expand-btn"
        type="button"
        @click="expandPanel"
        title="展开面板"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div class="sky-chart" ref="chartRef"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, shallowRef, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useNmea } from '@/composables/gnss/useNmea'
import { useTheme } from '@/composables/useTheme'

// 获取卫星数据
const { satelliteSnrData } = useNmea()
const { chartTheme, resolvedTheme } = useTheme()

// 组件状态
const containerRef = ref(null)
const chartRef = ref(null)
// echarts 实例必须用 shallowRef 持有：普通 ref 会深度响应式化实例，
// 导致 echarts 内部对象被 Vue 代理、身份比较失效（findAxisModel 找不到轴模型），
// resize() 在 polar 重建坐标系时抛 "Cannot read properties of undefined (reading 'get')"，
// 最终表现为窗口调整后图表停留在左上角旧尺寸不铺满（apache/echarts#16642 同类问题）
const chartInstance = shallowRef(null)
const viewMode = ref('constellation')
const constellationFilter = ref('all')
const satelliteSize = ref(25)
const minSizeForLabel = 20
// 添加仰角限制状态，默认15°
const elevationLimit = ref(15)

// 控制面板折叠状态
const panelOpen = ref(true)
const isNarrow = ref(false)
// 容器宽度低于该阈值时视为“小窗”，面板自动折叠为抽屉
const NARROW_THRESHOLD = 640
// 用于合并连续的 resize 请求，避免布局抖动
let resizeRaf = null

function collapsePanel() {
  panelOpen.value = false
}

function expandPanel() {
  panelOpen.value = true
}

// 在下一帧统一触发图表 resize，避免 ResizeObserver 高频回调造成抖动
function scheduleResize() {
  if (resizeRaf) cancelAnimationFrame(resizeRaf)
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = null
    if (!chartInstance.value) return
    try {
      // 先更新 SVG 视口尺寸
      chartInstance.value.resize()
    } catch (error) {
      // resize 失败不阻塞后续重绘
    }
    try {
      // SVG 渲染器下 resize() 只更新视口的像素宽高，不会重排图表内容；
      // 必须再通过 setOption 重新渲染，否则最大化 / 拉伸窗口后极坐标准星图
      // 仍停留在左上角的旧尺寸（不铺满、不居中）。即使暂停或数据为空，
      // 重新应用 series 也会让坐标轴与网格按新尺寸重新布局并居中。
      updateChartData()
    } catch (error) {
      // 图表调整大小失败不会影响正常使用，静默处理
    }
  })
}

// 用于存储需要在组件卸载时执行的清理函数
const cleanupFunctions = []
let resizeObserver = null
let dataUpdateTimer = null
const DATA_UPDATE_INTERVAL_MS = 200

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

// 设置ResizeObserver监控容器尺寸变化
function setupResizeObserver() {
  if (!containerRef.value || !chartRef.value) return

  // 清理之前的ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect()
  }

  resizeObserver = new ResizeObserver(() => {
    const el = containerRef.value
    if (!el) return

    const narrow = el.clientWidth <= NARROW_THRESHOLD
    // 窗口变窄进入小屏时自动折叠面板（只折叠、不自动展开，避免来回跳动）
    if (narrow && !isNarrow.value) {
      panelOpen.value = false
    }
    isNarrow.value = narrow

    // 图表元素尺寸变化（最大化 / 拉伸窗口 / 面板折叠 / 停靠布局变化）时重新铺满
    scheduleResize()
  })

  // 直接观察图表元素本身：其尺寸在窗口拉伸、面板开合、停靠尺寸变化时都会改变，
  // 比观察外层容器更可靠（外层容器带 container-type 时 ResizeObserver 行为不稳定）
  resizeObserver.observe(chartRef.value)
}

// 初始化图表
function initChart() {
  // 确保先清理可能存在的实例
  if (chartInstance.value) {
    chartInstance.value.dispose()
    chartInstance.value = null
  }

  if (chartRef.value) {
    // 设置ResizeObserver监听容器尺寸变化（仅触发resize，不随数据刷新重算）
    setupResizeObserver()

    chartInstance.value = echarts.init(chartRef.value, null, { renderer: 'svg' })
    // e2e 测试钩子：仅开发模式暴露实例，用于断言极坐标布局（生产构建会被消除）
    if (import.meta.env.DEV) window.__gnssSkyChart = chartInstance.value
    const colors = chartTheme.value

    // 设置图表选项
    const option = {
      tooltip: {
        trigger: 'item',
        formatter: function(params) {
          const data = params.data
          const prefix = constellationPrefixes[data.constellation] || 'U'
          const color = constellationColors[data.constellation] || '#757575'
          return `
            <div style="background-color: ${colors.surface}; border: 1px solid ${colors.border}; border-radius: 8px; padding: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.24); min-width: 100px; text-align: left; color: ${colors.text};">
              <div style="font-size: 16px; font-weight: bold; color: ${colors.text}; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid ${colors.border};">
                <div style="display: flex; align-items: center; margin-bottom: 5px;">
                  <div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${color}; margin-right: 8px;"></div>
                  <span style="color: ${colors.text};">${data.constellation}</span>
                  <span style="color: ${colors.textMuted};">(${prefix}${data.prn})</span>
                </div>
              </div>
              <div style="display: flex; margin-bottom: 5px;">
                <span style="font-weight: 500; width: 68px; color: ${colors.textMuted};">仰角:</span>
                <span style="color: ${colors.text};">${data.elevation}°</span>
              </div>
              <div style="display: flex; margin-bottom: 5px;">
                <span style="font-weight: 500; width: 68px; color: ${colors.textMuted};">方位角:</span>
                <span style="color: ${colors.text};">${data.azimuth}°</span>
              </div>
              <div style="display: flex;">
                <span style="font-weight: 500; width: 68px; color: ${colors.textMuted};">SNR:</span>
                <span style="color: ${colors.text};">${data.snr} dB</span>
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
          textStyle: { color: colors.text }
        }],
        bottom: 10,
        show: false,
      },
      polar: {
        radius: '85%',
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
          color: colors.textMuted,
          fontSize: 12
        },
        splitLine: {
          lineStyle: {
            color: colors.grid
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
          color: colors.textMuted,
          fontSize: 12
        },
        splitLine: {
          lineStyle: {
            color: colors.grid
          }
        },
        splitArea: {
          show: true,
          areaStyle: {
            color: [colors.background, colors.surfaceMuted]
          }
        }
      },
      series: [{
        name: 'sky view',
        type: 'scatter',
        coordinateSystem: 'polar',
        data: [],
        animation: false
      }],
      visualMap: [],
      animation: false
    }

    chartInstance.value.setOption(option)
    applyViewMode()
    updateChartData()
  }
}

// 根据当前视图模式构造 visualMap（仅在模式切换时替换）
function buildVisualMap(colors) {
  if (viewMode.value === 'constellation') {
    return []
  }

  const common = {
    type: 'continuous',
    calculable: true,
    orient: 'horizontal',
    left: 'center',
    bottom: 10,
    itemWidth: 12,
    itemHeight: 100,
    textStyle: { color: colors.text, fontSize: 11 },
    show: true
  }

  if (viewMode.value === 'snr') {
    return [{
      ...common,
      dimension: 2,
      min: 0,
      max: 60,
      inRange: {
        color: ['#d73027', '#fc8d59', '#fee08b', '#d9ef8b', '#91cf60', '#1a9850']
      },
      text: ['高 SNR', '低 SNR']
    }]
  }

  if (viewMode.value === 'elevation') {
    return [{
      ...common,
      dimension: 0,
      min: 0,
      max: 90,
      inRange: {
        color: ['#313695', '#4575b4', '#74add1', '#fee090', '#f46d43', '#d73027']
      },
      text: ['高 仰角', '低 仰角']
    }]
  }

  return []
}

// 构造散点序列配置
function buildSeriesOption(polarData, colors) {
  const isConstellation = viewMode.value === 'constellation'

  return {
    name: 'sky view',
    type: 'scatter',
    coordinateSystem: 'polar',
    data: polarData,
    symbolSize: function(value, params) {
      let size = satelliteSize.value
      if (viewMode.value === 'snr') {
        const scale = Math.min(1, Math.max(0, params.data.snr / 60))
        size = Math.max(8, satelliteSize.value * (0.5 + 0.5 * scale))
      }
      // 极小的索引增量用于在标签重叠时让后绘制的卫星标签优先显示
      return size + params.dataIndex * 0.001
    },
    label: {
      show: satelliteSize.value >= minSizeForLabel,
      position: 'inside',
      width: satelliteSize.value,
      height: satelliteSize.value,
      align: 'center',
      verticalAlign: 'middle',
      formatter: function(params) {
        const prefix = constellationPrefixes[params.data.constellation] || 'U'
        return `${prefix}${params.data.prn}`
      },
      color: colors.text,
      fontSize: Math.max(6, satelliteSize.value / 3),
    },
    labelLayout: {
      hideOverlap: true,
    },
    itemStyle: {
      ...(isConstellation && {
        color: function(params) {
          return constellationColors[params.data.constellation] || '#757575'
        }
      }),
      borderColor: colors.background,
      borderWidth: 1,
      opacity: 1.0
    },
    emphasis: {
      scale: true,
      scaleSize: 6,
      itemStyle: {
        shadowBlur: 10,
        shadowColor: 'rgba(0, 0, 0, 0.3)'
      },
      label: {
        show: true,
        fontSize: 12,
        fontWeight: 700,
      }
    },
    animation: false
  }
}

// 应用视图模式：更新 visualMap 并刷新序列样式
function applyViewMode() {
  if (!chartInstance.value) return
  const colors = chartTheme.value

  chartInstance.value.setOption({
    visualMap: buildVisualMap(colors)
  }, { replaceMerge: ['visualMap'] })

  updateChartData()
}

// 更新图表数据（不触发任何容器resize或axis范围重算）
function updateChartData() {
  if (!chartInstance.value) return
  if (document.hidden) return

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

  // 转换为极坐标数据格式 [仰角, 方位角, SNR]
  const polarData = uniqueData.map(sat => ({
    value: [sat.elevation, sat.azimuth, sat.snr],
    prn: sat.prn,
    constellation: sat.constellation,
    elevation: sat.elevation,
    azimuth: sat.azimuth,
    snr: sat.snr
  }))

  const colors = chartTheme.value

  // setOption 重建 series 会打断 tooltip 隐藏逻辑，先强制隐藏避免滞留
  chartInstance.value.dispatchAction({ type: 'hideTip' })
  chartInstance.value.setOption({
    series: [buildSeriesOption(polarData, colors)]
  }, { replaceMerge: ['series'] })
}

function scheduleDataUpdate() {
  if (dataUpdateTimer !== null) return
  dataUpdateTimer = window.setTimeout(() => {
    dataUpdateTimer = null
    updateChartData()
  }, DATA_UPDATE_INTERVAL_MS)
}

// 监听卫星大小变化
watch(satelliteSize, () => {
  updateChartData()
})

// 监听仰角限制变化
watch(elevationLimit, () => {
  updateChartData()
})

// 监听视图模式变化
watch(viewMode, () => {
  applyViewMode()
})

// 监听卫星数据变化
watch(satelliteSnrData, () => {
  scheduleDataUpdate()
})

watch(resolvedTheme, () => initChart())

// 面板开合会改变图表可用宽度（宽屏侧边栏模式），需等 DOM 更新后重新计算尺寸
watch(panelOpen, () => {
  nextTick(() => scheduleResize())
})

// 组件挂载时
onMounted(() => {
  // 兜底：窗口（最大化 / 拉伸主窗口）尺寸变化时强制重算图表，
  // 与 ResizeObserver 互补，确保停止播放后拉伸窗口也能铺满并居中
  window.addEventListener('resize', scheduleResize)
  setTimeout(() => {
    initChart()
  }, 100)
})

// 组件卸载时
onUnmounted(() => {
  if (dataUpdateTimer !== null) {
    clearTimeout(dataUpdateTimer)
    dataUpdateTimer = null
  }

  // 取消尚未执行的 resize 帧
  if (resizeRaf !== null) {
    cancelAnimationFrame(resizeRaf)
    resizeRaf = null
  }

  window.removeEventListener('resize', scheduleResize)
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
  color: var(--app-text);
  background: var(--app-surface);
  position: relative;
  container-type: inline-size;
}

.control-panel {
  flex: 0 0 auto;
  width: min(260px, 30%);
  padding: 16px;
  border-right: 2px solid var(--app-border);
  display: flex;
  flex-direction: column;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  overflow-y: auto;
  background: var(--app-surface);
  z-index: 5;
}

/* 小窗模式下面板变为抽屉，浮在图表之上，不占用布局宽度 */
.control-panel.drawer {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: min(300px, 80%);
  max-width: 80%;
  border-right: 2px solid var(--app-border);
  box-shadow: 4px 0 16px rgba(0, 0, 0, 0.18);
  z-index: 20;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-surface-raised);
  color: var(--app-text);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.icon-btn:hover {
  background: rgba(64, 158, 255, 0.1);
  border-color: #409EFF;
}

.icon-btn svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 抽屉展开时的半透明遮罩，点击可关闭面板 */
.panel-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  z-index: 10;
}

.chart-area {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.expand-btn {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 15;
  width: 34px;
  height: 34px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.sky-chart {
  flex: 1;
  width: 100%;
  min-height: 0px;
  padding: 0;
  background-color: var(--app-surface);
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.control-group {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.control-label {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text);
}

.satellite-size-control,
.elevation-limit-control {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0;
}

.satellite-size-control span,
.elevation-limit-control span {
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 500;
  color: var(--app-text);
}

.constellation-legend {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend-items {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px 10px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--app-text);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid var(--app-border);
}

.mode-hint {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gradient-bar {
  height: 10px;
  border-radius: 5px;
  border: 1px solid var(--app-border);
}

.snr-gradient {
  background: linear-gradient(to right, #d73027, #fc8d59, #fee08b, #d9ef8b, #91cf60, #1a9850);
}

.elevation-gradient {
  background: linear-gradient(to right, #313695, #4575b4, #74add1, #fee090, #f46d43, #d73027);
}

.gradient-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--app-text-muted);
}

/* 滑块样式 */
:deep(.el-slider) {
  --el-slider-height: 5px; /* 轨道高度 */
  --el-slider-button-size: 22px; /* 滑块按钮大小，适合 SVG 图标 */
}

:deep(.el-slider__runway) {
  background-color: var(--app-border);
  border-radius: 4px;
}

:deep(.el-slider__bar) {
  background: #6E6E6E;
  border-radius: 4px;
}

:deep(.el-slider__button) {
  width: var(--el-slider-button-size);
  height: var(--el-slider-button-size);
  background-image: url("data:image/svg+xml;charset=utf-8;base64,PHN2ZyBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHN0eWxlPSJoZWlnaHQ6IDE2cHg7IHdpZHRoOiAxNnB4OyI+PHBhdGggZD0iTTUxMiA2NGE0NDggNDQ4IDAgMCAxIDEzMC4yNCAxOS4yMzJjLTM3LjQwOCAxNDIuNzItMTUuMDQgMjM0LjQgNzUuODQgMjY0LjcwNGwxNy4yOCA1Ljg4OCAxNi40OCA1Ljg4OGMxMDUuNTM2IDM4Ljk3NiAxMjkuMzc2IDcxLjc0NCAxMDQuNjQgMTQ1Ljk4NC0xMS4yIDMzLjYtMzQuOTQ0IDQ5LjgyNC0xMDEuNjk2IDczLjE1MmwtMzUuODQgMTIuMjI0LTE3LjQ0IDYuMzA0Yy03Mi40NDggMjcuMTA0LTEwNC40MTYgNTIuMTI4LTEyMi41NiAxMDYuNTYtMjYuMTQ0IDc4LjM2OCA4LjY0IDE1My4zNzYgOTguMTc2IDIyNC42MDhBNDQ1Ljc5MiA0NDUuNzkyIDAgMCAxIDUxMiA5NjBjLTMyLjg2NCAwLTY0Ljg5Ni0zLjUyLTk1Ljc0NC0xMC4yNCA1Ni4wOTYtNDMuMDcyIDY2LjA0OC0xMDguOCAyNC44LTE5MS4yOTYtMjYuODgtNTMuNjk2LTY5LjI0OC04My4xMzYtMTI5LjkyLTEwMS4zNDRhNDgwLjk2IDQ4MC45NiAwIDAgMC0xOS43NDQtNS40NGwtMzMuNDA4LTcuOTM2Yy0zNC4yNC04LjEyOC00OC40OC0xMy45NTItNTQuNTI4LTIxLjYzMi02LjQtOC4xNi02LjM2OC0yNS45ODQgNi41OTItNjAuMzJsMi41Ni02LjY1NmM1My44MjQtMTM0LjU2IDE1LjEwNC0yMTkuMDcyLTEwNi40NjQtMjMzLjA4OEMxNzcuNjMyIDE2OS42IDMzMi40OCA2NCA1MTIgNjR6TTgyLjQ2NCAzODQuMjU2Yzg5LjYgMy42NDggMTEwLjYyNCA0My4wNCA3My41MDQgMTQwLjA2NGwtMi43ODQgNy4wNGMtMjMuMDQgNTcuNjk2LTI0LjEyOCA5OS42NDgtMC4wNjQgMTMwLjI3MiAxNy40MDggMjIuMjA4IDM4Ljg0OCAzMS43NzYgODIuNTYgNDIuNTZsMzMuMjggNy44NzJjOS4wMjQgMi4yMDggMTYuNjQgNC4yMjQgMjMuNzc2IDYuMzY4IDQ1LjI0OCAxMy41NjggNzMuMjQ4IDMzLjAyNCA5MS4wNzIgNjguNjcyIDM1LjIgNzAuMzY4IDIxLjQ0IDExMS4zNi01MS44NCAxMzUuMjMyQzE3NC4xNzYgODUzLjAyNCA2NCA2OTUuMzYgNjQgNTEyYzAtNDQuMzg0IDYuNDY0LTg3LjI2NCAxOC40NjQtMTI3Ljc0NHogbTYxOS44MDgtMjc3Ljk1MkM4NTQuNTYgMTc3LjgyNCA5NjAgMzMyLjYwOCA5NjAgNTEyYzAgMTYzLjUyLTg3LjYxNiAzMDYuNjI0LTIxOC40OTYgMzg0LjgzMi04OC4zMi02MS44MjQtMTE5LjY4LTExOS4xNjgtMTAxLjg1Ni0xNzIuNjQgMTEuMTY4LTMzLjUzNiAzNC44OC00OS43NiAxMDEuMzQ0LTczLjAyNGwxNy4xODQtNS44NTZjOTguNzItMzIuODk2IDEzOC4wNDgtNTYuNTEyIDE1OS4wNC0xMTkuMzYgNDIuMTc2LTEyNi41OTItMTUuNTUyLTE4NC4zMi0xNzguODgtMjM4LjcyLTQ3LjItMTUuNzQ0LTYyLjQ5Ni02OS42MzItMzguNzUyLTE3MC4w...");
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

.view-mode-select,
.constellation-select {
  width: 100%;
}

:deep(.el-select) {
  --el-select-border-color: var(--app-border);
  --el-select-font-size: 14px;
}

:deep(.el-select .el-input__wrapper) {
  background-color: var(--app-surface-raised);
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
  color: var(--app-text);
}

:deep(.el-select .el-input__suffix) {
  color: #409EFF;
}

:deep(.el-select-dropdown__item) {
  font-size: 14px;
  color: var(--app-text);
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

@container (max-width: 520px) {
  .controls {
    gap: 12px;
  }
}
</style>
