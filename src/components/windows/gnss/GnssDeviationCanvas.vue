<template>
  <div class="deviation-container">
    <div class="control-panel">
      <div class="controls">
        <span class="switch-label">{{ t('gnss.deviation.tracking') }}:</span>
        <el-switch
          v-model="isTracking"
          :aria-label="t('gnss.deviation.tracking')"
          :title="t('gnss.deviation.tracking')"
          @change="toggleTracking"
          class="tracking-switch"
        />
        <!-- 添加轨迹点尺寸调节滑块 -->
        <div class="point-size-control">
          <span class="size-label">{{ t('gnss.deviation.size') }}:</span>
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

        <div class="right-buttons">
          <el-button :disabled="deviceConnected" type="default" size="small" @click="toggleSlideWindow">
            <el-icon v-if="enableWindow"><CircleClose /></el-icon>
            <el-icon v-else><CircleCheck /></el-icon>
            &nbsp;{{ enableWindow ? t('gnss.deviation.disableWindow') : t('gnss.deviation.enableWindow') }}
          </el-button>
          <el-button type="primary" size="small" @click="resetZoom" class="control-btn zoom-btn"><el-icon><RefreshLeft /></el-icon>&nbsp;{{ t('gnss.deviation.resetLayout') }}</el-button>
          <el-button type="primary" size="small" @click="clearTrack" class="control-btn clear-btn"><el-icon><Delete /></el-icon>&nbsp;{{ t('gnss.deviation.clear') }}</el-button>
        </div>
      </div>
    </div>
    <div class="chart-container" ref="chartContainerRef">
      <div ref="chartRef" class="chart"></div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useNmea } from '@/composables/gnss/useNmea';
import { useDevice } from '@/hooks/useDevice'
import { useTheme } from '@/composables/useTheme'
import { useDeviationChart } from '../common/deviation/useDeviationChart';
import {
  clampVisibleSpan,
  fitDeviationPoints,
  fitDeviationPointsAroundCenter,
  GNSS_MIN_VISIBLE_SPAN_METERS,
} from '@/core/deviation/DeviationViewport'
import { t } from '@/i18n'

const {
  deviationPoints,
  latestGgaPosition,
  enableWindow,
  clearData,
} = useNmea();
const { deviceConnected } = useDevice()
const { chartTheme, resolvedTheme } = useTheme()

const DEVIATION_WINDOW_POINTS = 10000;
const plotData = computed(() => {
  return enableWindow.value
    ? deviationPoints.value.slice(-DEVIATION_WINDOW_POINTS)
    : deviationPoints.value;
});

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
} = useDeviationChart({ initialTracking: true });
// const deviation = ref('');

// const maxTrackPoints = 3600*12;
const LARGE_RENDER_THRESHOLD = 2000;
const PROGRESSIVE_RENDER_THRESHOLD = 10000;
const RENDER_BATCH_SIZE = 5000;
const RENDER_INTERVAL_MS = 200;
let lastNmeaRenderKey = '';
let nmeaUpdateTimer = null;
let nmeaUpdateFrame = null;
let forceNextNmeaRender = false;
let themeRefreshFrame = null;
// 跟踪视口半跨度缓存（米）。避免每次渲染调用 getOption() 全量拷贝大数据
let trackingXHalfSpan = 10;
let trackingYHalfSpan = 10;

// 用户拖拽产生的偏移（相对于最新数据点），跟踪模式下保持此偏移不回中
let panOffsetX = 0;
let panOffsetY = 0;

// 拖拽状态
const DRAG_THRESHOLD_PX = 3;
let isDragging = false;
let dragStartClientX = 0;
let dragStartClientY = 0;
let dragLastClientX = 0;
let dragLastClientY = 0;
let dragHasMoved = false;
// 拖拽起始时的 dataZoom 范围与像素到数据的转换比
let dragStartXStart = 0;
let dragStartXEnd = 0;
let dragStartYStart = 0;
let dragStartYEnd = 0;
let dragXPixelToData = 1;
let dragYPixelToData = 1;

function toggleSlideWindow() {
  enableWindow.value = !enableWindow.value;
  handleNmeaUpdate();
}

function formatDistance(value) {
  const numericValue = Number(value);
  if (Math.abs(numericValue) < 0.01) return `${(numericValue * 100).toFixed(2)} cm`;
  return `${numericValue.toFixed(2)} m`;
}

function initChart() {
  if (!createChart()) return;
  lastNmeaRenderKey = '';
  // initChart 的 dataZoom 固定为 -10..10，同步重置跟踪视口跨度缓存
  trackingXHalfSpan = 10;
  trackingYHalfSpan = 10;
  const colors = chartTheme.value;

  const option = {
    animation: false,
    hoverAnimation: false,
    backgroundColor: colors.background,
    textStyle: { color: colors.text },
    tooltip: {
      trigger: 'axis',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text },
      formatter: function(params) {
        const point = params[0].value;
        return `${t('gnss.deviation.tooltipPositionPrefix')}: (${formatDistance(point[0])}, ${formatDistance(point[1])})`;
      },
      show: false,
    },
    legend: {
      data: [
        {
          name: t('gnss.deviation.historyTrack'),
          itemStyle: {
            color: 'grey',
          },
        },
        {
          name: t('gnss.deviation.currentPosition'),
        },
      ],
      right: 10,
      top: 10,
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 16,
      textStyle: {
        color: colors.text,
        fontSize: 12,
        lineHeight: 14,
        verticalAlign: 'middle',
        padding: [0, 0, 0, 2],
      },
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
      name: '',
      nameLocation: 'middle',
      nameGap: 30,
      axisLabel: {
        color: colors.textMuted,
        formatter: function(value) {
          return formatDistance(value);
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
      name: '',
      nameLocation: 'middle',
      nameGap: 40,
      axisLabel: {
        color: colors.textMuted,
        formatter: function(value) {
          return formatDistance(value);
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
    series: [
      {
        name: t('gnss.deviation.historyTrack'),
        type: 'scatter',
        data: [],
        coordinateSystem: 'cartesian2d',
        symbolSize: pointSize.value,
        symbol: 'circle',
        itemStyle: {
          color: '#4e6ef2',
          opacity: 0.6,
        },
        sampling: 'lttb',
        large: true,
        largeThreshold: LARGE_RENDER_THRESHOLD,
        progressive: RENDER_BATCH_SIZE,
        progressiveThreshold: PROGRESSIVE_RENDER_THRESHOLD,
        progressiveChunkMode: 'mod',
        silent: false,
      },
      {
        name: t('gnss.deviation.currentPosition'),
        type: 'scatter',
        data: [],
        coordinateSystem: 'cartesian2d',
        symbolSize: pointSize.value,
        itemStyle: {
          color: '#ff4d4f',
        },
        z: 10,
      },
    ],
  };

  chartInstance.value.setOption(option);
  setupResizeObserver(maintainEqualAxisScale);

  // 直接在DOM元素上绑定事件监听器
  bindWheelHandler(handleWheel);

  // 绑定拖拽事件（跟踪模式下拖拽平移视图）
  const dom = chartInstance.value.getDom();
  if (dom) {
    dom.addEventListener('mousedown', handleDragStart);
  }
}

function handleWheel(e) {
  e.preventDefault();
  e.stopPropagation();
  
  // RTKLIB的逻辑：
  // ds=pow(2.0,-WheelDelta/1200.0)
  // GraphT->GetScale(xs,ys);
  // GraphT->SetScale(xs*ds,ys*ds);
  const wheelDelta = -e.deltaY; // 转换为与RTKLIB相似的WheelDelta值
  const zoomRatio = Math.pow(2.0, -wheelDelta / 1200.0);

  const opt = chartInstance.value.getOption();
  const xStart = opt.dataZoom[0].startValue;
  const xEnd = opt.dataZoom[0].endValue;
  const yStart = opt.dataZoom[1].startValue;
  const yEnd = opt.dataZoom[1].endValue;
  
  const limit = 10000;
  const xSpan = clampVisibleSpan(
    (xEnd - xStart) * zoomRatio,
    GNSS_MIN_VISIBLE_SPAN_METERS,
    limit * 2,
  );
  const ySpan = clampVisibleSpan(
    (yEnd - yStart) * zoomRatio,
    GNSS_MIN_VISIBLE_SPAN_METERS,
    limit * 2,
  );

  const xCenter = (xStart + xEnd) / 2;
  const yCenter = (yStart + yEnd) / 2;
  const newXStart = Math.max(-limit, xCenter - xSpan / 2);
  const newXEnd = Math.min(limit, xCenter + xSpan / 2);
  const newYStart = Math.max(-limit, yCenter - ySpan / 2);
  const newYEnd = Math.min(limit, yCenter + ySpan / 2);
  trackingXHalfSpan = (newXEnd - newXStart) / 2;
  trackingYHalfSpan = (newYEnd - newYStart) / 2;

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

function handleDragStart(e) {
  if (e.button !== 0 || !chartInstance.value) return;
  isDragging = true;
  dragHasMoved = false;
  dragStartClientX = e.clientX;
  dragStartClientY = e.clientY;
  dragLastClientX = e.clientX;
  dragLastClientY = e.clientY;

  // 记录拖拽起始时的 dataZoom 范围
  const opt = chartInstance.value.getOption();
  dragStartXStart = opt.dataZoom[0].startValue;
  dragStartXEnd = opt.dataZoom[0].endValue;
  dragStartYStart = opt.dataZoom[1].startValue;
  dragStartYEnd = opt.dataZoom[1].endValue;

  // 计算像素到数据的转换比（基于起始位置）
  const xData0 = chartInstance.value.convertFromPixel({ xAxisIndex: 0 }, 0);
  const xData1 = chartInstance.value.convertFromPixel({ xAxisIndex: 0 }, 1);
  dragXPixelToData = xData1 - xData0;
  const yData0 = chartInstance.value.convertFromPixel({ yAxisIndex: 0 }, 0);
  const yData1 = chartInstance.value.convertFromPixel({ yAxisIndex: 0 }, 1);
  dragYPixelToData = yData1 - yData0;

  window.addEventListener('mousemove', handleDragMove);
  window.addEventListener('mouseup', handleDragEnd);
}

function handleDragMove(e) {
  if (!isDragging || !chartInstance.value) return;
  const dx = e.clientX - dragLastClientX;
  const dy = e.clientY - dragLastClientY;
  const totalDx = e.clientX - dragStartClientX;
  const totalDy = e.clientY - dragStartClientY;
  dragLastClientX = e.clientX;
  dragLastClientY = e.clientY;
  if (!dragHasMoved && Math.hypot(totalDx, totalDy) >= DRAG_THRESHOLD_PX) {
    dragHasMoved = true;
  }
  if (!dragHasMoved) return;

  const limit = 10000;
  const xSpan = dragStartXEnd - dragStartXStart;
  const ySpan = dragStartYEnd - dragStartYStart;

  // 以拖拽起始范围为基准，内容跟随鼠标移动
  // 屏幕 Y 向下而数据 Y 向上，dragYPixelToData 为负，取反后方向一致
  let newXStart = dragStartXStart - totalDx * dragXPixelToData;
  let newXEnd = dragStartXEnd - totalDx * dragXPixelToData;
  let newYStart = dragStartYStart - totalDy * dragYPixelToData;
  let newYEnd = dragStartYEnd - totalDy * dragYPixelToData;

  if (newXStart < -limit) {
    newXStart = -limit;
    newXEnd = -limit + xSpan;
  } else if (newXEnd > limit) {
    newXEnd = limit;
    newXStart = limit - xSpan;
  }
  if (newYStart < -limit) {
    newYStart = -limit;
    newYEnd = -limit + ySpan;
  } else if (newYEnd > limit) {
    newYEnd = limit;
    newYStart = limit - ySpan;
  }

  trackingXHalfSpan = (newXEnd - newXStart) / 2;
  trackingYHalfSpan = (newYEnd - newYStart) / 2;

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

  // 更新拖拽偏移：新视口中心相对于最新数据点的偏移
  const latestPoint = plotData.value[plotData.value.length - 1];
  if (latestPoint) {
    panOffsetX = (newXStart + newXEnd) / 2 - latestPoint[0];
    panOffsetY = (newYStart + newYEnd) / 2 - latestPoint[1];
  }
}

function handleDragEnd() {
  if (!isDragging) return;
  isDragging = false;
  window.removeEventListener('mousemove', handleDragMove);
  window.removeEventListener('mouseup', handleDragEnd);
}

function qualityToColor (num) {
  // 0：无效解；1：单点定位解；2：伪距差分；4：固定解；5：浮动解。
  switch (num) {
    case 0:
      return 'grey'
    case 1:
      return 'red'
    case 2:
      return 'blue'
    case 4:
      return 'green'
    case 5:
      return 'orange'
    default:
      return 'grey'
  }
}

function handleNmeaUpdate() {
  const latest = latestGgaPosition.value;
  if (!latest) return;
  const points = plotData.value;
  const oldestTrackPoint = points[0];
  const latestTrackPoint = points[points.length - 1];
  if (!latestTrackPoint) return;
  const renderKey = latestTrackPoint
    ? `${points.length}:${oldestTrackPoint[0]}:${oldestTrackPoint[1]}:${latestTrackPoint[0]}:${latestTrackPoint[1]}:${latestTrackPoint[2]}:${isTracking.value}:${enableWindow.value}`
    : `empty:${isTracking.value}:${enableWindow.value}`;
  if (!forceNextNmeaRender && renderKey === lastNmeaRenderKey) return;
  forceNextNmeaRender = false;
  lastNmeaRenderKey = renderKey;

  const currentQuality = Number(latestTrackPoint[2] ?? latest.quality);
  const displayTrackData = points;
  const currentDisplayPoint = [
    latestTrackPoint[0],
    latestTrackPoint[1],
    currentQuality,
  ];

  // 跟踪模式：数据保持原始 ENU 坐标不再二次 map，
  // 视口中心 = 最新点 + 用户拖拽偏移，保持当前跨度
  // 拖拽中不更新 dataZoom，避免与拖拽操作冲突
  let trackingZoom = null;
  if (isTracking.value && !isDragging) {
    const centerX = latestTrackPoint[0] + panOffsetX;
    const centerY = latestTrackPoint[1] + panOffsetY;
    trackingZoom = [
      {
        startValue: centerX - trackingXHalfSpan,
        endValue: centerX + trackingXHalfSpan,
      },
      {
        startValue: centerY - trackingYHalfSpan,
        endValue: centerY + trackingYHalfSpan,
      },
    ];
  }

  chartInstance.value.setOption(
    {
      ...(trackingZoom ? { dataZoom: trackingZoom } : {}),
      series: [
        {
          name: t('gnss.deviation.historyTrack'),
          data: displayTrackData,
          symbolSize: pointSize.value,
          itemStyle: {
            color: function(params) {
              const quality = params.data[2] || 0;
              return qualityToColor(quality);
            },
            opacity: 0.65,
          },
          emphasis: {
            disabled: displayTrackData.length >= LARGE_RENDER_THRESHOLD,
          },
          silent: displayTrackData.length >= LARGE_RENDER_THRESHOLD,
        },
        {
          name: t('gnss.deviation.currentPosition'),
          data: [currentDisplayPoint],
          symbolSize: pointSize.value * 1.2,
          itemStyle: {
            color: qualityToColor(currentQuality),
            borderWidth: 2,
            borderColor: '#fff',
            borderType: 'solid',
          },
        },
      ],
    },
    { lazyUpdate: true, silent: true },
  );
}

function scheduleNmeaUpdate(force = false) {
  forceNextNmeaRender ||= force;
  if (nmeaUpdateTimer !== null || nmeaUpdateFrame !== null) return;
  nmeaUpdateTimer = window.setTimeout(() => {
    nmeaUpdateTimer = null;
    nmeaUpdateFrame = requestAnimationFrame(() => {
      nmeaUpdateFrame = null;
      if (chartInstance.value) handleNmeaUpdate();
    });
  }, RENDER_INTERVAL_MS);
}

function cancelScheduledNmeaUpdate() {
  if (nmeaUpdateTimer !== null) clearTimeout(nmeaUpdateTimer);
  if (nmeaUpdateFrame !== null) cancelAnimationFrame(nmeaUpdateFrame);
  nmeaUpdateTimer = null;
  nmeaUpdateFrame = null;
  forceNextNmeaRender = false;
}

function toggleTracking() {
  if (!chartInstance.value || plotData.value.length === 0) return;
  const latestPoint = plotData.value[plotData.value.length - 1];

  if (isTracking.value) {
    // 开启跟踪：重置用户拖拽偏移，视口以最新点为中心，
    // 跨度取当前的一半（与原实现视觉一致）
    panOffsetX = 0;
    panOffsetY = 0;
    const opt = chartInstance.value.getOption();
    const xSpan = (opt.dataZoom[0].endValue - opt.dataZoom[0].startValue) / 2;
    const ySpan = (opt.dataZoom[1].endValue - opt.dataZoom[1].startValue) / 2;
    trackingXHalfSpan = xSpan;
    trackingYHalfSpan = ySpan;

    chartInstance.value.setOption({
      dataZoom: getDataZoomConfig(
        latestPoint[0] - xSpan,
        latestPoint[0] + xSpan,
        latestPoint[1] - ySpan,
        latestPoint[1] + ySpan,
      ),
    });
  } else {
    // 关闭跟踪：数据与视口本就为原始坐标，视口保持不变，
    // 仅通过 getDataZoomConfig 刷新 moveOnMouseWheel 等交互开关
    chartInstance.value.setOption({
      dataZoom: getDataZoomConfig(
        latestPoint[0] - trackingXHalfSpan,
        latestPoint[0] + trackingXHalfSpan,
        latestPoint[1] - trackingYHalfSpan,
        latestPoint[1] + trackingYHalfSpan,
      ),
    });
  }
}

function resetZoom() {
  if (!chartInstance.value) return;
  const points = plotData.value;

  // 重置布局时清除用户拖拽偏移
  panOffsetX = 0;
  panOffsetY = 0;

  const width = chartContainerRef.value?.clientWidth || 1;
  const height = chartContainerRef.value?.clientHeight || 1;
  // 跟踪模式下数据保持原始坐标，以最新点为中心 fit 视口
  const viewport = isTracking.value && points.length > 0
    ? fitDeviationPointsAroundCenter(
        points,
        points[points.length - 1][0],
        points[points.length - 1][1],
        width / height,
        GNSS_MIN_VISIBLE_SPAN_METERS,
      )
    : fitDeviationPoints(
        points,
        width / height,
        GNSS_MIN_VISIBLE_SPAN_METERS,
      );

  if (!viewport) {
    trackingXHalfSpan = 10;
    trackingYHalfSpan = 10;
    chartInstance.value.setOption({
      dataZoom: getDataZoomConfig(-10, 10, -10, 10),
    });
    return;
  }

  trackingXHalfSpan = (viewport.xMax - viewport.xMin) / 2;
  trackingYHalfSpan = (viewport.yMax - viewport.yMin) / 2;
  chartInstance.value.setOption({
    dataZoom: getDataZoomConfig(
      viewport.xMin,
      viewport.xMax,
      viewport.yMin,
      viewport.yMax,
    ),
  });
}

function clearTrack() {
  cancelScheduledNmeaUpdate();
  lastNmeaRenderKey = '';
  panOffsetX = 0;
  panOffsetY = 0;
  clearData();

  chartInstance.value.setOption({
    series: [
      {
        name: t('gnss.deviation.historyTrack'),
        data: [],
      },
      {
        name: t('gnss.deviation.currentPosition'),
        data: [],
      },
    ],
  });
}

function updatePointSize() {
  if (chartInstance.value) {
    chartInstance.value.setOption({
      series: [
        {
          name: t('gnss.deviation.historyTrack'),
          symbolSize: pointSize.value
        }
      ]
    });
  }
}

let stopWatch = null;

onMounted(() => {
  setTimeout(() => {
    initChart();
  }, 100);

  watch(deviceConnected, () => {
    if (deviceConnected.value) {
      enableWindow.value = true;
    }
  }, { immediate: true });

  stopWatch = watch(
    plotData,
    () => {
      if (chartInstance.value) {
        scheduleNmeaUpdate();
      }
    },
    { immediate: true },
  );
});

function scheduleThemeRefresh() {
  if (themeRefreshFrame !== null) cancelAnimationFrame(themeRefreshFrame);
  themeRefreshFrame = requestAnimationFrame(() => {
    themeRefreshFrame = requestAnimationFrame(() => {
      themeRefreshFrame = null;
      initChart();
      handleNmeaUpdate();
    });
  });
}

watch(resolvedTheme, scheduleThemeRefresh);

onUnmounted(() => {
  cancelScheduledNmeaUpdate();
  if (themeRefreshFrame !== null) {
    cancelAnimationFrame(themeRefreshFrame);
    themeRefreshFrame = null;
  }
  stopWatch?.();
  // 清理拖拽事件
  window.removeEventListener('mousemove', handleDragMove);
  window.removeEventListener('mouseup', handleDragEnd);
  if (chartInstance.value) {
    const dom = chartInstance.value.getDom();
    if (dom) dom.removeEventListener('mousedown', handleDragStart);
    chartInstance.value.dispose();
  }
  disconnectResizeObserver();
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
  padding: 0px 12px;
  height: 50px;
  background-color: var(--app-surface-muted);
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
  display: flex; /* 添加flex布局 */
  align-items: center; /* 垂直居中 */
}

.controls {
  display: flex;
  align-items: center; /* 垂直居中 */
  justify-content: flex-start; /* 改为左对齐 */
  width: 100%; /* 确保占满整个控制面板宽度 */
  position: relative; /* 为绝对定位的子元素提供参考 */
}

.tracking-switch {
  margin-right: 8px;
}

.switch-label {
  font-size: 12px;
  color: var(--app-text-muted);
  margin-right: 15px;
  line-height: 1; /* 确保标签文本垂直居中 */
}

.control-btn {
  padding: 6px 12px;
  background-color: var(--app-surface-raised);
  color: var(--app-text-secondary);
  border: 1px solid var(--app-border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
  line-height: 1; /* 确保按钮文本垂直居中 */
  display: flex; /* 确保按钮内容垂直居中 */
  align-items: center;
}

.chart-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  min-height: 0; /* 允许flex子项收缩到小于内容大小 */
}

.chart {
  width: 100%;
  height: 100%;
  min-height: 0; /* 移除固定最小高度，允许完全自适应 */
  touch-action: none;
  overscroll-behavior: none;
}

.point-size-control {
  display: flex;
  align-items: center;
  margin-left: 10px;
}

.size-label {
  margin-right: 5px;
  font-size: 12px;
}

.point-slider {
  width: 60px;
  margin: 0 5px;
}

.size-value {
  width: 24px;
  text-align: center;
  font-size: 12px;
}

/* 添加参考GnssSky.vue的滑块样式 */
:deep(.el-slider) {
  --el-slider-height: 5px; /* 轨道高度 */
  --el-slider-button-size: 22px; /* 滑块按钮大小 */
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

.right-buttons {
  display: flex;
  align-items: center;
  margin-left: auto; /* 自动占据剩余空间，将按钮推到右侧 */
}

@container (max-width: 680px) {
  .switch-label,
  .size-label {
    display: none;
  }

  .point-size-control {
    margin-left: 4px;
  }
}
</style>
