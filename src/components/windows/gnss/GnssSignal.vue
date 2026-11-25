<template>
  <div class="snr-container">
    <div class="snr-content">
      <div class="view-controls">
        <el-select v-model="currentView" size="small" class="view-select">
          <el-option :label="t('gnss.signal.chartView')" value="chart" />
          <el-option :label="t('gnss.signal.tableView')" value="table" />
          <el-option :label="t('gnss.signal.satCount')" value="nsat" />
          <el-option :label="t('gnss.signal.perSatView')" value="persat" />
        </el-select>

        <el-select v-if="!scopedDisplay" v-show="currentView !== 'persat'" v-model="satelliteScope"
          size="small" class="satellite-scope-select" :aria-label="t('gnss.signal.satelliteScope')">
          <el-option :label="t('gnss.signal.allSatellites')" value="all" />
          <el-option :label="t('gnss.signal.usedSatellites')" value="used" />
        </el-select>

        <el-select
          v-show="currentView === 'chart'"
          v-model="constellationFilter"
          :placeholder="t('gnss.signal.selectConstellation')"
          size="small"
          class="constellation-filter"
        >
          <el-option :label="t('gnss.signal.allConstellations')" value="all" />
          <el-option v-for="{ text, value } in constellationFilters" :key="value" :label="text" :value="value" />
        </el-select>

        <el-select
          v-if="frequencyBands.length"
          v-show="currentView === 'chart'"
          v-model="frequencyBand"
          :aria-label="t('gnss.signal.frequencyBand')"
          size="small"
          class="signal-band-select"
        >
          <el-option :label="t('gnss.signal.strongestSignal')" value="strongest" />
          <el-option v-for="band in frequencyBands" :key="band" :label="band" :value="band" />
        </el-select>

        <el-select
          v-show="currentView === 'persat'"
          v-model="selectedSatKeys"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          :multiple-limit="MAX_PER_SAT_SELECTION"
          :placeholder="t('gnss.signal.selectSatellites')"
          size="small"
          class="persat-select"
        >
          <el-option
            v-for="option in perSatOptions"
            :key="option.key"
            :label="option.label"
            :value="option.key"
          />
        </el-select>

        <!-- NSat 视图：明确选择最近 40 个历元或全部数据 -->
        <el-button-group
          v-show="currentView === 'nsat'"
          class="nsat-window-switch"
          :aria-label="t('gnss.signal.satCount')"
        >
          <el-button
            :type="nsatSlidingWindow ? 'primary' : ''"
            :aria-pressed="nsatSlidingWindow"
            size="small"
            :title="t('gnss.signal.nsatWindowOffTitle')"
            @click="setNsatSlidingWindow(true)"
          >
            <el-icon><Timer /></el-icon>&nbsp;{{ t('gnss.signal.slidingWindow40') }}
          </el-button>
          <el-button
            :type="!nsatSlidingWindow ? 'primary' : ''"
            :aria-pressed="!nsatSlidingWindow"
            size="small"
            :title="t('gnss.signal.nsatWindowOnTitle')"
            @click="setNsatSlidingWindow(false)"
          >
            {{ t('gnss.signal.all') }}
          </el-button>
        </el-button-group>

        <div v-show="currentView === 'nsat'" class="nsat-controls">
          <el-button
            type="primary"
            size="small"
            class="control-btn nsat-reset-btn"
            :aria-label="t('gnss.signal.resetLayout')"
            :title="t('gnss.signal.resetLayout')"
            @click="resetNsatLayout"
          >
            <el-icon><RefreshLeft /></el-icon>
            <span class="control-btn-label">{{ t('gnss.signal.resetLayout') }}</span>
          </el-button>
          <el-button
            type="primary"
            size="small"
            class="control-btn nsat-clear-btn"
            :aria-label="t('gnss.signal.clear')"
            :title="t('gnss.signal.clear')"
            @click="clearNsatHistory"
          >
            <el-icon><Delete /></el-icon>
            <span class="control-btn-label">{{ t('gnss.signal.clear') }}</span>
          </el-button>
        </div>
      </div>

      <div v-if="scopedDisplay?.signals && currentView !== 'nsat'" class="solver-signal-hint">
        {{ t('gnss.signal.solverSatelliteDetails') }}
      </div>

      <div v-show="currentView === 'table'" class="snr-table-container">
        <el-table
          :data="filteredSatelliteData"
          :row-key="row => snrHistoryKey(row.constellation, row.prn)"
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
            :label="t('gnss.signal.colConstellation')"
            width="152"
            label-class-name="constellation-column-header"
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

          <el-table-column prop="prn" label="PRN" min-width="80" sortable />

          <el-table-column prop="snr" :label="t('gnss.signal.colSnr')" min-width="178" sortable>
            <template #default="{ row }">
              <div v-if="row.signals?.length" class="signal-readings">
                <span
                  v-for="signal in row.signals"
                  :key="signal.id"
                  class="signal-reading"
                  :title="signalDescription(signal)"
                >
                  <span>{{ signal.label }}</span>
                  <strong>{{ formatCn0(signal.snr) }}</strong>
                </span>
              </div>
              <div v-else class="snr-cell">
                <el-progress
                  :percentage="Math.min(row.snr, 60) * (100 / 60)"
                  :color="getSnrColor(row.snr)"
                  :stroke-width="10"
                  :show-text="false"
                  style="width: 100px; margin-right: 10px"
                />
                <span :style="{ color: getSnrColor(row.snr) }" class="snr-value">
                  {{ formatCn0(row.snr) }}
                </span>
              </div>
            </template>
          </el-table-column>

          <el-table-column
            prop="elevation"
            :label="t('gnss.signal.colElevation')"
            min-width="106"
            sortable
          >
            <template #default="{ row }">
              <SatelliteAngleIndicator kind="elevation" :value="row.elevation" :known="row.positionKnown" />
            </template>
          </el-table-column>

          <el-table-column
            prop="azimuth"
            :label="t('gnss.signal.colAzimuth')"
            min-width="106"
            sortable
          >
            <template #default="{ row }">
              <SatelliteAngleIndicator kind="azimuth" :value="row.azimuth" :known="row.positionKnown" />
            </template>
          </el-table-column>

          <el-table-column
            prop="timestamp"
            :label="t('gnss.signal.colUpdateTime')"
            min-width="180"
            sortable
          >
            <template #default="{ row }">
              {{ formatTime(row.timestamp) }}
            </template>
          </el-table-column>

          <!-- 不冻结:窄窗横向滚动时随内容一起滚动即可,避免状态列常驻遮挡 -->
          <el-table-column prop="status" :label="t('gnss.signal.colStatus')" min-width="100">
            <template #default="{ row }">
              <el-tag :type="getStatusTagType(row.snr)" size="small">
                {{ getStatusText(row.snr) }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-show="currentView === 'chart'" class="signal-bar-wrapper">
        <div class="signal-bar-scroll">
          <div
            ref="chartRef"
            class="snr-chart-container signal-bar-chart"
            :style="{ minWidth: `${Math.max(260, barLayout.slots.length * 38 + 64)}px` }"
          ></div>
        </div>
        <div v-if="!chartData.length" class="signal-bar-empty">
          {{ t(frequencyBand === 'strongest' ? 'gnss.signal.barEmpty' : 'gnss.signal.bandEmpty') }}
        </div>
        <div class="signal-bar-legend">
          <span
            v-for="group in barLayout.groups"
            :key="group.constellation"
            class="signal-bar-group"
          >
            <i :style="{ background: group.color }"></i>{{ group.constellation
            }}<small>{{ group.count }}</small>
          </span>
          <span class="signal-peak-key" :title="t('gnss.signal.recentPeakHint')"
            ><i></i>{{ t('gnss.signal.recentPeak') }}</span
          >
        </div>
      </div>

      <div
        v-show="currentView === 'persat'"
        class="persat-chart-wrapper"
        @mousedown="handlePerSatMouseDown"
        @contextmenu.prevent
        @dblclick="resetPerSatViewport"
      >
        <div ref="perSatChartRef" class="snr-chart-container persat-chart"></div>
        <div v-if="perSatEmpty" class="persat-empty">
          <div class="persat-empty-title">{{ perSatEmptyTitle }}</div>
          <div class="persat-empty-sub">{{ t('gnss.signal.perSatEmptyHint') }}</div>
        </div>
      </div>

      <SatelliteCountChart
        ref="nsatChartRef"
        v-show="currentView === 'nsat'"
        :active="currentView === 'nsat'"
        :sliding-window="nsatSlidingWindow"
        :used-only="!scopedDisplay && satelliteScope === 'used'"
        class="nsat-chart-container"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, inject, ref, shallowRef, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { Delete, RefreshLeft, Timer } from '@element-plus/icons-vue'
import { useNmea } from '@/composables/gnss/useNmea'
import { gnssDisplayContext } from '@/composables/gnss/GnssDisplayContext'
import { useFileTimeline } from '@/composables/useFileTimeline'
import {
  SnrHistoryStore, SNR_HISTORY_DEFAULT_CAPACITY, snrHistoryKey, signalHistoryKey, formatSnrEpochLabel,
} from '@/core/gnss/SnrHistoryStore'
import { assignSnrSeriesColors } from '@/core/gnss/SnrSeriesColors'
import { buildSignalBarLayout, SIGNAL_CONSTELLATIONS } from '@/core/gnss/SignalBarLayout'
import { SKY_CONSTELLATION_COLORS as constellationColors } from '@/core/gnss/ConstellationColors'
import { useTheme } from '@/composables/useTheme'
import { usePersistentSelection } from '@/composables/usePersistentSelection'
import { t } from '@/i18n'
import SatelliteCountChart from './SatelliteCountChart.vue'
import SatelliteAngleIndicator from './SatelliteAngleIndicator.vue'

// 初始化NMEA解析器与主题
const scopedDisplay = inject(gnssDisplayContext, null)
const nmea = useNmea()
const { satelliteDetailEpochHistory, satelliteDetailEpochIndex, snrHistoryStartIndex } = nmea
const { satelliteSnrData, snrHistory, clearSatelliteEpochHistory, clearSatelliteCountHistory } =
  scopedDisplay?.signals ?? nmea
const fileTimeline = scopedDisplay?.timeline ?? useFileTimeline()
const { chartTheme, resolvedTheme } = useTheme()

// 视图状态
const currentView = usePersistentSelection('gnss-signal:view', 'nsat', [
  'chart',
  'table',
  'nsat',
  'persat',
])
const constellationFilter = ref('all')
const frequencyBand = ref('strongest')
const satelliteScope = usePersistentSelection('gnss-signal:satellite-scope', 'all', ['all', 'used'])

// 图表相关
const chartRef = ref(null)
const chartInstance = shallowRef(null)
let resizeObserver = null
const DATA_UPDATE_INTERVAL_MS = 200
let dataUpdateTimer = null
let themeRefreshRaf = null

// 逐星视图：选中的卫星（constellation-prn 键）与折线图实例
const MAX_PER_SAT_SELECTION = 6
const selectedSatKeys = ref([])
const perSatChartRef = ref(null)
const perSatChartInstance = shallowRef(null)
let perSatResizeObserver = null
let perSatUpdateTimer = null

// 默认展示全部历元；用户也可明确切换到最新 40 个历元。
const nsatSlidingWindow = ref(false)

// Keep the menu based on detected satellites, independent of the selected band or scope.
const constellationFilters = computed(() => {
  const detected = new Set(satelliteSnrData.value.map((satellite) => satellite.constellation))
  return Object.keys(SIGNAL_CONSTELLATIONS)
    .filter((value) => detected.has(value))
    .map((value) => ({ text: value, value }))
})
watch(constellationFilters, (filters) => {
  if (
    constellationFilter.value !== 'all' &&
    !filters.some(({ value }) => value === constellationFilter.value)
  ) {
    constellationFilter.value = 'all'
  }
})

// 星座标识映射（用于柱状图 X 轴标签，如 G20、C12）
const constellationPrefixes = {
  GPS: 'G',
  GLONASS: 'R',
  GALILEO: 'E',
  BEIDOU: 'C',
  QZSS: 'J',
  SBAS: 'S',
  NAVIC: 'I',
  OTHER: 'U',
  UNKNOWN: 'U',
}

// 获取卫星数据（useNmea 已按 constellation-prn 去重，这里只做星座+PRN 排序，
// 避免每次更新都做时间戳解析排序和 Map 去重的重复开销）
function getLatestSatelliteData() {
  const satellites = !scopedDisplay && satelliteScope.value === 'used'
    ? satelliteSnrData.value.filter((satellite) => satellite.usedInFix)
    : satelliteSnrData.value
  return [...satellites].sort((a, b) => {
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

const constellationSamples = computed(() => {
  const samples = filteredSatelliteData.value
  return constellationFilter.value === 'all'
    ? samples
    : samples.filter((sat) => sat.constellation === constellationFilter.value)
})

function bandOf(signal) {
  return signal.band ?? signal.label
}

const frequencyBands = computed(() => {
  const bands = new Set(constellationSamples.value.flatMap((sat) => (sat.signals ?? []).map(bandOf)))
  if (frequencyBand.value !== 'strongest') bands.add(frequencyBand.value)
  return [...bands].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
})

const chartData = computed(() => frequencyBand.value === 'strongest'
  ? constellationSamples.value
  : constellationSamples.value.flatMap((sat) => {
      const signals = (sat.signals ?? []).filter((signal) => bandOf(signal) === frequencyBand.value)
      return signals.length ? [{ ...sat, signals, snr: Math.max(...signals.map(({ snr }) => snr)) }] : []
    }),
)

const signalHistory = computed(() => {
  if (scopedDisplay || !fileTimeline.active.value ||
      (currentView.value !== 'chart' && currentView.value !== 'persat')) return snrHistory.value
  const history = new SnrHistoryStore()
  const cursor = satelliteDetailEpochIndex.value
  const first = Math.max(snrHistoryStartIndex.value, cursor - SNR_HISTORY_DEFAULT_CAPACITY + 1)
  const selected = new Set(currentView.value === 'chart'
    ? constellationSamples.value.map((sat) => snrHistoryKey(sat.constellation, sat.prn))
    : selectedSatKeys.value)
  if (selected.size === 0) return history
  for (let index = first; index <= cursor; index++) {
    const time = new Date(satelliteDetailEpochHistory.getTimestamp(index)).toISOString()
    const samples = satelliteDetailEpochHistory.getSnapshot(index).filter(
      (sat) => selected.has(snrHistoryKey(sat.constellation, sat.prn)),
    )
    history.appendEpoch(time, samples)
  }
  return history
})

const barLayout = computed(() => {
  const history = signalHistory.value
  const peaks = new Map()
  for (const sat of chartData.value) {
    const key = snrHistoryKey(sat.constellation, sat.prn)
    const tracks = frequencyBand.value === 'strongest' ? [key] : history.getSignalTracks(key)
      .filter((signal) => bandOf(signal) === frequencyBand.value)
      .map((signal) => signalHistoryKey(key, signal.id))
    peaks.set(key, Math.max(0, ...tracks.flatMap((track) => history.getSeries(track).map((point) => point.snr ?? 0))))
  }
  return buildSignalBarLayout(chartData.value, peaks)
})

// 逐星可选卫星：滚动历史 ∪ 当前快照（刚出现、历史尚未累积的卫星也能预选）
const perSatOptions = computed(() => {
  const keys = new Set(snrHistory.value.keys)
  if (fileTimeline.active.value) for (const key of selectedSatKeys.value) keys.add(key)
  for (const sat of satelliteSnrData.value) {
    keys.add(snrHistoryKey(sat.constellation, sat.prn))
  }
  return [...keys]
    .map((key) => {
      const [constellation, prn] = key.split('-')
      return {
        key,
        constellation,
        label: `${constellationPrefixes[constellation] || 'U'}${prn} · ${constellation}`,
      }
    })
    .sort((a, b) => {
      if (a.constellation !== b.constellation) {
        return a.constellation.localeCompare(b.constellation)
      }
      return parseInt(a.key.split('-')[1]) - parseInt(b.key.split('-')[1])
    })
})

// 逐星折线颜色：默认星座色，同星座多选时按亮度错开（对齐 GNSS-Raw 逐星视图）
// 空态：未选卫星或历史尚未累积
const perSatEmpty = computed(
  () => selectedSatKeys.value.length === 0 || signalHistory.value.length === 0,
)
const perSatEmptyTitle = computed(() =>
  signalHistory.value.length === 0 && selectedSatKeys.value.length !== 0
    ? t('gnss.signal.perSatNoHistory')
    : t('gnss.signal.perSatEmptyTitle'),
)

// 逐星折线图系列名（如 G20、C12）
function perSatSeriesName(key) {
  const [constellation, prn] = key.split('-')
  return `${constellationPrefixes[constellation] || 'U'}${prn}`
}

function formatCn0(value) {
  return value > 0 ? String(Number(value.toFixed(3))) : '—'
}

function signalDescription(signal) {
  const code = signal.code ?? (signal.id.startsWith('nmea:') ? `ID ${signal.id.slice(5)}` : '')
  return [signal.label, code, signal.frequencyHz > 0 ? `${signal.frequencyHz / 1e6} MHz` : '']
    .filter(Boolean).join(' · ')
}

// 获取星座标签类型
function getConstellationTagType(constellation) {
  const typeMap = {
    GPS: 'success',
    GLONASS: 'primary',
    BEIDOU: 'warning',
    GALILEO: 'info',
    OTHER: 'danger',
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
  if (snr <= 0) return t('gnss.signal.statusInvalid')
  if (snr >= 45) return t('gnss.signal.statusExcellent')
  if (snr >= 35) return t('gnss.signal.statusGood')
  if (snr >= 25) return t('gnss.signal.statusFair')
  return t('gnss.signal.statusPoor')
}

// 格式化时间
function formatTime(timestamp) {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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
  resizeObserver.observe(chartRef.value)
  if (parentElement) {
    resizeObserver.observe(parentElement)
  }
}

// 逐星折线图的尺寸监听
function setupPerSatResizeObserver() {
  if (!perSatChartRef.value || typeof ResizeObserver === 'undefined') return

  if (perSatResizeObserver) {
    perSatResizeObserver.disconnect()
    perSatResizeObserver = null
  }

  perSatResizeObserver = new ResizeObserver(() => {
    nextTick(() => {
      if (perSatChartInstance.value) {
        try {
          perSatChartInstance.value.resize()
        } catch (error) {
          // 图表调整大小失败不影响正常使用，静默处理
        }
      }
    })
  })

  const parentElement = perSatChartRef.value.parentElement
  if (parentElement) {
    perSatResizeObserver.observe(parentElement)
  }
}

// 初始化图表
function initChart() {
  if (!chartRef.value) return
  chartInstance.value?.dispose()
  chartInstance.value = null
  setupResizeObserver()
  nextTick(() => {
    if (!chartRef.value) return
    chartInstance.value = echarts.init(chartRef.value, null, { renderer: 'canvas' })
    chartInstance.value.on('click', handleBarClick)
    updateChart()
  })
}

function updateChart() {
  if (!chartInstance.value || document.hidden || currentView.value !== 'chart') return
  const colors = chartTheme.value
  const layout = barLayout.value
  const categories = layout.slots.map((slot, index) => slot?.label ?? `gap-${index}`)
  const dark = resolvedTheme.value === 'dark'
  if (
    chartInstance.value.getWidth() !== chartRef.value.clientWidth ||
    chartInstance.value.getHeight() !== chartRef.value.clientHeight
  )
    chartInstance.value.resize()
  chartInstance.value.dispatchAction({ type: 'hideTip' })
  chartInstance.value.setOption(
    {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        trigger: 'axis',
        confine: true,
        // 关闭轴指示阴影带：鼠标扫过柱列时白色 shadow 逐列重绘会产生闪烁感
        axisPointer: { show: false },
        backgroundColor: colors.surface,
        borderColor: colors.border,
        padding: [9, 12],
        textStyle: { color: colors.text, fontSize: 12 },
        formatter(params) {
          const param = (Array.isArray(params) ? params : [params]).find(
            (item) => item.seriesId === 'signal-current',
          )
          const data = param?.data
          if (!data || data.prn === undefined) return ''
          const escape = echarts.format.encodeHTML
          const signals = (data.signals ?? []).map((signal) =>
            `${escape(signalDescription(signal))} · ${formatCn0(signal.snr)} dB-Hz`,
          )
          const readings = [`C/N₀ · ${formatCn0(data.value)} dB-Hz`, ...signals].join('<br/>')
          const angles = data.positionKnown === false ? '' :
            `<br/>${t('gnss.signal.tooltipElevation')} ${Number(data.elevation.toFixed(1))}° · ${t('gnss.signal.tooltipAzimuth')} ${Number(data.azimuth.toFixed(1))}°`
          return `<b>${escape(param.name)}</b> · ${escape(data.constellation)}<br/>${readings}<br/>${t('gnss.signal.recentPeak')} · ${formatCn0(data.peak)} dB-Hz${angles}`
        },
      },
      grid: { left: 38, right: 14, top: 34, bottom: 27 },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: {
          interval: 0,
          rotate: 0,
          color: colors.textMuted,
          fontSize: 10,
          fontFamily: 'Consolas, monospace',
          margin: 9,
          formatter: (value) => (value.startsWith('gap-') ? '' : value),
        },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: colors.border } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: Math.max(60, Math.ceil((layout.maximum + 8) / 10) * 10),
        interval: 10,
        name: 'C/N₀ (dB-Hz)',
        nameGap: 16,
        nameTextStyle: { color: colors.textMuted, fontSize: 10, align: 'left' },
        axisLabel: { color: colors.textMuted, fontSize: 10 },
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: colors.grid, type: 'dashed' } },
      },
      series: [
        {
          id: 'signal-current',
          name: 'C/N₀',
          type: 'bar',
          barWidth: 24,
          barMinHeight: 2,
          showBackground: true,
          backgroundStyle: { color: dark ? '#ffffff06' : '#00000003', borderRadius: [2, 2, 0, 0] },
          // focus 'none'：不淡化同系列其它柱子，避免悬停切换时的整体闪烁
          emphasis: { focus: 'none', itemStyle: { borderWidth: 1, borderColor: colors.textMuted } },
          label: {
            show: true,
            position: 'inside',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'Consolas, monospace',
          },
          data: layout.slots.map((slot) =>
            slot
              ? {
                  ...slot.sample,
                  value: slot.value,
                  peak: slot.peak,
                  itemStyle: {
                    color: slot.color,
                    borderRadius: [2, 2, 0, 0],
                  },
                  label: {
                    position: slot.value < 14 ? 'top' : 'inside',
                    color: slot.value < 14 ? colors.textMuted : slot.labelColor,
                    formatter: () => (slot.value > 0 ? String(Math.round(slot.value)) : '—'),
                  },
                }
              : { value: null, itemStyle: { color: 'transparent' }, label: { show: false } },
          ),
          markArea: {
            silent: true,
            label: { position: 'insideTop', fontSize: 10, fontWeight: 500, distance: 4 },
            data: layout.groups.map((group) => [
              {
                name: group.constellation,
                xAxis: group.first,
                itemStyle: { color: `${group.color}08` },
                label: { color: colors.textMuted },
              },
              { xAxis: group.last },
            ]),
          },
        },
        {
          id: 'signal-peak',
          name: t('gnss.signal.recentPeak'),
          type: 'scatter',
          symbol: 'rect',
          symbolSize: [24, 2],
          silent: true,
          tooltip: { show: false },
          label: {
            show: true,
            position: 'top',
            distance: 4,
            fontSize: 10,
            color: colors.textMuted,
            formatter: (param) => String(Math.round(param.data.value[1])),
          },
          data: layout.slots.flatMap((slot, index) =>
            slot && slot.peak > 0
              ? [{ value: [index, slot.peak], itemStyle: { color: colors.textMuted } }]
              : [],
          ),
          z: 4,
        },
      ],
    },
    { replaceMerge: ['series'] },
  )
}

function scheduleDataUpdate() {
  if (dataUpdateTimer !== null) return
  dataUpdateTimer = window.setTimeout(() => {
    dataUpdateTimer = null
    updateChart()
  }, DATA_UPDATE_INTERVAL_MS)
}

// 点击柱状图某颗卫星的柱子：选中该星并切换到逐星视图
function handleBarClick(params) {
  const data = params && params.data
  if (!data || data.prn === undefined) return
  selectSatellite(snrHistoryKey(data.constellation, data.prn))
}

function selectSatellite(key) {
  if (!selectedSatKeys.value.includes(key)) {
    if (selectedSatKeys.value.length >= MAX_PER_SAT_SELECTION) return
    selectedSatKeys.value = [...selectedSatKeys.value, key]
  }
  currentView.value = 'persat'
}

// 初始化逐星折线图
function initPerSatChart() {
  if (!perSatChartRef.value) return

  if (perSatChartInstance.value) {
    perSatChartInstance.value.dispose()
    perSatChartInstance.value = null
  }

  setupPerSatResizeObserver()

  nextTick(() => {
    perSatChartInstance.value = echarts.init(perSatChartRef.value, null, { renderer: 'canvas' })
    const colors = chartTheme.value

    perSatChartInstance.value.setOption({
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.surface,
        borderColor: colors.border,
        textStyle: { color: colors.text },
        valueFormatter: (value) => (typeof value === 'number' ? `${formatCn0(value)} dB-Hz` : '—'),
      },
      legend: {
        type: 'scroll',
        top: 2,
        textStyle: { color: colors.text, fontSize: 11 },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '8%',
        top: '14%',
        containLabel: true,
      },
      dataZoom: [
        {
          id: 'x-zoom',
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'none',
          zoomOnMouseWheel: false,
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
          throttle: 50,
        },
        {
          id: 'y-zoom',
          type: 'inside',
          yAxisIndex: 0,
          filterMode: 'none',
          zoomOnMouseWheel: true,
          moveOnMouseMove: false,
          moveOnMouseWheel: false,
          throttle: 50,
        },
      ],
      xAxis: {
        type: 'category',
        data: [],
        axisLabel: {
          color: colors.textMuted,
          fontSize: 11,
        },
        axisLine: {
          lineStyle: {
            color: colors.border,
          },
        },
        splitLine: {
          show: false,
        },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 60,
        name: 'C/N₀ (dB-Hz)',
        nameTextStyle: {
          color: colors.text,
          padding: [0, 0, 0, 40],
        },
        axisLabel: {
          color: colors.textMuted,
          fontSize: 12,
        },
        axisLine: {
          lineStyle: {
            color: colors.border,
          },
        },
        splitLine: {
          lineStyle: {
            color: colors.grid,
          },
        },
      },
      series: [],
      animation: false,
    })
    updatePerSatChart()
  })
}

// Each tracked signal of a selected satellite gets its own C/N₀ series.
function updatePerSatChart() {
  if (!perSatChartInstance.value) return
  if (document.hidden) return

  const history = signalHistory.value
  const labels = history.getEpochTimes().map((time) => formatSnrEpochLabel(time))
  const tracks = selectedSatKeys.value.flatMap((satelliteKey) => {
    const signals = history.getSignalTracks(satelliteKey)
    const satelliteName = perSatSeriesName(satelliteKey)
    const constellation = satelliteKey.split('-')[0]
    return signals.length ? signals.map((signal) => ({
      key: signalHistoryKey(satelliteKey, signal.id),
      name: `${satelliteName} · ${signal.label}${signal.code ? ` (${signal.code})` : ''}`,
      constellation,
    })) : [{ key: satelliteKey, name: satelliteName, constellation }]
  })
  const baseColors = new Map(tracks.map(({ key, constellation }) => [key, constellationColors[constellation] ?? constellationColors.UNKNOWN]))
  const colors = assignSnrSeriesColors(tracks.map(({ key }) => key), (key) => baseColors.get(key))
  const series = tracks.map(({ key, name }) => ({
    id: key,
    name,
    type: 'line',
    color: colors.get(key),
    showSymbol: true,
    symbol: 'circle',
    symbolSize: 5,
    lineStyle: { width: 2.6 },
    emphasis: { lineStyle: { width: 3.2 } },
    connectNulls: false,
    data: history.getSeries(key).map((point) => point.snr),
  }))

  perSatChartInstance.value.dispatchAction({ type: 'hideTip' })
  perSatChartInstance.value.setOption({
    xAxis: { data: labels },
    series,
  }, { replaceMerge: ['series'] })
}

let perSatZoomDrag = null

function perSatZoomRange(index) {
  const zoom = perSatChartInstance.value?.getOption().dataZoom?.[index]
  return { start: zoom?.start ?? 0, end: zoom?.end ?? 100 }
}

function handlePerSatMouseDown(event) {
  if (event.button !== 2 || !perSatChartInstance.value) return
  event.preventDefault()
  const bounds = event.currentTarget.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width)))
  const zoom = perSatZoomRange(0)
  perSatZoomDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    start: zoom.start,
    end: zoom.end,
    anchorRatio: ratio,
  }
  window.addEventListener('mousemove', handlePerSatWindowMouseMove)
  window.addEventListener('mouseup', stopPerSatZoomDrag)
}

function handlePerSatWindowMouseMove(event) {
  if (
    !perSatZoomDrag ||
    event.pointerId !== perSatZoomDrag.pointerId ||
    !perSatChartInstance.value
  ) {
    return
  }
  const { startX, start, end, anchorRatio } = perSatZoomDrag
  const factor = Math.pow(2, -(event.clientX - startX) / 160)
  const span = Math.min(100, (end - start) * factor)
  const anchor = start + (end - start) * anchorRatio
  let nextStart = anchor - span * anchorRatio
  let nextEnd = nextStart + span
  if (nextStart < 0) {
    nextEnd -= nextStart
    nextStart = 0
  }
  if (nextEnd > 100) {
    nextStart = nextEnd - 100
    nextEnd = 100
  }
  perSatChartInstance.value.dispatchAction({
    type: 'dataZoom',
    dataZoomId: 'x-zoom',
    start: nextStart,
    end: nextEnd,
  })
}

function stopPerSatZoomDrag() {
  perSatZoomDrag = null
  window.removeEventListener('mousemove', handlePerSatWindowMouseMove)
  window.removeEventListener('mouseup', stopPerSatZoomDrag)
}

function resetPerSatViewport() {
  if (!perSatChartInstance.value) return
  perSatChartInstance.value.dispatchAction({
    type: 'dataZoom',
    dataZoomId: 'x-zoom',
    start: 0,
    end: 100,
  })
  perSatChartInstance.value.dispatchAction({
    type: 'dataZoom',
    dataZoomId: 'y-zoom',
    start: 0,
    end: 100,
  })
}

function schedulePerSatUpdate() {
  if (currentView.value !== 'persat') return
  if (perSatUpdateTimer !== null) return
  perSatUpdateTimer = window.setTimeout(() => {
    perSatUpdateTimer = null
    updatePerSatChart()
  }, DATA_UPDATE_INTERVAL_MS)
}

// 清除两种来源的卫星数历史；保留当前 GSV/GGA 来源选择。
function clearNsatHistory() {
  clearSatelliteEpochHistory()
  clearSatelliteCountHistory()
}

// 重置卫星数目视图布局：退出滑动窗口，x 全览 + y 恢复自动范围（与双击同款）
const nsatChartRef = ref(null)
function resetNsatLayout() {
  nsatSlidingWindow.value = false
  nextTick(() => nsatChartRef.value?.fitOverview())
}

// 明确选择实时 40 历元或可缩放的全局概览。
function setNsatSlidingWindow(enabled) {
  nsatSlidingWindow.value = enabled
}

// 监听数据变化
watch(satelliteSnrData, () => {
  scheduleDataUpdate()
  schedulePerSatUpdate()
})

// 监听星座过滤变化
watch([constellationFilter, satelliteScope, frequencyBand], () => {
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
  } else if (view === 'persat') {
    nextTick(() => {
      if (!perSatChartInstance.value) {
        initPerSatChart()
      } else {
        perSatChartInstance.value.resize()
        updatePerSatChart()
      }
    })
  }
})

// 监听逐星历史变化（仅在逐星视图激活时节流刷新）
watch(snrHistory, () => {
  scheduleDataUpdate()
  schedulePerSatUpdate()
})

// 监听逐星选择变化
watch(selectedSatKeys, () => {
  updatePerSatChart()
})

// 卫星滑出滚动窗口后，同步移除失效的选中项
watch(perSatOptions, (options) => {
  const available = new Set(options.map((option) => option.key))
  const kept = selectedSatKeys.value.filter((key) => available.has(key))
  if (kept.length !== selectedSatKeys.value.length) selectedSatKeys.value = kept
})

// 监听主题变化
function scheduleThemeRefresh() {
  if (themeRefreshRaf !== null) cancelAnimationFrame(themeRefreshRaf)
  themeRefreshRaf = requestAnimationFrame(() => {
    themeRefreshRaf = requestAnimationFrame(() => {
      themeRefreshRaf = null
      if (currentView.value === 'chart') {
        initChart()
      } else if (currentView.value === 'persat') {
        initPerSatChart()
      }
    })
  })
}

watch(resolvedTheme, scheduleThemeRefresh)

// 组件挂载时
onMounted(() => {
  setTimeout(() => {
    if (currentView.value === 'chart') {
      initChart()
    } else if (currentView.value === 'persat') {
      initPerSatChart()
    }
  }, 100)
})

// 组件卸载时
onUnmounted(() => {
  stopPerSatZoomDrag()
  if (dataUpdateTimer !== null) {
    clearTimeout(dataUpdateTimer)
    dataUpdateTimer = null
  }

  if (themeRefreshRaf !== null) {
    cancelAnimationFrame(themeRefreshRaf)
    themeRefreshRaf = null
  }

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  if (chartInstance.value) {
    chartInstance.value.dispose()
    chartInstance.value = null
  }

  if (perSatUpdateTimer !== null) {
    clearTimeout(perSatUpdateTimer)
    perSatUpdateTimer = null
  }

  if (perSatResizeObserver) {
    perSatResizeObserver.disconnect()
    perSatResizeObserver = null
  }

  if (perSatChartInstance.value) {
    perSatChartInstance.value.dispose()
    perSatChartInstance.value = null
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
  container-type: inline-size;
}

.snr-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 0;
  gap: 0;
}

.view-controls {
  display: flex;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  min-height: 50px;
  min-width: 0;
  padding: 6px 12px;
  gap: 4px 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
  background-color: var(--app-surface-muted);
  border-bottom: 1px solid var(--app-border);
}

.solver-signal-hint {
  flex: none;
  padding: 8px 12px 0;
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.view-select {
  width: 100px;
  flex-shrink: 0;
}

.satellite-scope-select {
  width: 76px;
  max-width: 100%;
  flex-shrink: 0;
}

.constellation-filter {
  width: 140px;
  flex-shrink: 0;
}

.signal-band-select {
  width: 108px;
  max-width: 100%;
  flex-shrink: 0;
}

.persat-select {
  margin-right: 8px;
  min-width: 0;
}

.signal-readings {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 5px;
  padding-block: 2px;
}

.signal-reading {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 1px 5px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: var(--app-surface-muted);
  color: var(--app-text-secondary);
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
}

.signal-reading strong {
  color: var(--app-text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.nsat-controls {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  min-width: 0;
}

.nsat-controls .control-btn + .control-btn {
  margin-left: 0;
}

.control-btn {
  height: 28px;
  min-height: 28px;
  box-sizing: border-box;
  padding: 6px 12px;
  background-color: var(--app-surface-raised);
  color: var(--app-text-secondary);
  border: 1px solid var(--app-border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
  line-height: 1;
  display: flex;
  align-items: center;
}

.nsat-window-switch {
  display: inline-flex;
  flex-shrink: 0;
}

.nsat-window-switch :deep(.el-button) {
  height: 28px;
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

.signal-bar-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  gap: 8px;
}
.signal-bar-scroll {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}
.signal-bar-chart {
  flex: 1 0 auto;
  height: 100%;
}
.signal-bar-empty {
  position: absolute;
  inset: 0 0 30px;
  display: grid;
  place-items: center;
  color: var(--app-text-muted);
  font-size: 12px;
  pointer-events: none;
}
.signal-bar-legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 14px;
  min-height: 20px;
  color: var(--app-text-secondary);
  font-size: 10px;
}
.signal-bar-group {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 500;
}
.signal-bar-group > i {
  width: 7px;
  height: 7px;
  border-radius: 2px;
}
.signal-bar-group small {
  color: var(--app-text-muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.signal-peak-key {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  color: var(--app-text-muted);
}
.signal-peak-key > i {
  width: 13px;
  height: 2px;
  background: currentColor;
}

.nsat-chart-container {
  flex: 1;
  width: 100%;
  min-height: 0;
  border-radius: 4px;
  background-color: var(--app-surface);
}

.persat-select {
  width: 280px;
}

.persat-chart-wrapper {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.persat-chart {
  flex: 1;
}

.persat-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  pointer-events: none;
}

.persat-empty-title {
  font-size: 13px;
  color: var(--app-text);
}

.persat-empty-sub {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.snr-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.snr-value {
  font-weight: 600;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.snr-table-container :deep(.el-table) {
  font-size: 13px;
}

.snr-table-container :deep(.el-table__cell) {
  padding: 6px 0;
  font-variant-numeric: tabular-nums;
}

.snr-table-container :deep(.el-table__cell .cell) {
  line-height: 20px;
}

.snr-table-container :deep(.constellation-column-header .cell) {
  white-space: nowrap;
}

:deep(.el-table__header-wrapper) {
  background-color: var(--app-surface-muted);
}

:deep(.el-table__row:hover) {
  background-color: var(--app-hover);
}

@container (max-width: 800px) {
  .view-controls {
    padding: 0 8px;
  }

  .view-select {
    width: 86px;
    margin-right: 8px;
  }

  .control-btn-label {
    display: none;
  }

  .nsat-controls {
    gap: 4px;
  }

  .nsat-controls .control-btn {
    width: 28px;
    padding: 0;
    justify-content: center;
  }
}

@container (max-width: 320px) {
  .view-select {
    width: 72px;
    margin-right: 4px;
  }

  .nsat-controls {
    gap: 2px;
  }
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
