<template>
  <div class="deviation-container">
    <div class="control-panel">
      <div class="controls">
        <!-- 视图配置按钮 -->
        <el-button type="default" size="small" @click="showViewConfig" class="control-btn config-btn">
          <el-icon><Setting /></el-icon>&nbsp;{{ t('flow.config') }}
        </el-button>
        
        <!-- 滑窗开关按钮 -->
        <el-button :disabled="deviceConnected" type="default" size="small" @click="toggleSlideWindow">
          <el-icon v-if="enableWindow"><CircleClose /></el-icon>
          <el-icon v-else><CircleCheck /></el-icon>
          &nbsp;{{ enableWindow ? t('flow.disableSlideWindow') : t('flow.enableSlideWindow') }}
        </el-button>

        <el-button
          type="default"
          size="small"
          :title="t('flow.tracking')"
          :aria-label="t('flow.tracking')"
          class="tracking-button"
          @click="toggleTracking"
        >
          <el-icon><Aim /></el-icon>
          <span class="tracking-text">&nbsp;{{ isTracking ? t('flow.disableTracking') : t('flow.enableTracking') }}</span>
        </el-button>
        
        <!-- 添加轨迹点尺寸调节滑块 -->
        <div class="point-size-control">
          <span class="size-label">{{ t('flow.size') }}</span>
          <el-slider
            v-model="pointSize"
            :min="5"
            :max="20"
            :step="1" 
            class="point-slider"
            @change="updatePointSize"
          />
          <span class="size-value">{{ pointSize }}</span>
        </div>

        <!-- 将重置、清除按钮放在右侧 -->
        <div class="right-buttons">
          <!-- 重置布局按钮 -->
          <el-button type="text" size="small" @click="resetZoom" class="zoom-btn" style="margin: 0px 0px;">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
    <div class="chart-container" ref="chartContainerRef">
      <!-- 移除正方形包装器，让图表直接填充容器 -->
      <div ref="chartRef" class="chart"></div>
    </div>
  </div>

  <!-- 视图配置对话框 -->
  <DeviationConfigDialog
    v-model="viewConfigDialogVisible"
    :available-sources="availableSources"
    :config="deviationConfig"
    @apply="applyViewConfig"
  />
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick, computed, reactive } from 'vue';
import { t } from '@/i18n';
import { useFlow } from '@/composables/flow/useFlow';
import { useDevice } from '@/hooks/useDevice'
import { ElMessage } from 'element-plus';
import { useDataConfig } from '@/composables/flow/useDataConfig';
import { useConsole } from '@/composables/flow/useConsole';
import { useTheme } from '@/composables/useTheme';
import DeviationConfigDialog from './DeviationConfigDialog.vue';
import { useDeviationChart } from './deviation/useDeviationChart';
import {
  fitDeviationPoints,
  fitDeviationPointsAroundCenter,
} from '@/core/deviation/DeviationViewport';

const { deviationConfig } = useDataConfig();

// 导入搜索功能
const { searchQuery } = useConsole(true);

// 注册ECharts组件
const { flowData, toggleSlideWindow, enableWindow } = useFlow();
const { deviceConnected } = useDevice()
const { chartTheme, resolvedTheme } = useTheme();

const DEVIATION_WINDOW_POINTS = 10000;
const plotData = computed(() => {
  if (!enableWindow.value) return flowData.value;

  const result = {};
  for (const key in flowData.value) {
    const values = flowData.value[key];
    result[key] = Array.isArray(values)
      ? values.slice(-DEVIATION_WINDOW_POINTS)
      : values;
  }
  return result;
});

// 颜色处理辅助函数
function getValidColor(color, defaultColor) {
  if (!color || color === '' || !color.startsWith('#')) {
    return defaultColor;
  }
  return color;
}

function hexToRgba(color, alpha = 1) {
  const validColor = getValidColor(color, '#5470c6');
  const r = parseInt(validColor.slice(1, 3), 16);
  const g = parseInt(validColor.slice(3, 5), 16);
  const b = parseInt(validColor.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// DOM引用和响应式变量
const {
  chartRef,
  chartInstance,
  chartContainerRef,
  isTracking,
  padding,
  pointSize,
  createChart,
  setupResizeObserver,
  disconnectResizeObserver,
  getDataZoomConfig,
  maintainEqualAxisScale,
  bindWheelHandler,
  unbindWheelHandler,
} = useDeviationChart({ initialTracking: false });
const highlightTimeout = ref(null); // 添加高亮超时定时器
// 移除squareSize变量

// 视图配置相关变量
const viewConfigDialogVisible = ref(false);

// 计算可用数据源
const availableSources = computed(() => {
  if (!plotData.value || !plotData.value.plotTime) return [];
  return Object.keys(plotData.value).filter(
    key => key !== 'plotTime' && 
    key !== 'timestamp' && 
    key !== 'startTime' && 
    key !== 'rawDataKeys' &&
    plotData.value[key].length > 0
  );
});

let trackOffsetX = 0;
let trackOffsetY = 0;
// 数据存储变量
let track1Data = [];
let track2Data = [];
let track3Data = [];
let track4Data = [];
// 索引映射
let track1ToRawIndex = [];
let track2ToRawIndex = [];
let track3ToRawIndex = [];
let track4ToRawIndex = [];
const LARGE_RENDER_THRESHOLD = 2000;
const PROGRESSIVE_RENDER_THRESHOLD = 10000;
const RENDER_BATCH_SIZE = 5000;
let lastFlowRenderKey = '';
let flowUpdateFrame = null;
// 记录上一次 setOption 的系列 id，用于判断是否有系列被移除
let lastSeriesIds = [];
// 增量追加状态：每条轨迹记录已处理到的原始索引及对应数据源引用
let lastOffsetX = 0;
let lastOffsetY = 0;
const trackAppendState = [
  { xRef: null, yRef: null, processed: 0 },
  { xRef: null, yRef: null, processed: 0 },
  { xRef: null, yRef: null, processed: 0 },
  { xRef: null, yRef: null, processed: 0 },
];
// hover 拾取用时间索引表：timestamp -> 各轨迹内首次出现的索引
const timeIndexMap = new Map();
function resetTrackAppendState() {
  for (const state of trackAppendState) {
    state.xRef = null;
    state.yRef = null;
    state.processed = 0;
  }
}
// 最新点信息，用于高亮显示
const latestPointInfo = reactive({
  track: null, // 1, 2, 或 3
  index: -1,   // 在对应轨迹中的索引
  data: null   // [x, y] 坐标
});
// let firstPosition = null;
// const maxTrackPoints = 3600 * 12;
// const minPadding = 10000; // 最小范围正负10km

// 显示视图配置对话框
function showViewConfig() {
  viewConfigDialogVisible.value = true;
}

// 应用视图配置
function applyViewConfig() {
  // 验证是否至少配置了一条轨迹
  if (!deviationConfig.track1X.value && !deviationConfig.track2X.value && !deviationConfig.track3X.value && !deviationConfig.track4X.value) {
    ElMessage({
      message: t('flow.configNeedTrackAxis'),
      type: 'warning',
      placement: 'bottom-right',
      offset: 50,
    });
    return;
  }
  
  // 更新图表轴名称（使用第一个配置的轨迹）
  let xAxisName = '';
  let yAxisName = '';
  
  if (deviationConfig.track1X.value) {
    xAxisName = deviationConfig.track1X.value;
  } else if (deviationConfig.track2X.value) {
    xAxisName = deviationConfig.track2X.value;
  } else if (deviationConfig.track3X.value) {
    xAxisName = deviationConfig.track3X.value;
  } else if (deviationConfig.track4X.value) {
    xAxisName = deviationConfig.track4X.value;
  }
  
  if (deviationConfig.track1Y.value) {
    yAxisName = deviationConfig.track1Y.value;
  } else if (deviationConfig.track2Y.value) {
    yAxisName = deviationConfig.track2Y.value;
  } else if (deviationConfig.track3Y.value) {
    yAxisName = deviationConfig.track3Y.value;
  } else if (deviationConfig.track4Y.value) {
    yAxisName = deviationConfig.track4Y.value;
  }
  
  // 根据跟踪模式调整轴名称
  if (!isTracking.value && xAxisName) {
    xAxisName = `${xAxisName}`;
  }
  if (!isTracking.value && yAxisName) {
    yAxisName = `${yAxisName}`;
  }
  
  if (chartInstance.value) {
    chartInstance.value.setOption({
      xAxis: {
        name: xAxisName || t('flow.xAxis')
      },
      yAxis: {
        name: yAxisName || t('flow.yAxis')
      }
    });
  }
  
  viewConfigDialogVisible.value = false;

  updateFlowData();
}

// 初始化图表
function initChart() {
  if (!createChart()) return;
  lastFlowRenderKey = '';
  lastSeriesIds = [];
  resetTrackAppendState();
  const colors = chartTheme.value;

  const option = {
    animation: false,
    hoverAnimation: false,
    backgroundColor: colors.background,
    textStyle: { color: colors.text },
    graphic: [{
      type: 'text',
      left: 10,
      top: 10,
      z: 99,
      style: {
        text: '',
        font: '14px Microsoft YaHei',
        fill: colors.text,
        backgroundColor: colors.surfaceMuted,
        padding: [6, 10]
      }
    }],
    tooltip: {
      trigger: 'item',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text },
      axisPointer: {
        type: 'cross',
        label: {
          show: true,
          formatter: function(params) {
            // params.value 包含当前坐标值
            let result = params.value;
            if (params.axisDimension === 'x') {
              result += trackOffsetX;
            } else if (params.axisDimension === 'y') {
              result += trackOffsetY;
            }

            return result.toFixed(2);
          },
          backgroundColor: '#333',
          color: '#fff',
          padding: [3, 5],
          borderRadius: 3
        }
      },
      show: true,
      formatter: {}
    },
    legend: {
      data: [], // 初始为空，后续动态更新
      right: 10,
      top: 10,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '8%',
      top: '15%',
      containLabel: true,
    },
    dataZoom: getDataZoomConfig(-10, 10, -10, 10),
    xAxis: {
      type: 'value',
      name: isTracking.value ? t('flow.xAxis') : t('flow.xAxis'),
      nameLocation: 'middle',
      nameGap: 30,
      axisLabel: {
        color: colors.textMuted,
        formatter: function(value) {
          return value.toFixed(2);
        },
      },
      splitLine: {
        lineStyle: {
          type: 'dashed',
          color: colors.grid,
        },
      },
      axisLine: {
        show: true,
        lineStyle: { color: colors.border },
      },
      min: -padding.value,
      max: padding.value,
    },
    yAxis: {
      type: 'value',
      name: isTracking.value ? t('flow.yAxis') : t('flow.yAxis'),
      nameLocation: 'middle',
      nameGap: 40,
      axisLabel: {
        color: colors.textMuted,
        formatter: function(value) {
          return value.toFixed(2);
        },
      },
      splitLine: {
        lineStyle: {
          type: 'dashed',
          color: colors.grid,
        },
      },
      axisLine: {
        show: true,
        lineStyle: { color: colors.border },
      },
      min: -padding.value,
      max: padding.value,
    },
    series: [],
  };

  chartInstance.value.setOption(option);
  
  // 添加鼠标事件监听
  chartInstance.value.on('mouseover', handleMouseOver);
  chartInstance.value.on('mouseout', handleMouseOut);
  chartInstance.value.on('globalout', handleMouseOut); // 添加全局鼠标移出事件
  chartInstance.value.on('dblclick', handleChartDblClick); // 添加双击事件监听
  
  // 添加legend点击事件监听
  chartInstance.value.on('legendselectchanged', handleLegendSelectChanged);
  
  setupResizeObserver(maintainEqualAxisScale);
  updateFlowData();

  // 直接在DOM元素上绑定事件监听器
  bindWheelHandler(handleWheel);
}

// 处理滚轮事件
function handleWheel(e) {
  e.preventDefault();
  e.stopPropagation();
  
  // RTKLIB的逻辑
  const wheelDelta = -e.deltaY; // 转换为与RTKLIB相似的WheelDelta值
  const zoomRatio = Math.pow(2.0, -wheelDelta / 1200.0);

  const opt = chartInstance.value.getOption();
  const xStart = opt.dataZoom[0].startValue;
  const xEnd = opt.dataZoom[0].endValue;
  const yStart = opt.dataZoom[1].startValue;
  const yEnd = opt.dataZoom[1].endValue;
  
  const limit = 10000;
  const xSpan = (xEnd - xStart) * zoomRatio;
  const ySpan = (yEnd - yStart) * zoomRatio;

  const xCenter = (xStart + xEnd) / 2;
  const yCenter = (yStart + yEnd) / 2;
  const newXStart = Math.max(-limit, xCenter - xSpan / 2);
  const newXEnd = Math.min(limit, xCenter + xSpan / 2);
  const newYStart = Math.max(-limit, yCenter - ySpan / 2);
  const newYEnd = Math.min(limit, yCenter + ySpan / 2);

  chartInstance.value.dispatchAction({
    type: 'dataZoom',
    dataZoomIndex: 0,
    startValue: newXStart,
    endValue: newXEnd,
  });
  chartInstance.value.dispatchAction({
    type: 'dataZoom',
    dataZoomIndex: 1,
    startValue: newYStart,
    endValue: newYEnd,
  });
  return false;
};

// 更新数据点 - 支持三条平级轨迹
function updateFlowData() {
  const sourceData = plotData.value;
  const configuredFields = [
    deviationConfig.track1X.value,
    deviationConfig.track1Y.value,
    deviationConfig.track2X.value,
    deviationConfig.track2Y.value,
    deviationConfig.track3X.value,
    deviationConfig.track3Y.value,
    deviationConfig.track4X.value,
    deviationConfig.track4Y.value,
  ];
  const renderKey = [
    isTracking.value,
    enableWindow.value,
    ...configuredFields.map(field => {
      const values = field ? sourceData[field] : undefined;
      if (!Array.isArray(values) || values.length === 0) return `${field ?? ''}:0`;
      return `${field}:${values.length}:${values[0]}:${values[values.length - 1]}`;
    }),
  ].join('|');
  if (renderKey === lastFlowRenderKey) return;
  lastFlowRenderKey = renderKey;


  // 确定跟踪目标：优先顺序为轨迹1 > 轨迹2 > 轨迹3 > 轨迹4
  let trackingTrack = null;
  let trackingData = null;
  let latestPointIndex = -1;
  
  if (deviationConfig.track1X.value && deviationConfig.track1Y.value && plotData.value[deviationConfig.track1X.value] && plotData.value[deviationConfig.track1Y.value]) {
    const track1XData = plotData.value[deviationConfig.track1X.value];
    const track1YData = plotData.value[deviationConfig.track1Y.value];
    if (track1XData && track1YData && track1XData.length > 0 && track1YData.length > 0) {
      trackingTrack = 1;
      trackingData = [track1XData[track1XData.length - 1], track1YData[track1YData.length - 1]];
      latestPointIndex = track1XData.length - 1;
    }
  }
  if (!trackingTrack && deviationConfig.track2X.value && deviationConfig.track2Y.value && plotData.value[deviationConfig.track2X.value] && plotData.value[deviationConfig.track2Y.value]) {
    const track2XData = plotData.value[deviationConfig.track2X.value];
    const track2YData = plotData.value[deviationConfig.track2Y.value];
    if (track2XData && track2YData && track2XData.length > 0 && track2YData.length > 0) {
      trackingTrack = 2;
      trackingData = [track2XData[track2XData.length - 1], track2YData[track2YData.length - 1]];
      latestPointIndex = track2XData.length - 1;
    }
  }
  if (!trackingTrack && deviationConfig.track3X.value && deviationConfig.track3Y.value && plotData.value[deviationConfig.track3X.value] && plotData.value[deviationConfig.track3Y.value]) {
    const track3XData = plotData.value[deviationConfig.track3X.value];
    const track3YData = plotData.value[deviationConfig.track3Y.value];
    if (track3XData && track3YData && track3XData.length > 0 && track3YData.length > 0) {
      trackingTrack = 3;
      trackingData = [track3XData[track3XData.length - 1], track3YData[track3YData.length - 1]];
      latestPointIndex = track3XData.length - 1;
    }
  }
  if (!trackingTrack && deviationConfig.track4X.value && deviationConfig.track4Y.value && plotData.value[deviationConfig.track4X.value] && plotData.value[deviationConfig.track4Y.value]) {
    const track4XData = plotData.value[deviationConfig.track4X.value];
    const track4YData = plotData.value[deviationConfig.track4Y.value];
    if (track4XData && track4YData && track4XData.length > 0 && track4YData.length > 0) {
      trackingTrack = 4;
      trackingData = [track4XData[track4XData.length - 1], track4YData[track4YData.length - 1]];
      latestPointIndex = track4XData.length - 1;
    }
  }

  // 计算跟踪偏移量
  let offsetX = 0;
  let offsetY = 0;
  if (isTracking.value && trackingTrack && trackingData) {
    offsetX = trackingData[0];
    offsetY = trackingData[1];
  } else if (!isTracking.value) {
    // 非跟踪模式下，将第一条轨迹的第一个点作为(0,0)参考点
    if (deviationConfig.track1X.value && deviationConfig.track1Y.value && plotData.value[deviationConfig.track1X.value] && plotData.value[deviationConfig.track1Y.value]) {
      const track1XData = plotData.value[deviationConfig.track1X.value];
      const track1YData = plotData.value[deviationConfig.track1Y.value];
      if (track1XData && track1YData && track1XData.length > 0 && track1YData.length > 0) {
        offsetX = track1XData[0];  // 第一条轨迹的第一个点的X坐标
        offsetY = track1YData[0];  // 第一条轨迹的第一个点的Y坐标
      }
    }
  }

  // 更新最新点信息
  if (trackingTrack && latestPointIndex >= 0) {
    latestPointInfo.track = trackingTrack;
    latestPointInfo.index = latestPointIndex;
    latestPointInfo.data = trackingData;
  } else {
    latestPointInfo.track = null;
    latestPointInfo.index = -1;
    latestPointInfo.data = null;
  }

  trackOffsetX = offsetX;
  trackOffsetY = offsetY;

  // 收集各轨迹的数据源（配置缺失或数据为空时为 null）
  const trackSources = [
    [deviationConfig.track1X.value, deviationConfig.track1Y.value],
    [deviationConfig.track2X.value, deviationConfig.track2Y.value],
    [deviationConfig.track3X.value, deviationConfig.track3Y.value],
    [deviationConfig.track4X.value, deviationConfig.track4Y.value],
  ].map(([xField, yField]) => {
    if (!xField || !yField) return null;
    const xData = plotData.value[xField];
    const yData = plotData.value[yField];
    if (!xData || !yData || xData.length === 0 || yData.length === 0) return null;
    return { xData, yData };
  });

  // 偏移量不变且各轨迹数据源引用不变（数据仅尾部增长）时增量追加，否则全量重建一次
  const offsetUnchanged = offsetX === lastOffsetX && offsetY === lastOffsetY;
  const canAppend = offsetUnchanged && trackSources.every((source, index) => {
    const state = trackAppendState[index];
    if (!source) return state.processed === 0;
    return state.xRef === source.xData && state.yRef === source.yData;
  });
  if (!canAppend) {
    track1Data.splice(0, track1Data.length);
    track2Data.splice(0, track2Data.length);
    track3Data.splice(0, track3Data.length);
    track4Data.splice(0, track4Data.length);
    track1ToRawIndex.splice(0, track1ToRawIndex.length);
    track2ToRawIndex.splice(0, track2ToRawIndex.length);
    track3ToRawIndex.splice(0, track3ToRawIndex.length);
    track4ToRawIndex.splice(0, track4ToRawIndex.length);
    timeIndexMap.clear();
    resetTrackAppendState();
  }
  lastOffsetX = offsetX;
  lastOffsetY = offsetY;

  // 处理轨迹1数据（增量追加：只处理上次更新之后的新增点）
  const track1Source = trackSources[0];
  if (track1Source) {
    const track1XData = track1Source.xData;
    const track1YData = track1Source.yData;
    const track1State = trackAppendState[0];
    const timestamps1 = plotData.value.timestamp;
    const track1DataLength = Math.min(track1XData.length, track1YData.length);
    const track1Start = canAppend ? Math.min(track1State.processed, track1DataLength) : 0;
    for (let i = track1Start; i < track1DataLength; i++) {
      const x = track1XData[i];
      const y = track1YData[i];
      if (typeof x === 'number' && typeof y === 'number' && !isNaN(x) && !isNaN(y)) {
        const roundedX = Math.round((x - offsetX) * 1000) / 1000;
        const roundedY = Math.round((y - offsetY) * 1000) / 1000;
        track1Data.push([roundedX, roundedY]);
        track1ToRawIndex.push(i);
        // 同步维护 hover 时间索引（首次出现优先，与原线性扫描语义一致）
        if (timestamps1) {
          const time = timestamps1[i];
          let entry = timeIndexMap.get(time);
          if (!entry) {
            entry = {};
            timeIndexMap.set(time, entry);
          }
          if (entry.track1 === undefined) entry.track1 = track1ToRawIndex.length - 1;
        }
      }
    }
    track1State.xRef = track1XData;
    track1State.yRef = track1YData;
    track1State.processed = track1DataLength;
  }

  // 处理轨迹2数据（增量追加：只处理上次更新之后的新增点）
  const track2Source = trackSources[1];
  if (track2Source) {
    const track2XData = track2Source.xData;
    const track2YData = track2Source.yData;
    const track2State = trackAppendState[1];
    const timestamps2 = plotData.value.timestamp;
    const track2DataLength = Math.min(track2XData.length, track2YData.length);
    const track2Start = canAppend ? Math.min(track2State.processed, track2DataLength) : 0;
    for (let i = track2Start; i < track2DataLength; i++) {
      const x = track2XData[i];
      const y = track2YData[i];
      if (typeof x === 'number' && typeof y === 'number' && !isNaN(x) && !isNaN(y)) {
        const roundedX = Math.round((x - offsetX) * 1000) / 1000;
        const roundedY = Math.round((y - offsetY) * 1000) / 1000;
        track2Data.push([roundedX, roundedY]);
        track2ToRawIndex.push(i);
        // 同步维护 hover 时间索引（首次出现优先，与原线性扫描语义一致）
        if (timestamps2) {
          const time = timestamps2[i];
          let entry = timeIndexMap.get(time);
          if (!entry) {
            entry = {};
            timeIndexMap.set(time, entry);
          }
          if (entry.track2 === undefined) entry.track2 = track2ToRawIndex.length - 1;
        }
      }
    }
    track2State.xRef = track2XData;
    track2State.yRef = track2YData;
    track2State.processed = track2DataLength;
  }

  // 处理轨迹3数据（增量追加：只处理上次更新之后的新增点）
  const track3Source = trackSources[2];
  if (track3Source) {
    const track3XData = track3Source.xData;
    const track3YData = track3Source.yData;
    const track3State = trackAppendState[2];
    const timestamps3 = plotData.value.timestamp;
    const track3DataLength = Math.min(track3XData.length, track3YData.length);
    const track3Start = canAppend ? Math.min(track3State.processed, track3DataLength) : 0;
    for (let i = track3Start; i < track3DataLength; i++) {
      const x = track3XData[i];
      const y = track3YData[i];
      if (typeof x === 'number' && typeof y === 'number' && !isNaN(x) && !isNaN(y)) {
        const roundedX = Math.round((x - offsetX) * 1000) / 1000;
        const roundedY = Math.round((y - offsetY) * 1000) / 1000;
        track3Data.push([roundedX, roundedY]);
        track3ToRawIndex.push(i);
        // 同步维护 hover 时间索引（首次出现优先，与原线性扫描语义一致）
        if (timestamps3) {
          const time = timestamps3[i];
          let entry = timeIndexMap.get(time);
          if (!entry) {
            entry = {};
            timeIndexMap.set(time, entry);
          }
          if (entry.track3 === undefined) entry.track3 = track3ToRawIndex.length - 1;
        }
      }
    }
    track3State.xRef = track3XData;
    track3State.yRef = track3YData;
    track3State.processed = track3DataLength;
  }

  // 处理轨迹4数据（增量追加：只处理上次更新之后的新增点）
  const track4Source = trackSources[3];
  if (track4Source) {
    const track4XData = track4Source.xData;
    const track4YData = track4Source.yData;
    const track4State = trackAppendState[3];
    const timestamps4 = plotData.value.timestamp;
    const track4DataLength = Math.min(track4XData.length, track4YData.length);
    const track4Start = canAppend ? Math.min(track4State.processed, track4DataLength) : 0;
    for (let i = track4Start; i < track4DataLength; i++) {
      const x = track4XData[i];
      const y = track4YData[i];
      track4ToRawIndex.push(i);
      // 同步维护 hover 时间索引（首次出现优先，与原线性扫描语义一致）
      if (timestamps4) {
        const time = timestamps4[i];
        let entry = timeIndexMap.get(time);
        if (!entry) {
          entry = {};
          timeIndexMap.set(time, entry);
        }
        if (entry.track4 === undefined) entry.track4 = track4ToRawIndex.length - 1;
      }
      if (typeof x === 'number' && typeof y === 'number' && !isNaN(x) && !isNaN(y)) {
        const roundedX = Math.round((x - offsetX) * 1000) / 1000;
        const roundedY = Math.round((y - offsetY) * 1000) / 1000;
        track4Data.push([roundedX, roundedY]);
      }
    }
    track4State.xRef = track4XData;
    track4State.yRef = track4YData;
    track4State.processed = track4DataLength;
  }

  // 更新图表显示
  updateChartDisplay();
}

// 更新图表显示 - 三条平级轨迹
function updateChartDisplay() {
  if (!chartInstance.value) return;
  
  // 构建系列数据
  const series = [];

  // 添加轨迹1
  if (deviationConfig.track1X.value && deviationConfig.track1Y.value && track1Data.length > 0) {
    const isLatestTrack = latestPointInfo.track === 1;
    series.push({
      id: 'flow-track-1',
      name: t('flow.trackN', { n: 1 }),
      type: 'scatter',
      data: track1Data,
      coordinateSystem: 'cartesian2d',
      // 大数据量渲染优化为静态配置，随系列定义声明，merge 模式按 id diff 不会重复处理
      large: true,
      largeThreshold: LARGE_RENDER_THRESHOLD,
      progressive: RENDER_BATCH_SIZE,
      progressiveThreshold: PROGRESSIVE_RENDER_THRESHOLD,
      progressiveChunkMode: 'mod',
      symbolSize: function(params, paramsIndex) {
        // 在非跟踪模式下高亮最新点
        if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
          return pointSize.value * 1.5;
        }
        return pointSize.value;
      },
      symbol: 'circle',
      itemStyle: {
        color: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return deviationConfig.track1Color.value;
          }
          return deviationConfig.track1Color.value;
        },
        opacity: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return 1;
          }
          return 0.6;
        },
        borderWidth: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return 3;
          }
          return 0;
        },
        borderColor: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return '#fff';
          }
          return 'transparent';
        },
        shadowBlur: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return 10;
          }
          return 0;
        },
        shadowColor: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return hexToRgba(deviationConfig.track1Color.value, 0.5);
          }
          return 'transparent';
        }
      },
      emphasis: {
        itemStyle: {
          color: deviationConfig.track1Color.value,
          opacity: 1,
          borderColor: '#fff',
          borderWidth: 2,
          shadowBlur: 10,
          shadowColor: hexToRgba(deviationConfig.track1Color.value, 0.5)
        },
        scale: 1.5
      },
    });
  }

  // 添加轨迹2
  if (deviationConfig.track2X.value && deviationConfig.track2Y.value && track2Data.length > 0) {
    const isLatestTrack = latestPointInfo.track === 2;
    series.push({
      id: 'flow-track-2',
      name: t('flow.trackN', { n: 2 }),
      type: 'scatter',
      data: track2Data,
      coordinateSystem: 'cartesian2d',
      // 大数据量渲染优化为静态配置，随系列定义声明，merge 模式按 id diff 不会重复处理
      large: true,
      largeThreshold: LARGE_RENDER_THRESHOLD,
      progressive: RENDER_BATCH_SIZE,
      progressiveThreshold: PROGRESSIVE_RENDER_THRESHOLD,
      progressiveChunkMode: 'mod',
      symbolSize: function(params, paramsIndex) {
        // 在非跟踪模式下高亮最新点
        if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
          return pointSize.value * 1.5;
        }
        return pointSize.value;
      },
      symbol: 'circle',
      itemStyle: {
        color: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return deviationConfig.track2Color.value;
          }
          return deviationConfig.track2Color.value;
        },
        opacity: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return 1;
          }
          return 0.6;
        },
        borderWidth: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return 3;
          }
          return 0;
        },
        borderColor: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return '#fff';
          }
          return 'transparent';
        },
        shadowBlur: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return 10;
          }
          return 0;
        },
        shadowColor: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return hexToRgba(deviationConfig.track2Color.value, 0.5);
          }
          return 'transparent';
        }
      },
      emphasis: {
        itemStyle: {
          color: deviationConfig.track2Color.value,
          opacity: 1,
          borderColor: '#fff',
          borderWidth: 2,
          shadowBlur: 10,
          shadowColor: hexToRgba(deviationConfig.track2Color.value, 0.5)
        },
        scale: 1.5
      },
    });
  }

  // 添加轨迹3
  if (deviationConfig.track3X.value && deviationConfig.track3Y.value && track3Data.length > 0) {
    const isLatestTrack = latestPointInfo.track === 3;
    series.push({
      id: 'flow-track-3',
      name: t('flow.trackN', { n: 3 }),
      type: 'scatter',
      data: track3Data,
      coordinateSystem: 'cartesian2d',
      // 大数据量渲染优化为静态配置，随系列定义声明，merge 模式按 id diff 不会重复处理
      large: true,
      largeThreshold: LARGE_RENDER_THRESHOLD,
      progressive: RENDER_BATCH_SIZE,
      progressiveThreshold: PROGRESSIVE_RENDER_THRESHOLD,
      progressiveChunkMode: 'mod',
      symbolSize: function(params, paramsIndex) {
        // 在非跟踪模式下高亮最新点
        if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
          return pointSize.value * 1.5;
        }
        return pointSize.value;
      },
      symbol: 'circle',
      itemStyle: {
        color: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return deviationConfig.track3Color.value;
          }
          return deviationConfig.track3Color.value;
        },
        opacity: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return 1;
          }
          return 0.6;
        },
        borderWidth: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return 3;
          }
          return 0;
        },
        borderColor: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return '#fff';
          }
          return 'transparent';
        },
        shadowBlur: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return 10;
          }
          return 0;
        },
        shadowColor: hexToRgba(deviationConfig.track3Color.value, 0.5)
      },
      emphasis: {
        itemStyle: {
          color: deviationConfig.track3Color.value,
          opacity: 1,
          borderColor: '#fff',
          borderWidth: 2,
          shadowBlur: 10,
          shadowColor: hexToRgba(deviationConfig.track3Color.value, 0.5)
        },
        scale: 1.5
      },
    });
  }

  // 添加轨迹4
  if (deviationConfig.track4X.value && deviationConfig.track4Y.value && track4Data.length > 0) {
    const isLatestTrack = latestPointInfo.track === 4;
    series.push({
      id: 'flow-track-4',
      name: t('flow.trackN', { n: 4 }),
      type: 'scatter',
      data: track4Data,
      coordinateSystem: 'cartesian2d',
      // 大数据量渲染优化为静态配置，随系列定义声明，merge 模式按 id diff 不会重复处理
      large: true,
      largeThreshold: LARGE_RENDER_THRESHOLD,
      progressive: RENDER_BATCH_SIZE,
      progressiveThreshold: PROGRESSIVE_RENDER_THRESHOLD,
      progressiveChunkMode: 'mod',
      symbolSize: function(params, paramsIndex) {
        // 在非跟踪模式下高亮最新点
        if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
          return pointSize.value * 1.5;
        }
        return pointSize.value;
      },
      symbol: 'circle',
      itemStyle: {
        color: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return deviationConfig.track4Color.value;
          }
          return deviationConfig.track4Color.value;
        },
        opacity: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return 1;
          }
          return 0.6;
        },
        borderWidth: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return 3;
          }
          return 0;
        },
        borderColor: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return '#fff';
          }
          return 'transparent';
        },
        shadowBlur: function(params, paramsIndex) {
          // 在非跟踪模式下高亮最新点
          if (!isTracking.value && isLatestTrack && paramsIndex === latestPointInfo.index) {
            return 10;
          }
          return 0;
        },
        shadowColor: hexToRgba(deviationConfig.track4Color.value, 0.5)
      },
      emphasis: {
        itemStyle: {
          color: deviationConfig.track4Color.value,
          opacity: 1,
          borderColor: '#fff',
          borderWidth: 2,
          shadowBlur: 10,
          shadowColor: hexToRgba(deviationConfig.track4Color.value, 0.5)
        },
        scale: 1.5
      },
    });
  }

  // 为每条轨迹添加独立的当前位置系列（不在legend中显示）
  // 跟踪模式下：所有轨迹都显示当前位置，但只有轨迹1的当前位置固定在中心
  if (isTracking.value) {
    // 轨迹1当前位置（固定在中心）
    if (deviationConfig.track1X.value && deviationConfig.track1Y.value && track1Data.length > 0) {
      series.push({
        id: 'flow-current-1',
        name: t('flow.currentPosN', { n: 1 }),
        type: 'scatter',
        data: [[0, 0]], // 跟踪模式下轨迹1固定在中心
        coordinateSystem: 'cartesian2d',
        symbolSize: pointSize.value * 1.2,
        itemStyle: {
          color: deviationConfig.track1Color.value,
          borderWidth: 2,
          borderColor: '#fff',
          shadowBlur: 2,
          shadowColor: 'rgba(0, 0, 0, 0.3)',
        },
        emphasis: {
          itemStyle: {
            color: deviationConfig.track1Color.value,
            opacity: 1,
            borderColor: '#fff',
            borderWidth: 2,
            shadowBlur: 10,
            shadowColor: hexToRgba(deviationConfig.track1Color.value, 0.5)
          },
          scale: 1.5
        },
      });
    }

    // 轨迹2当前位置（显示在真实位置）
    if (deviationConfig.track2X.value && deviationConfig.track2Y.value && track2Data.length > 0) {
      const lastPoint2 = track2Data[track2Data.length - 1];
      series.push({
        id: 'flow-current-2',
        name: t('flow.currentPosN', { n: 2 }),
        type: 'scatter',
        data: [lastPoint2],
        coordinateSystem: 'cartesian2d',
        symbolSize: pointSize.value * 1.2,
        itemStyle: {
          color: deviationConfig.track2Color.value,
          borderWidth: 2,
          borderColor: '#fff',
          shadowBlur: 2,
          shadowColor: 'rgba(0, 0, 0, 0.3)',
        },
        emphasis: {
          itemStyle: {
            color: deviationConfig.track2Color.value,
            opacity: 1,
            borderColor: '#fff',
            borderWidth: 2,
            shadowBlur: 10,
            shadowColor: hexToRgba(deviationConfig.track2Color.value, 0.5)
          },
          scale: 1.5
        },
      });
    }

    // 轨迹3当前位置（显示在真实位置）
    if (deviationConfig.track3X.value && deviationConfig.track3Y.value && track3Data.length > 0) {
      const lastPoint3 = track3Data[track3Data.length - 1];
      series.push({
        id: 'flow-current-3',
        name: t('flow.currentPosN', { n: 3 }),
        type: 'scatter',
        data: [lastPoint3],
        coordinateSystem: 'cartesian2d',
        symbolSize: pointSize.value * 1.2,
        itemStyle: {
          color: deviationConfig.track3Color.value,
          borderWidth: 2,
          borderColor: '#fff',
          shadowBlur: 2,
          shadowColor: 'rgba(0, 0, 0, 0.3)',
        },
        emphasis: {
          itemStyle: {
            color: deviationConfig.track3Color.value,
            opacity: 1,
            borderColor: '#fff',
            borderWidth: 2,
            shadowBlur: 10,
            shadowColor: hexToRgba(deviationConfig.track3Color.value, 0.5)
          },
          scale: 1.5
        },
      });
    }

    // 轨迹4当前位置（显示在真实位置）
    if (deviationConfig.track4X.value && deviationConfig.track4Y.value && track4Data.length > 0) {
      const lastPoint4 = track4Data[track4Data.length - 1];
      series.push({
        id: 'flow-current-4',
        name: t('flow.currentPosN', { n: 4 }),
        type: 'scatter',
        data: [lastPoint4],
        coordinateSystem: 'cartesian2d',
        symbolSize: pointSize.value * 1.2,
        itemStyle: {
          color: deviationConfig.track4Color.value,
          borderWidth: 2,
          borderColor: '#fff',
          shadowBlur: 2,
          shadowColor: 'rgba(0, 0, 0, 0.3)',
        },
        emphasis: {
          itemStyle: {
            color: deviationConfig.track4Color.value,
            opacity: 1,
            borderColor: '#fff',
            borderWidth: 2,
            shadowBlur: 10,
            shadowColor: hexToRgba(deviationConfig.track4Color.value, 0.5)
          },
          scale: 1.5
        },
      });
    }
  } else {
    // 非跟踪模式下，显示所有轨迹的当前位置
    // 轨迹1当前位置
    if (deviationConfig.track1X.value && deviationConfig.track1Y.value && track1Data.length > 0) {
      const lastPoint1 = track1Data[track1Data.length - 1];
      series.push({
        id: 'flow-current-1',
        name: t('flow.currentPosN', { n: 1 }),
        type: 'scatter',
        data: [lastPoint1],
        coordinateSystem: 'cartesian2d',
        symbolSize: pointSize.value * 1.2,
        itemStyle: {
          color: deviationConfig.track1Color.value,
          borderWidth: 2,
          borderColor: '#fff',
          shadowBlur: 2,
          shadowColor: 'rgba(0, 0, 0, 0.3)',
        },
        emphasis: {
          itemStyle: {
            color: deviationConfig.track1Color.value,
            opacity: 1,
            borderColor: '#fff',
            borderWidth: 2,
            shadowBlur: 10,
            shadowColor: hexToRgba(deviationConfig.track1Color.value, 0.5)
          },
          scale: 1.5
        },
      });
    }

    // 轨迹2当前位置
    if (deviationConfig.track2X.value && deviationConfig.track2Y.value && track2Data.length > 0) {
      const lastPoint2 = track2Data[track2Data.length - 1];
      series.push({
        id: 'flow-current-2',
        name: t('flow.currentPosN', { n: 2 }),
        type: 'scatter',
        data: [lastPoint2],
        coordinateSystem: 'cartesian2d',
        symbolSize: pointSize.value * 1.2,
        itemStyle: {
          color: deviationConfig.track2Color.value,
          borderWidth: 2,
          borderColor: '#fff',
          shadowBlur: 2,
          shadowColor: 'rgba(0, 0, 0, 0.3)',
        },
        emphasis: {
          itemStyle: {
            color: deviationConfig.track2Color.value,
            opacity: 1,
            borderColor: '#fff',
            borderWidth: 2,
            shadowBlur: 10,
            shadowColor: hexToRgba(deviationConfig.track2Color.value, 0.5)
          },
          scale: 1.5
        },
      });
    }

    // 轨迹3当前位置
    if (deviationConfig.track3X.value && deviationConfig.track3Y.value && track3Data.length > 0) {
      const lastPoint3 = track3Data[track3Data.length - 1];
      series.push({
        id: 'flow-current-3',
        name: t('flow.currentPosN', { n: 3 }),
        type: 'scatter',
        data: [lastPoint3],
        coordinateSystem: 'cartesian2d',
        symbolSize: pointSize.value * 1.2,
        itemStyle: {
          color: deviationConfig.track3Color.value,
          borderWidth: 2,
          borderColor: '#fff',
          shadowBlur: 2,
          shadowColor: 'rgba(0, 0, 0, 0.3)',
        },
        emphasis: {
          itemStyle: {
            color: deviationConfig.track3Color.value,
            opacity: 1,
            borderColor: '#fff',
            borderWidth: 2,
            shadowBlur: 10,
            shadowColor: hexToRgba(deviationConfig.track3Color.value, 0.5)
          },
          scale: 1.5
        },
      });
    }

    // 轨迹4当前位置
    if (deviationConfig.track4X.value && deviationConfig.track4Y.value && track4Data.length > 0) {
      const lastPoint4 = track4Data[track4Data.length - 1];
      series.push({
        id: 'flow-current-4',
        name: t('flow.currentPosN', { n: 4 }),
        type: 'scatter',
        data: [lastPoint4],
        coordinateSystem: 'cartesian2d',
        symbolSize: pointSize.value * 1.2,
        itemStyle: {
          color: deviationConfig.track4Color.value,
          borderWidth: 2,
          borderColor: '#fff',
          shadowBlur: 2,
          shadowColor: 'rgba(0, 0, 0, 0.3)',
        },
        emphasis: {
          itemStyle: {
            color: deviationConfig.track4Color.value,
            opacity: 1,
            borderColor: '#fff',
            borderWidth: 2,
            shadowBlur: 10,
            shadowColor: hexToRgba(deviationConfig.track4Color.value, 0.5)
          },
          scale: 1.5
        },
      });
    }
  }

  const historyColors = {
    [t('flow.trackN', { n: 1 })]: deviationConfig.track1Color.value,
    [t('flow.trackN', { n: 2 })]: deviationConfig.track2Color.value,
    [t('flow.trackN', { n: 3 })]: deviationConfig.track3Color.value,
    [t('flow.trackN', { n: 4 })]: deviationConfig.track4Color.value,
  };
  for (const item of series) {
    const color = historyColors[item.name];
    if (!color) continue;
    const useLargeMode = item.data.length >= LARGE_RENDER_THRESHOLD;
    item.symbolSize = pointSize.value;
    item.itemStyle = { color, opacity: 0.65 };
    item.emphasis = useLargeMode ? { disabled: true } : item.emphasis;
    item.silent = useLargeMode;
  }

  // 更新图例（过滤掉所有当前位置系列）
  const legendData = series.filter(s => !s.name.startsWith(t('flow.currentPos'))).map(s => {
    // 获取系列的颜色 - 处理函数和直接值的情况
    let seriesColor;
    if (typeof s.itemStyle.color === 'function') {
      // 如果是函数，获取默认颜色（非高亮状态）
      seriesColor = s.itemStyle.color({}, 0); // 传入索引0获取默认颜色
    } else {
      // 如果是直接的颜色值
      seriesColor = s.itemStyle.color;
    }
    
    return {
      name: s.name,
      itemStyle: { color: seriesColor }
    };
  });

  // 默认 merge 模式按系列 id diff，避免每帧销毁重建；仅有系列被移除时才用 replaceMerge 清理
  const currentSeriesIds = series.map(s => s.id);
  const seriesRemoved = lastSeriesIds.some(id => !currentSeriesIds.includes(id));
  chartInstance.value.setOption({
    legend: {
      data: legendData,
      right: 10,
      top: 10,
    },
    series: series
  }, seriesRemoved ? {
    replaceMerge: ['series'],
    lazyUpdate: true,
    silent: true
  } : {
    lazyUpdate: true,
    silent: true
  });
  lastSeriesIds = currentSeriesIds;
}

// 切换追踪模式
function toggleTracking() {
  isTracking.value = !isTracking.value;

  if (isTracking.value) {
    // 开启跟踪模式：以最新轨迹点为中心
    updateFlowData(); // 重新计算偏移量
    
    if (chartInstance.value) {
      const option = chartInstance.value.getOption();
      const xStart = Number(option.dataZoom?.[0]?.startValue);
      const xEnd = Number(option.dataZoom?.[0]?.endValue);
      const yStart = Number(option.dataZoom?.[1]?.startValue);
      const yEnd = Number(option.dataZoom?.[1]?.endValue);
      const xSpan = Number.isFinite(xStart) && Number.isFinite(xEnd)
        ? Math.abs(xEnd - xStart)
        : padding.value * 2;
      const ySpan = Number.isFinite(yStart) && Number.isFinite(yEnd)
        ? Math.abs(yEnd - yStart)
        : padding.value * 2;

      chartInstance.value.setOption({
        dataZoom: getDataZoomConfig(
          -xSpan / 2,
          xSpan / 2,
          -ySpan / 2,
          ySpan / 2,
        ),
      });
    }
  } else {
    // 关闭跟踪模式：将第一条轨迹的第一个点作为(0,0)参考点
    updateFlowData(); // 重新计算，设置新的偏移量
    
    if (chartInstance.value) {
      // 非跟踪模式下，使用maintainEqualAxisScale来保持坐标轴等比例关系
      maintainEqualAxisScale();
    }
  }
  
  // 更新数据缩放配置以响应跟踪模式的变化
  if (chartInstance.value) {
    // 更新坐标轴名称
    let xAxisName = '';
    let yAxisName = '';
    
    if (deviationConfig.track1X.value) {
      xAxisName = deviationConfig.track1X.value;
    } else if (deviationConfig.track2X.value) {
      xAxisName = deviationConfig.track2X.value;
    } else if (deviationConfig.track3X.value) {
      xAxisName = deviationConfig.track3X.value;
    } else if (deviationConfig.track4X.value) {
      xAxisName = deviationConfig.track4X.value;
    }
    
    if (deviationConfig.track1Y.value) {
      yAxisName = deviationConfig.track1Y.value;
    } else if (deviationConfig.track2Y.value) {
      yAxisName = deviationConfig.track2Y.value;
    } else if (deviationConfig.track3Y.value) {
      yAxisName = deviationConfig.track3Y.value;
    } else if (deviationConfig.track4Y.value) {
      yAxisName = deviationConfig.track4Y.value;
    }
    
    // 根据跟踪模式调整轴名称
    if (!isTracking.value && xAxisName) {
      xAxisName = `${xAxisName}`;
    }
    if (!isTracking.value && yAxisName) {
      yAxisName = `${yAxisName}`;
    }
    
    chartInstance.value.setOption({
      xAxis: {
        name: xAxisName || t('flow.xAxis'),
        moveOnMouseWheel: !isTracking.value,
        moveOnMouseMove: !isTracking.value
      },
      yAxis: {
        name: yAxisName || t('flow.yAxis'),
        moveOnMouseWheel: !isTracking.value,
        moveOnMouseMove: !isTracking.value
      }
    });
  }
}

// 重置缩放
function resetZoom() {
  if (!chartInstance.value) return;
  lastFlowRenderKey = '';
  updateFlowData();

  const allTrackPoints = [
    ...track1Data,
    ...track2Data,
    ...track3Data,
    ...track4Data,
  ];
  const width = chartContainerRef.value?.clientWidth || 1;
  const height = chartContainerRef.value?.clientHeight || 1;
  const viewport = isTracking.value
    ? fitDeviationPointsAroundCenter(allTrackPoints, 0, 0, width / height)
    : fitDeviationPoints(allTrackPoints, width / height);

  chartInstance.value.setOption({
    dataZoom: viewport
      ? getDataZoomConfig(
          viewport.xMin,
          viewport.xMax,
          viewport.yMin,
          viewport.yMax,
        )
      : getDataZoomConfig(-10, 10, -10, 10),
  });
}

// 更新点大小
function updatePointSize() {
  if (chartInstance.value) {
    // 获取当前图表配置
    const option = chartInstance.value.getOption();
    if (option && option.series) {
      // 更新所有系列的点大小，当前位置系列使用1.2倍大小
      const updatedSeries = option.series.map(series => {
        if (series.name === t('flow.currentPos') || series.name.startsWith(t('flow.currentPos'))) {
          return {
            ...series,
            symbolSize: pointSize.value * 1.2
          };
        } else {
          return {
            ...series,
            symbolSize: pointSize.value
          };
        }
      });
      
      chartInstance.value.setOption({
        series: updatedSeries
      });
    }
  }
}

// 处理legend点击事件
function handleLegendSelectChanged(params) {
  // 获取当前图表配置
  const selected = params.selected;
  
  // 当点击轨迹1时，同步控制当前位置1的显示状态
  if (params.name === t('flow.trackN', { n: 1 })) {
    // 获取轨迹1的选中状态
    const track1Selected = selected[t('flow.trackN', { n: 1 })];
    
    // 同步设置当前位置1的选中状态
    if (track1Selected !== undefined) {
      chartInstance.value.dispatchAction({
        type: 'legendToggleSelect',
        name: t('flow.currentPosN', { n: 1 })
      });
    }
  }
  
  // 当点击轨迹2时，同步控制当前位置2的显示状态
  if (params.name === t('flow.trackN', { n: 2 })) {
    // 获取轨迹2的选中状态
    const track2Selected = selected[t('flow.trackN', { n: 2 })];
    
    // 同步设置当前位置2的选中状态
    if (track2Selected !== undefined) {
      chartInstance.value.dispatchAction({
        type: 'legendToggleSelect',
        name: t('flow.currentPosN', { n: 2 })
      });
    }
  }
  
  // 当点击轨迹3时，同步控制当前位置3的显示状态
  if (params.name === t('flow.trackN', { n: 3 })) {
    // 获取轨迹3的选中状态
    const track3Selected = selected[t('flow.trackN', { n: 3 })];
    
    // 同步设置当前位置3的选中状态
    if (track3Selected !== undefined) {
      chartInstance.value.dispatchAction({
        type: 'legendToggleSelect',
        name: t('flow.currentPosN', { n: 3 })
      });
    }
  }

  // 当点击轨迹4时，同步控制当前位置4的显示状态
  if (params.name === t('flow.trackN', { n: 4 })) {
    // 获取轨迹4的选中状态
    const track4Selected = selected[t('flow.trackN', { n: 4 })];
    
    // 同步设置当前位置4的选中状态
    if (track4Selected !== undefined) {
      chartInstance.value.dispatchAction({
        type: 'legendToggleSelect',
        name: t('flow.currentPosN', { n: 4 })
      });
    }
  }

  updateFlowData();
}

// 数据更新改为事件驱动：isPaused 由 pause/resume 控制，flowData watch 回调中检查该标志
let isPaused = true;

function pauseDataUpdate() {
  isPaused = true;
}

function resumeDataUpdate() {
  isPaused = false;
  scheduleFlowDataUpdate();
}

function scheduleFlowDataUpdate() {
  if (flowUpdateFrame !== null || document.hidden) return;
  flowUpdateFrame = requestAnimationFrame(() => {
    flowUpdateFrame = null;
    updateFlowData();
  });
}

const isDataUpdating = ref(true);

function toggleDataUpdate() {
  isDataUpdating.value = !isDataUpdating.value;
  if (isDataUpdating.value) {
    resumeDataUpdate();
  } else {
    pauseDataUpdate();
  }
}

function handleChartDblClick(params) {
  // params 包含了双击事件的相关信息，如坐标、数据等
  if (params.componentType === 'series') {
    const dataIndex = params.dataIndex;
    const seriesName = params.seriesName;
    let rawTime = null;
    
    // 根据系列名称获取对应的时间戳
    if (seriesName === t('flow.trackN', { n: 1 }) && track1ToRawIndex[dataIndex] !== undefined) {
      rawTime = plotData.value.timestamp[track1ToRawIndex[dataIndex]];
    } else if (seriesName === t('flow.trackN', { n: 2 }) && track2ToRawIndex[dataIndex] !== undefined) {
      rawTime = plotData.value.timestamp[track2ToRawIndex[dataIndex]];
    } else if (seriesName === t('flow.trackN', { n: 3 }) && track3ToRawIndex[dataIndex] !== undefined) {
      rawTime = plotData.value.timestamp[track3ToRawIndex[dataIndex]];
    } else if (seriesName === t('flow.trackN', { n: 4 }) && track4ToRawIndex[dataIndex] !== undefined) {
      rawTime = plotData.value.timestamp[track4ToRawIndex[dataIndex]];
    } else if (seriesName === t('flow.currentPosN', { n: 1 }) && track1ToRawIndex.length > 0) {
      // 当前位置1使用轨迹1的最后一个时间戳
      rawTime = plotData.value.timestamp[track1ToRawIndex[track1ToRawIndex.length - 1]];
    } else if (seriesName === t('flow.currentPosN', { n: 2 }) && track2ToRawIndex.length > 0) {
      // 当前位置2使用轨迹2的最后一个时间戳
      rawTime = plotData.value.timestamp[track2ToRawIndex[track2ToRawIndex.length - 1]];
    } else if (seriesName === t('flow.currentPosN', { n: 3 }) && track3ToRawIndex.length > 0) {
      // 当前位置3使用轨迹3的最后一个时间戳
      rawTime = plotData.value.timestamp[track3ToRawIndex[track3ToRawIndex.length - 1]];
    } else if (seriesName === t('flow.currentPosN', { n: 4 }) && track4ToRawIndex.length > 0) {
      // 当前位置4使用轨迹4的最后一个时间戳
      rawTime = plotData.value.timestamp[track4ToRawIndex[track4ToRawIndex.length - 1]];
    }
    
    if (rawTime !== null) {
      const parts = rawTime.toString().split('.');
      const targetTime = parts[0] + (parts[1] ? '.' + parts[1].substring(0, 2) : '.00');

      searchQuery.value = '"time":' + targetTime;
    }
  }
}

// 鼠标悬停事件处理函数
const handleMouseOver = function(params) {
  if (!chartInstance.value) return;
  
  // 清除之前的高亮超时定时器
  if (highlightTimeout.value) {
    clearTimeout(highlightTimeout.value);
    highlightTimeout.value = null;
  }
  
  const seriesName = params.seriesName;
  const dataIndex = params.dataIndex;
  let targetTime = null;
  
  // 获取当前悬停点的时间
  if (seriesName === t('flow.trackN', { n: 1 }) && track1ToRawIndex[dataIndex] !== undefined) {
    targetTime = plotData.value.timestamp[track1ToRawIndex[dataIndex]];
  } else if (seriesName === t('flow.trackN', { n: 2 }) && track2ToRawIndex[dataIndex] !== undefined) {
    targetTime = plotData.value.timestamp[track2ToRawIndex[dataIndex]];
  } else if (seriesName === t('flow.trackN', { n: 3 }) && track3ToRawIndex[dataIndex] !== undefined) {
    targetTime = plotData.value.timestamp[track3ToRawIndex[dataIndex]];
  } else if (seriesName === t('flow.trackN', { n: 4 }) && track4ToRawIndex[dataIndex] !== undefined) {
    targetTime = plotData.value.timestamp[track4ToRawIndex[dataIndex]];
  } else if (seriesName === t('flow.currentPosN', { n: 1 }) && track1ToRawIndex.length > 0) {
    targetTime = plotData.value.timestamp[track1ToRawIndex[track1ToRawIndex.length - 1]];
  } else if (seriesName === t('flow.currentPosN', { n: 2 }) && track2ToRawIndex.length > 0) {
    targetTime = plotData.value.timestamp[track2ToRawIndex[track2ToRawIndex.length - 1]];
  } else if (seriesName === t('flow.currentPosN', { n: 3 }) && track3ToRawIndex.length > 0) {
    targetTime = plotData.value.timestamp[track3ToRawIndex[track3ToRawIndex.length - 1]];
  } else if (seriesName === t('flow.currentPosN', { n: 4 }) && track4ToRawIndex.length > 0) {
    targetTime = plotData.value.timestamp[track4ToRawIndex[track4ToRawIndex.length - 1]];
  }
  
  if (targetTime === null) return;
  
  // 首先清理之前的高亮状态
  handleMouseOut();
  
  // 找到所有轨迹中相同时间的点并高亮（包括当前轨迹）
  const highlightData = [];
  const series = chartInstance.value.getOption().series;
  
  // 通过时间索引表一次查找各轨迹中相同时间的点（替代原来的逐轨迹 O(N) 线性扫描）
  const timeEntry = timeIndexMap.get(targetTime);
  if (timeEntry) {
    const trackHighlight = [
      [t('flow.trackN', { n: 1 }), timeEntry.track1],
      [t('flow.trackN', { n: 2 }), timeEntry.track2],
      [t('flow.trackN', { n: 3 }), timeEntry.track3],
      [t('flow.trackN', { n: 4 }), timeEntry.track4],
    ];
    for (const [trackName, trackIndex] of trackHighlight) {
      if (trackIndex === undefined) continue;
      const seriesIndex = series.findIndex(s => s.name === trackName);
      if (seriesIndex !== -1) {
        highlightData.push({
          seriesIndex: seriesIndex,
          dataIndex: trackIndex
        });
      }
    }
  }
  
  // 高亮显示所有相同时间的点
  if (highlightData.length > 0) {
    chartInstance.value.dispatchAction({
      type: 'highlight',
      seriesIndex: highlightData.map(h => h.seriesIndex),
      dataIndex: highlightData.map(h => h.dataIndex)
    });
  }

  // 显示graphic的内容
  let dataIndexModifed = 0;
  let xField = 'X';
  let yField = 'Y';
  let currentTime = null;
  let originX = params.value[0];
  let originY = params.value[1];
  
  // 根据系列名称选择对应的轴字段和时间
  if (seriesName === t('flow.trackN', { n: 1 }) && deviationConfig.track1X.value && deviationConfig.track1Y.value) {
    xField = deviationConfig.track1X.value;
    yField = deviationConfig.track1Y.value;
    dataIndexModifed = track1ToRawIndex[params.dataIndex];
    currentTime = plotData.value.timestamp[dataIndexModifed];
    originX = plotData.value[deviationConfig.track1X.value][dataIndexModifed];
    originY = plotData.value[deviationConfig.track1Y.value][dataIndexModifed];
  } else if (seriesName === t('flow.trackN', { n: 2 }) && deviationConfig.track2X.value && deviationConfig.track2Y.value) {
    xField = deviationConfig.track2X.value;
    yField = deviationConfig.track2Y.value;
    dataIndexModifed = track2ToRawIndex[params.dataIndex];
    currentTime = plotData.value.timestamp[dataIndexModifed];
    originX = plotData.value[deviationConfig.track2X.value][dataIndexModifed];
    originY = plotData.value[deviationConfig.track2Y.value][dataIndexModifed];
  } else if (seriesName === t('flow.trackN', { n: 3 }) && deviationConfig.track3X.value && deviationConfig.track3Y.value) {
    xField = deviationConfig.track3X.value;
    yField = deviationConfig.track3Y.value;
    dataIndexModifed = track3ToRawIndex[params.dataIndex];
    currentTime = plotData.value.timestamp[dataIndexModifed];
    originX = plotData.value[deviationConfig.track3X.value][dataIndexModifed];
    originY = plotData.value[deviationConfig.track3Y.value][dataIndexModifed];
  } else if (seriesName === t('flow.trackN', { n: 4 }) && deviationConfig.track4X.value && deviationConfig.track4Y.value) {
    xField = deviationConfig.track4X.value;
    yField = deviationConfig.track4Y.value;
    dataIndexModifed = track4ToRawIndex[params.dataIndex];
    currentTime = plotData.value.timestamp[dataIndexModifed];
    originX = plotData.value[deviationConfig.track4X.value][dataIndexModifed];
    originY = plotData.value[deviationConfig.track4Y.value][dataIndexModifed];
  } else if (seriesName === t('flow.currentPosN', { n: 1 }) && deviationConfig.track1X.value && deviationConfig.track1Y.value) {
    // 当前位置1使用轨迹1的字段和时间
    xField = deviationConfig.track1X.value;
    yField = deviationConfig.track1Y.value;
    dataIndexModifed = track1ToRawIndex[track1Data.length - 1];
    currentTime = plotData.value.timestamp[dataIndexModifed];
    originX = plotData.value[deviationConfig.track1X.value][dataIndexModifed];
    originY = plotData.value[deviationConfig.track1Y.value][dataIndexModifed];
  } else if (seriesName === t('flow.currentPosN', { n: 2 }) && deviationConfig.track2X.value && deviationConfig.track2Y.value) {
    // 当前位置2使用轨迹2的字段和时间
    xField = deviationConfig.track2X.value;
    yField = deviationConfig.track2Y.value;
    dataIndexModifed = track2ToRawIndex[track2Data.length - 1];
    currentTime = plotData.value.timestamp[dataIndexModifed];
    originX = plotData.value[deviationConfig.track2X.value][dataIndexModifed];
    originY = plotData.value[deviationConfig.track2Y.value][dataIndexModifed];
  } else if (seriesName === t('flow.currentPosN', { n: 3 }) && deviationConfig.track3X.value && deviationConfig.track3Y.value) {
    // 当前位置3使用轨迹3的字段和时间
    xField = deviationConfig.track3X.value;
    yField = deviationConfig.track3Y.value;
    dataIndexModifed = track3ToRawIndex[track3Data.length - 1];
    currentTime = plotData.value.timestamp[dataIndexModifed];
    originX = plotData.value[deviationConfig.track3X.value][dataIndexModifed];
    originY = plotData.value[deviationConfig.track3Y.value][dataIndexModifed];
  } else if (seriesName === t('flow.currentPosN', { n: 4 }) && deviationConfig.track4X.value && deviationConfig.track4Y.value) {
    // 当前位置4使用轨迹4的字段和时间
    xField = deviationConfig.track4X.value;
    yField = deviationConfig.track4Y.value;
    dataIndexModifed = track4ToRawIndex[track4Data.length - 1];
    currentTime = plotData.value.timestamp[dataIndexModifed];
    originX = plotData.value[deviationConfig.track4X.value][dataIndexModifed];
    originY = plotData.value[deviationConfig.track4Y.value][dataIndexModifed];
  }

  const option = chartInstance.value.getOption();
  if (!option) return;
  const text = `${params.seriesName} 🕐time: ${currentTime.toFixed(3)} 📍${xField}:${originX.toFixed(3)}, ${yField}:${originY.toFixed(3)}`;
  chartInstance.value.setOption({ graphic: [{ style: { text } }] });
};

// 鼠标移出事件处理函数
const handleMouseOut = function() {
  if (!chartInstance.value) return;
  chartInstance.value.dispatchAction({ type: 'downplay' });

  // 显示graphic的内容
  chartInstance.value.setOption({ graphic: [{ style: { text: '' } }] });
};

// 组件挂载时初始化
onMounted(() => {
  // 修复：使用nextTick确保DOM完全渲染后再初始化图表
  nextTick(() => {
    // 确保chartRef.value存在且有尺寸后再初始化图表
    if (chartRef.value && chartRef.value.clientWidth > 0 && chartRef.value.clientHeight > 0) {
      initChart();
    } else {
      // 如果DOM还没有尺寸，添加一个小延迟再次尝试
      setTimeout(() => {
        if (chartRef.value) {
          initChart();
        }
      }, 300);
    }
  });

  watch(deviceConnected, () => {
    if (deviceConnected.value) {
      enableWindow.value = true;
      // 每100ms更新一次数据
      resumeDataUpdate();
    } else {
      pauseDataUpdate();
    }
  });

  watch(enableWindow, () => {
    updateFlowData();
  });
});

watch(resolvedTheme, () => {
  nextTick(() => {
    initChart();
    updateFlowData();
  });
});

// 数据流驱动更新：flowData 内部为原位 push，监听 timestamp 长度变化即可感知新数据
watch(() => flowData.value.timestamp?.length, () => {
  if (!isPaused) scheduleFlowDataUpdate();
});

// 组件卸载时清理资源
onUnmounted(() => {
  if (flowUpdateFrame !== null) {
    cancelAnimationFrame(flowUpdateFrame);
    flowUpdateFrame = null;
  }
  if (chartInstance.value) {
    // 移除事件监听
    chartInstance.value.off('mouseover', handleMouseOver);
    chartInstance.value.off('mouseout', handleMouseOut);
    chartInstance.value.off('globalout', handleMouseOut);
    chartInstance.value.off('dblclick', handleChartDblClick); // 移除双击事件监听
    chartInstance.value.off('legendselectchanged', handleLegendSelectChanged); // 移除图例点击事件监听
    
    chartInstance.value.dispose();
  }
  disconnectResizeObserver();
  // 清理高亮超时定时器
  if (highlightTimeout.value) {
    clearTimeout(highlightTimeout.value);
    highlightTimeout.value = null;
  }
  // 清理滚轮事件监听器
  unbindWheelHandler(handleWheel);
});
</script>

<style scoped>
.deviation-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  container-type: inline-size;
  color: var(--app-text);
  background-color: var(--app-surface);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px 0 var(--app-shadow);
}

.control-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: var(--app-surface-muted);
  border-bottom: 1px solid var(--app-border);
  height: 50px;
  box-sizing: border-box;
}

.controls {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  position: relative;
}

.switch-label {
  font-size: 12px;
  color: var(--app-text-muted);
  margin-right: 5px;
  line-height: 1;
}

.control-btn {
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
  line-height: 1;
  display: flex;
  align-items: center;
}

.chart-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  min-height: 0;
  /* 移除居中显示，让图表自然填充 */
  display: block;
}

.chart {
  width: 100%;
  height: 100%;
  touch-action: none;
  overscroll-behavior: none;
  /* 添加最小尺寸确保图表始终有大小 */
  min-width: 200px;
  min-height: 200px;
}

.point-size-control {
  display: flex;
  align-items: center;
  margin: 0 10px;
}

.size-label {
  margin-right: 5px;
  font-size: 12px;
  color: var(--app-text-muted);
  line-height: 1;
}

.point-slider {
  width: 50px;
  margin: 0 5px;
}

.size-value {
  width: 24px;
  text-align: center;
  font-size: 12px;
}

/* 添加滑块样式 */
:deep(.el-slider) {
  --el-slider-height: 5px;
  --el-slider-button-size: 22px;
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
  background-image: url("data:image/svg+xml;charset=utf-8;base64,PHN2ZyBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHN0eWxlPSJoZWlnaHQ6IDE2cHg7IHdpZHRoOiAxNnB4OyI+PHBhdGggZD0iTTUxMiA2NGE0NDggNDQ4IDAgMCAxIDEzMC4yNCAxOS4yMzJjLTM3LjQwOCAxNDIuNzItMTUuMDQgMjM0LjQgNzUuODQgMjY0LjcwNGwxNy4yOCA1Ljg4OCAxNi40OCA1Ljg4OGMxMDUuNTM2IDM4Ljk3NiAxMjkuMzc2IDcxLjc0NCAxMDQuNjQgMTQ1Ljk4NC0xMS4yIDMzLjYtMzQuOTQ0IDQ5LjgyNC0xMDEuNjk2IDczLjE1MmwtMzUuODQgMTIuMjI0LTE3LjQ0IDYuMzA0Yy03Mi40NDggMjcuMTA0LTEwNC40MTYgNTIuMTI4LTEyMi41NiAxMDYuNTYtMjYuMTQ0IDc4LjM2OCA4LjY0IDE1My4zNzYgOTguMTc2IDIyNC42MDhBNDQ1Ljc5MiA0NDUuNzkyIDAgMCAxIDUxMiA5NjBjLTMyLjg2NCAwLTY0Ljg5Ni0zLjUyLTk1Ljc0NC0xMC4yNCA1Ni4wOTYtNDMuMDcyIDY2LjA0OC0xMDguOCAyNC44LTE5MS4yOTYtMjYuODgtNTMuNjk2LTY5LjI0OC04My4xMzYtMTI5LjkyLTEwMS4zNDRhNDgwLjk2IDQ4MC45NiAwIDAgMC0xOS43NDQtNS40NGwtMzMuNDA4LTcuOTM2Yy0zNC4yNC04LjEyOC00OC40OC0xMy45NTItNTQuNTI4LTIxLjYzMi02LjQtOC4xNi02LjM2OC0yNS45ODQgNi41OTItNjAuMzJsMi41Ni02LjY1NmM1My44MjQtMTM0LjU2IDE1LjEwNC0yMTkuMDcyLTEwNi40NjQtMjMzLjA4OEMxNzcuNjMyIDE2OS42IDMzMi40OCA2NCA1MTIgNjR6TTgyLjQ2NCAzODQuMjU2Yzg5LjYgMy42NDggMTEwLjYyNCA0My4wNCA3My41MDQgMTQwLjA2NGwtMi43ODQgNy4wNGMtMjMuMDQgNTcuNjk2LTI0LjEyOCA5OS42NDgtMC4wNjQgMTMwLjI3MiAxNy40MDggMjIuMjA4IDM4Ljg0OCAzMS43NzYgODIuNTYgNDIuNTZsMzMuMjggNy44NzJjOS4wMjQgMi4yMDggMTYuNjQgNC4yMjQgMjMuNzc2IDYuMzY4IDQ1LjI0OCAxMy41NjggNzMuMjQ4IDMzLjAyNCA5MS4wNzIgNjguNjcyIDM1LjIgNzAuMzY4IDIxLjQ0IDExMS4zNi01MS44NCAxMzUuMjMyQzE3NC4xNzYgODUzLjAyNCA2NCA2OTUuMzYgNjQgNTEyYzAtNDQuMzg0IDYuNDY0LTg3LjI2NCAxOC40NjQtMTI3Ljc0NHogbTYxOS44MDgtMjc3Ljk1MkM4NTQuNTYgMTc3LjgyNCA5NjAgMzMyLjYwOCA5NjAgNTEyYzAgMTYzLjUyLTg3LjYxNiAzMDYuNjI0LTIxOC40OTYgMzg0LjgzMi04OC4zMi02MS44MjQtMTE5LjY4LTExOS4xNjgtMTAxLjg1Ni0xNzIuNjQgMTEuMTY4LTMzLjUzNiAzNC44OC00OS43NiAxMDEuMzQ0LTczLjAyNGwxNy4xODQtNS44NTZjOTguNzItMzIuODk2IDEzOC4wNDgtNTYuNTEyIDE1OS4wNC0xMTkuMzYgNDIuMTc2LTEyNi41OTItMTUuNTUyLTE4NC4zMi0xNzguODgtMjM4LjcyLTQ3LjItMTUuNzQ0LTYyLjQ5Ni02OS42MzItMzguNzUyLTE3MC4wOGwyLjY4OC0xMC44OHogbS0yMzEuMTM2IDMyMy41MmMwIDM0LjY1NiA0MS4wODggODIuMTc2IDEyMy4yMzIgODIuMTc2IDgyLjE3NiAwIDgyLjE3Ni04Mi4xNDQgMC0xMjMuMjMyLTgyLjE0NC00MS4wODgtMTIzLjIgNi40MzItMTIzLjIgNDEuMDg4eiIgZmlsbD0iIzVDNUM1QyI+PC9wYXRoPjwvc3ZnPg==");
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  border: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

:deep(.el-slider__button:hover) {
  transform: scale(1.15);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

:deep(.el-slider__button:active) {
  transform: scale(0.95);
}

/* 新增右侧按钮容器样式 */
.right-buttons {
  display: flex;
  align-items: center;
  margin-left: auto; /* 自动占据剩余空间，将按钮推到右侧 */
}

@container (max-width: 680px) {
  .tracking-text,
  .size-label {
    display: none;
  }

  .tracking-button {
    padding-inline: 8px;
  }

  .point-size-control {
    margin-inline: 4px;
  }
}

/* 配置对话框样式 - 参考FlowData的现代化设计 */
.chart-config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.chart-config-section {
  margin-bottom: 15px;
  padding: 15px;
  background-color: var(--app-surface-muted);
  border-radius: 8px;
  border: 1px solid var(--app-border);
  transition: all 0.3s ease;
}

.chart-config-section:hover {
  background-color: var(--app-hover);
  border-color: var(--app-border-strong);
}

.source-selectors {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 针对不同屏幕尺寸的响应式调整 */
@media (max-width: 768px) {
  .chart-config-grid {
    grid-template-columns: 1fr;
  }
}

/* 对话框内容样式优化 */
:deep(.el-dialog__body) {
  padding: 20px;
}

:deep(.el-dialog__title) {
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text);
}

/* 选择器样式优化 */
:deep(.el-select) {
  --el-select-border-color-hover: #409eff;
}

:deep(.el-select__wrapper) {
  border-radius: 4px;
  transition: all 0.2s ease;
}

:deep(.el-select__wrapper:hover) {
  border-color: #409eff;
}
</style>
