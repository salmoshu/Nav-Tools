<template>
  <div class="deviation-container">
    <div class="control-panel" :class="{ 'control-panel-fullscreen': isFullScreen }">
      <div class="controls">
        <el-switch v-model="isTracking" @change="toggleTracking" class="tracking-switch" />
        <span class="switch-label">实时追踪</span>
        <el-button type="primary" size="small" @click="resetZoom" class="control-btn zoom-btn">重置</el-button>
        <el-button type="primary" size="small" @click="clearTrack" class="control-btn clear-btn">清除轨迹</el-button>
        <el-button type="default" size="small" @click="toggleFullScreen" class="fullscreen-btn">
          <el-icon v-if="!isFullScreen"><Expand /></el-icon>
          <el-icon v-else><FullScreen /></el-icon>
        </el-button>
      </div>
    </div>
    <div class="chart-container" :class="{ 'full-screen': isFullScreen }">
      <div ref="chartRef" class="chart"></div>
      <div class="ruler">
        <span>{{ rulerText }}</span>
        <svg
          t="1678949672043"
          class="ruler-icon"
          viewBox="0 0 2024 1024"
          version="1.1"
          xmlns="http://www.w3.org/2000/svg "
          width="40"
          height="20"
        >
          <path
            d="m1976.42566,586.88647l-1927.29435,0l0,-148.94546l107.75434,0l0,97.22828l1711.78564,0l0,-97.33171l107.75436,0l0,149.04889zm0,0"
            fill="#324558"
          ></path>
        </svg>
      </div>
      <!-- 添加全屏状态提示 -->
      <div v-if="isFullScreen" class="fullscreen-tip">
        按Esc键或点击按钮退出全屏
      </div>
    </div>
  </div>
</template>

<script setup>
import * as echarts from 'echarts';
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useNmea } from '../../composables/gnss/useNmea';
import { Expand, FullScreen } from '@element-plus/icons-vue';
import { ScatterChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([ScatterChart, GridComponent, CanvasRenderer]);

const { latestPosition, clearData, processRawData } = useNmea();

const chartRef = ref(null);
const chartInstance = ref(null);
const isTracking = ref(true);
const isFullScreen = ref(false);
const rulerText = ref('');
const deviation = ref('');
const userHasZoomed = ref(false);
const padding = ref(10000); // 默认正负10km

let trackData = [];
let firstPosition = null;
const maxTrackPoints = 5000;
let resizeObserver = null;
const minPadding = 10000; // 最小范围正负10km

function setupResizeObserver() {
  if (!chartRef.value) return;
  resizeObserver = new ResizeObserver(() => {
    nextTick(() => {
      if (chartInstance.value) {
        chartInstance.value.resize();
      }
    });
  });
  const parentElement = chartRef.value.parentElement;
  if (parentElement) {
    resizeObserver.observe(parentElement);
  }
}

function initChart() {
  if (!chartRef.value) return;
  if (chartInstance.value) {
    chartInstance.value.dispose();
  }
  chartInstance.value = echarts.init(chartRef.value, null, {
    renderer: 'svg',
    antialias: true,
  });

  const getDataZoomConfig = () => [
    {
      type: 'inside',
      xAxisIndex: 0,
      zoomOnMouseWheel: false,
      moveOnMouseWheel: !isTracking.value,
      moveOnMouseMove: !isTracking.value,
      startValue: -10,
      endValue: 10,
    },
    {
      type: 'inside',
      yAxisIndex: 0,
      zoomOnMouseWheel: false,
      moveOnMouseWheel: !isTracking.value,
      moveOnMouseMove: !isTracking.value,
      startValue: -10,
      endValue: 10,
    },
  ];

  const option = {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    tooltip: {
      trigger: 'axis',
      formatter: function(params) {
        const point = params[0].value;
        return `位置: (${point[0].toFixed(2)}, ${point[1].toFixed(2)}) m`;
      },
    },
    legend: {
      data: ['历史轨迹', '当前位置'],
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
    dataZoom: getDataZoomConfig(),
    xAxis: {
      type: 'value',
      name: '',
      nameLocation: 'middle',
      nameGap: 30,
      axisLabel: {
        formatter: function(value) {
          return value.toFixed(2) + ' m';
        },
      },
      splitLine: {
        lineStyle: {
          type: 'dashed',
          color: '#e0e0e0',
        },
      },
      axisLine: {
        show: true,
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
        formatter: function(value) {
          return value.toFixed(2) + ' m';
        },
      },
      splitLine: {
        lineStyle: {
          type: 'dashed',
          color: '#e0e0e0',
        },
      },
      axisLine: {
        show: true,
      },
      min: -padding.value,
      max: padding.value,
    },
    series: [
      {
        name: '历史轨迹',
        type: 'scatter',
        data: [],
        coordinateSystem: 'cartesian2d',
        symbolSize: 6,
        symbol: 'circle',
        itemStyle: {
          color: '#4e6ef2',
          opacity: 0.6,
        },
      },
      {
        name: '当前位置',
        type: 'scatter',
        data: [],
        coordinateSystem: 'cartesian2d',
        symbolSize: 12,
        itemStyle: {
          color: '#ff4d4f',
        },
      },
    ],
  };

  chartInstance.value.setOption(option);
  setupResizeObserver();

  chartInstance.value.on('datazoom', () => {
    userHasZoomed.value = true;
    nextTick(() => {
      const opt = chartInstance.value.getOption();
      let xMin = opt.xAxis[0].min;
      let xMax = opt.xAxis[0].max;
      let yMin = opt.yAxis[0].min;
      let yMax = opt.yAxis[0].max;

      // 计算并更新 padding
      const xRange = xMax - xMin;
      const yRange = yMax - yMin;
      padding.value = Math.max(minPadding, (xRange + yRange) / 4); // 取平均范围的一半

      // 强制居中
      const xCenter = (xMin + xMax) / 2;
      const xShift = xCenter - 0;
      xMin -= xShift;
      xMax -= xShift;

      const yCenter = (yMin + yMax) / 2;
      const yShift = yCenter - 0;
      yMin -= yShift;
      yMax -= yShift;

      // 确保最小范围
      if (xMax - xMin < minPadding * 2) {
        xMin = -padding.value;
        xMax = padding.value;
      }
      if (yMax - yMin < minPadding * 2) {
        yMin = -padding.value;
        yMax = padding.value;
      }

      chartInstance.value.setOption({
        xAxis: { min: xMin, max: xMax },
        yAxis: { min: yMin, max: yMax },
      });
    });
  });

  const handleWheel = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const zoomRatio = 1.15;
    const isZoomIn = e.deltaY < 0;

    const opt = chartInstance.value.getOption();
    const xStart = opt.dataZoom[0].startValue;
    const xEnd = opt.dataZoom[0].endValue;
    const yStart = opt.dataZoom[1].startValue;
    const yEnd = opt.dataZoom[1].endValue;

    const xSpan = (xEnd - xStart) * (isZoomIn ? 1 / zoomRatio : zoomRatio);
    const ySpan = (yEnd - yStart) * (isZoomIn ? 1 / zoomRatio : zoomRatio);

    const limit = 10000;
    const newXStart = Math.max(-limit, -xSpan / 2);
    const newXEnd = Math.min(limit, xSpan / 2);
    const newYStart = Math.max(-limit, -ySpan / 2);
    const newYEnd = Math.min(limit, ySpan / 2);

    chartInstance.value.dispatchAction({
      type: 'dataZoom',
      xAxisIndex: [0],
      startValue: newXStart,
      endValue: newXEnd,
    });
    chartInstance.value.dispatchAction({
      type: 'dataZoom',
      yAxisIndex: [0],
      startValue: newYStart,
      endValue: newYEnd,
    });
    return false;
  };

  // 直接在DOM元素上绑定事件监听器
  const chartDom = chartInstance.value.getDom();
  if (chartDom) {
    // 'GnssDeviation: 滚轮事件监听器已直接绑定到DOM元素（捕获阶段）'
    chartDom.addEventListener('mousewheel', handleWheel, { passive: false, capture: true });
    chartDom.addEventListener('wheel', handleWheel, { passive: false, capture: true });
  
    // 在组件卸载时清理监听器
    onUnmounted(() => {
      chartDom.removeEventListener('mousewheel', handleWheel, { capture: true });
      chartDom.removeEventListener('wheel', handleWheel, { capture: true });
    });
  }
}

function handleNmeaUpdate() {
  const latest = latestPosition.value;
  if (!latest || !latest.latitude || !latest.longitude) return;

  if (!firstPosition) {
    firstPosition = {
      latitude: latest.latitude,
      longitude: latest.longitude,
    };
  }

  const x = (latest.longitude - firstPosition.longitude) * 111320 * Math.cos(firstPosition.latitude * Math.PI / 180);
  const y = (latest.latitude - firstPosition.latitude) * 110574;
  const roundedX = Math.round(x * 1000) / 1000;
  const roundedY = Math.round(y * 1000) / 1000;

  deviation.value = Math.sqrt(x * x + y * y).toFixed(2);
  trackData.push([roundedX, roundedY]);

  if (trackData.length > maxTrackPoints) {
    trackData.shift();
  }

  let displayTrackData = [...trackData];
  let currentDisplayPoint = [roundedX, roundedY];

  if (isTracking.value && trackData.length > 0) {
    const latestPoint = trackData[trackData.length - 1];
    const offsetX = latestPoint[0];
    const offsetY = latestPoint[1];
    displayTrackData = trackData.map(point => [point[0] - offsetX, point[1] - offsetY]);
    currentDisplayPoint = [0, 0];
  }

  chartInstance.value.setOption({
    series: [
      {
        name: '历史轨迹',
        data: displayTrackData,
      },
      {
        name: '当前位置',
        data: [currentDisplayPoint],
      },
    ],
  });

  if (!userHasZoomed.value) {
    chartInstance.value.setOption({
      xAxis: {
        min: -padding.value,
        max: padding.value,
      },
      yAxis: {
        min: -padding.value,
        max: padding.value,
      },
    });
  }
}

function toggleTracking() {
  console.log('切换跟踪模式，padding=', padding.value);

  userHasZoomed.value = false;
  // padding.value = minPadding;

  chartInstance.value.setOption({
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        zoomOnMouseWheel: true,
        moveOnMouseWheel: !isTracking.value,
        moveOnMouseMove: !isTracking.value,
      },
      {
        type: 'inside',
        yAxisIndex: 0,
        zoomOnMouseWheel: true,
        moveOnMouseWheel: !isTracking.value,
        moveOnMouseMove: !isTracking.value,
      },
    ],
    xAxis: {
      min: -padding.value,
      max: padding.value,
    },
    yAxis: {
      min: -padding.value,
      max: padding.value,
    },
  });

  if (isTracking.value && trackData.length > 0) {
    const latestPoint = trackData[trackData.length - 1];
    const offsetX = latestPoint[0];
    const offsetY = latestPoint[1];
    const displayTrackData = trackData.map(point => [point[0] - offsetX, point[1] - offsetY]);
    const currentDisplayPoint = [0, 0];

    chartInstance.value.setOption({
      series: [
        {
          name: '历史轨迹',
          data: displayTrackData,
        },
        {
          name: '当前位置',
          data: [currentDisplayPoint],
        },
      ],
    });
  } else if (trackData.length > 0) {
    const latestPoint = trackData[trackData.length - 1];
    chartInstance.value.setOption({
      series: [
        {
          name: '历史轨迹',
          data: [...trackData],
        },
        {
          name: '当前位置',
          data: [latestPoint],
        },
      ],
    });

    nextTick(() => {
      const opt = chartInstance.value.getOption();
      let xMin = opt.xAxis[0].min;
      let xMax = opt.xAxis[0].max;
      let yMin = opt.yAxis[0].min;
      let yMax = opt.yAxis[0].max;

      const minSpan = minPadding * 2;

      if (xMax - xMin < minSpan) {
        const xCenter = (xMin + xMax) / 2;
        xMin = xCenter - minPadding;
        xMax = xCenter + minPadding;
        padding.value = minPadding;
      }
      if (yMax - yMin < minSpan) {
        const yCenter = (yMin + yMax) / 2;
        yMin = yCenter - minPadding;
        yMax = yCenter + minPadding;
        padding.value = minPadding;
      }

      chartInstance.value.setOption({
        xAxis: { min: xMin, max: xMax },
        yAxis: { min: yMin, max: yMax },
      });
    });
  }
}

function resetZoom() {
  if (!chartInstance.value) return;
  userHasZoomed.value = false;
  initChart();
}

function clearTrack() {
  trackData = [];
  firstPosition = null;
  deviation.value = '0.00';
  clearData();

  chartInstance.value.setOption({
    series: [
      {
        name: '历史轨迹',
        data: [],
      },
      {
        name: '当前位置',
        data: [],
      },
    ],
  });
}

function toggleFullScreen() {
  isFullScreen.value = !isFullScreen.value;
  nextTick(() => {
    if (chartInstance.value) {
      chartInstance.value.resize();
    }
  });
}

let stopWatch = null;
let handleSerialData = null;
let handleKeyDown = null;

onMounted(() => {
  setTimeout(() => {
    initChart();
  }, 100);

  stopWatch = watch(
    latestPosition,
    (newVal) => {
      if (newVal && chartInstance.value) {
        handleNmeaUpdate();
      }
    },
    { immediate: true },
  );

  handleSerialData = (event, data) => {
    processRawData(data);
  };

  if (window.ipcRenderer) {
    window.ipcRenderer.on('read', handleSerialData);
  }

  handleKeyDown = (event) => {
    if (event.key === 'Escape' && isFullScreen.value) {
      toggleFullScreen();
    }
  };

  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  if (chartInstance.value) {
    chartInstance.value.dispose();
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
});
</script>

<style scoped>
.deviation-container {
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
  padding: 0px 12px;
  height: 50px;
  background-color: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
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

.fullscreen-btn {
  position: absolute; /* 绝对定位 */
  right: 0; /* 右对齐 */
  margin-left: auto; /* 自动左边距，确保在最右侧 */
}

.tracking-switch {
  margin-right: 8px;
}

.switch-label {
  font-size: 12px;
  color: #6b7280;
  margin-right: 15px;
  line-height: 1; /* 确保标签文本垂直居中 */
}

.control-btn {
  padding: 6px 12px;
  background-color: #f8f9fa;
  color: #495057;
  border: 1px solid #dee2e6;
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

/* 全屏模式样式保持不变 */
.control-panel-fullscreen {
  position: fixed;
  top: 10px;
  left: 10px;
  right: 10px;
  z-index: 1001;
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  max-height: 180px;
}

.fullscreen-tip {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  z-index: 1001;
}

.full-screen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1000;
  background-color: #fff;
}

.chart-container.full-screen {
  top: 200px;
  height: calc(100% - 200px);
}

.ruler {
  position: absolute;
  bottom: 10px;
  left: 10px;
  display: flex;
  align-items: center;
  background-color: rgba(255, 255, 255, 0.8);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: #324558;
}

.ruler-icon {
  margin-left: 5px;
}
</style>