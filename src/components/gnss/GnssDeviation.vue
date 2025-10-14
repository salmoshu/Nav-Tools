<template>
  <div class="deviation-container">
    <div class="control-panel">
      <div class="controls">
        <span class="switch-label">跟踪:</span>
        <el-switch v-model="isTracking" @change="toggleTracking" class="tracking-switch" />
        <!-- 添加轨迹点尺寸调节滑块 -->
        <div class="point-size-control">
          <span class="size-label">尺寸:</span>
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
            &nbsp;{{enableWindow?"关闭滑窗":"启用滑窗"}}
          </el-button>
          <el-button type="primary" size="small" @click="resetZoom" class="control-btn zoom-btn"><el-icon><RefreshLeft /></el-icon>&nbsp;重置布局</el-button>
          <el-button type="primary" size="small" @click="clearTrack" class="control-btn clear-btn"><el-icon><Delete /></el-icon>&nbsp;清除</el-button>
        </div>
      </div>
    </div>
    <div class="chart-container" ref="chartContainerRef">
      <div ref="chartRef" class="chart"></div>
    </div>
  </div>
</template>

<script setup>
import * as echarts from 'echarts';
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useNmea } from '../../composables/gnss/useNmea';
import { ScatterChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useDevice } from '@/hooks/useDevice'

echarts.use([ScatterChart, GridComponent, CanvasRenderer]);

const { latestPosition, latestGgaPosition, enableWindow, plotData, clearData } = useNmea();
const { deviceConnected } = useDevice()

const chartRef = ref(null);
const chartInstance = ref(null);
const isTracking = ref(true);
// const deviation = ref('');
const padding = ref(10000); // 默认正负10km
const pointSize = ref(10); // 初始值与图表配置一致
const chartDom = ref(null); // 添加chartDom引用
const chartContainerRef = ref(null); // 添加容器引用

// let trackData = [];
let firstPosition = null;
// const maxTrackPoints = 3600*12;
let resizeObserver = null;
const minPadding = 10000; // 最小范围正负10km
const MAX_LARGE_THRESHOLD = 5*60    // 5min 先存储5分钟数据以规避系统崩溃的问题

function toggleSlideWindow() {
  enableWindow.value = !enableWindow.value;
  handleNmeaUpdate();
}

function setupResizeObserver() {
  if (!chartRef.value) return;
  resizeObserver = new ResizeObserver(() => {
    nextTick(() => {
      if (chartInstance.value && chartInstance.value.getDom()) {
        // 在resize前确保坐标系配置正确
        const option = chartInstance.value.getOption();
        if (option && option.series) {
          // 确保series中没有错误的coordinateSystem配置
          option.series = option.series.map(series => ({
            ...series,
            // 移除可能导致问题的coordinateSystem配置，让ECharts自动处理
            coordinateSystem: "cartesian2d"
          }));
          chartInstance.value.setOption(option, false);
        }
        
        // 计算并设置等宽坐标轴
        maintainEqualAxisScale();
        chartInstance.value.resize();
      }
    });
  });
  const parentElement = chartRef.value.parentElement;
  if (parentElement) {
    resizeObserver.observe(parentElement);
  }
  // 同时观察容器元素
  if (chartContainerRef.value) {
    resizeObserver.observe(chartContainerRef.value);
  }
}

function getDataZoomConfig(xStart, xEnd, yStart, yEnd) {
  const initXConfig = {
    type: 'inside',
    xAxisIndex: 0,
    zoomOnMouseWheel: false,
    moveOnMouseWheel: !isTracking.value,
    moveOnMouseMove: !isTracking.value,
  }

  const initYConfig = {
    type: 'inside',
    yAxisIndex: 0,
    zoomOnMouseWheel: false,
    moveOnMouseWheel: !isTracking.value,
    moveOnMouseMove: !isTracking.value,
  }

  if (xStart && xEnd && yStart && yEnd) {
    return [
      {
        ...initXConfig,
        startValue: xStart,
        endValue: xEnd,
      },
      {
        ...initYConfig,
        startValue: yStart,
        endValue: yEnd,
      },
    ];
  } else {
    return [initXConfig, initYConfig];
  }
}

function initChart() {
  if (!chartRef.value) return;
  if (chartInstance.value) {
    chartInstance.value.dispose();
  }
  chartInstance.value = echarts.init(chartRef.value, null, {
    renderer: 'canvas',
    antialias: false,
  });

  const option = {
    animation: false,
    hoverAnimation: false,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    tooltip: {
      trigger: 'axis',
      formatter: function(params) {
        const point = params[0].value;
        return `位置: (${point[0].toFixed(2)}, ${point[1].toFixed(2)}) m`;
      },
      show: false,
    },
    legend: {
      data: [
        {
          name: '历史轨迹',
          itemStyle: {
            color: 'grey',
          },
        },
        {
          name: '当前位置',
        },
      ],
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
        symbolSize: pointSize.value,
        symbol: 'circle',
        itemStyle: {
          color: '#4e6ef2',
          opacity: 0.6,
        },
        sampling: 'lttb',
        large: true,
        largeThreshold: MAX_LARGE_THRESHOLD,
      },
      {
        name: '当前位置',
        type: 'scatter',
        data: [],
        coordinateSystem: 'cartesian2d',
        symbolSize: pointSize.value,
        itemStyle: {
          color: '#ff4d4f',
        },
        sampling: 'lttb',
        large: true,
        largeThreshold: MAX_LARGE_THRESHOLD,
      },
    ],
  };

  chartInstance.value.setOption(option);
  setupResizeObserver();

  chartInstance.value.on('datazoom', () => {
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

  // 直接在DOM元素上绑定事件监听器
  chartDom.value = chartInstance.value.getDom();
  if (chartDom.value) {
    // GnssDeviation: 滚轮事件监听器已直接绑定到DOM元素（捕获阶段）
    chartDom.value.addEventListener('mousewheel', handleWheel, { passive: false, capture: true });
    chartDom.value.addEventListener('wheel', handleWheel, { passive: false, capture: true });
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
  const xSpan = (xEnd - xStart) * zoomRatio;
  const ySpan = (yEnd - yStart) * zoomRatio;

  let newXStart = xStart;
  let newXEnd = xEnd;
  let newYStart = yStart;
  let newYEnd = yEnd;

  if (isTracking.value) {
    newXStart = Math.max(-limit, -xSpan / 2);
    newXEnd = Math.min(limit, xSpan / 2);
    newYStart = Math.max(-limit, -ySpan / 2);
    newYEnd = Math.min(limit, ySpan / 2);
  } else {
    const xCenter = (xStart + xEnd) / 2;
    const yCenter = (yStart + yEnd) / 2;
    newXStart = Math.max(-limit, xCenter - xSpan / 2);
    newXEnd = Math.min(limit, xCenter + xSpan / 2);
    newYStart = Math.max(-limit, yCenter - ySpan / 2);
    newYEnd = Math.min(limit, yCenter + ySpan / 2);
  }

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

  // deviation.value = Math.sqrt(x * x + y * y).toFixed(2);
  // trackData.push([roundedX, roundedY, Number(latest.quality)]);

  // if (trackData.length > maxTrackPoints) {
  //   trackData.shift();
  // }

  let displayTrackData = [...plotData.value];
  let currentDisplayPoint = [roundedX, roundedY, Number(latest.quality)];

  if (isTracking.value && plotData.value.length > 0) {
    const latestPoint = plotData.value[plotData.value.length - 1];
    const offsetX = latestPoint[0];
    const offsetY = latestPoint[1];
    displayTrackData = plotData.value.map(point => [point[0] - offsetX, point[1] - offsetY, point[2]]);
    currentDisplayPoint = [0, 0, Number(latest.quality)];
  }

  chartInstance.value.setOption({
    series: [
      {
        name: '历史轨迹',
        data: displayTrackData,
        symbolSize: pointSize.value,
        itemStyle: {
          color: function(params) {
            // 直接从当前数据点获取quality信息
            const quality = params.data[2] || 0;
            return qualityToColor(quality);
          }
        },
      },
      {
        name: '当前位置',
        data: [currentDisplayPoint],
        symbolSize: pointSize.value * 1.2,
        itemStyle: {
          color: qualityToColor(Number(latest.quality)), // 内部填充色
          borderWidth: 2,   // 边框总宽度
          borderColor: '#fff', // 外层边框颜色
          borderType: 'solid',
          shadowColor: 'rgba(100, 100, 100, 0.2)', // 内层边框颜色
          shadowOffsetX: 0,
          shadowOffsetY: 0,
          shadowBlur: 2
        },
      },
    ],
  });
}

function toggleTracking() {
  if (isTracking.value && plotData.value.length > 0) {
    const latestPoint = plotData.value[plotData.value.length - 1];
    const offsetX = latestPoint[0];
    const offsetY = latestPoint[1];
    const displayTrackData = plotData.value.map(point => [point[0] - offsetX, point[1] - offsetY, point[2]]);
    const currentDisplayPoint = [0, 0];

    const opt = chartInstance.value.getOption();
    const xStart = opt.dataZoom[0].startValue;
    const xEnd = opt.dataZoom[0].endValue;
    const yStart = opt.dataZoom[1].startValue;
    const yEnd = opt.dataZoom[1].endValue;
    const xSpan = (xEnd - xStart)/2;
    const ySpan = (yEnd - yStart)/2;

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
      dataZoom: getDataZoomConfig(-xSpan, xSpan, -ySpan, ySpan),
    });
    // handleWheel()
  } else if (plotData.value.length > 0) {
    const latestPoint = plotData.value[plotData.value.length - 1];

    const offsetX = latestPoint[0];
    const offsetY = latestPoint[1];

    const opt = chartInstance.value.getOption();
    const xStart = opt.dataZoom[0].startValue + offsetX;
    const xEnd = opt.dataZoom[0].endValue + offsetX;
    const yStart = opt.dataZoom[1].startValue + offsetY;
    const yEnd = opt.dataZoom[1].endValue + offsetY;

    chartInstance.value.setOption({
      series: [
        {
          name: '历史轨迹',
          data: [...plotData.value],
        },
        {
          name: '当前位置',
          data: [latestPoint],
        },
      ],
      dataZoom: getDataZoomConfig(xStart, xEnd, yStart, yEnd),
    });
    // handleWheel()
  }
}

function resetZoom() {
  if (!chartInstance.value) return;
  initChart();
}

function clearTrack() {
  // trackData = [];
  firstPosition = null;
  // deviation.value = '0.00';
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

function updatePointSize() {
  if (chartInstance.value) {
    chartInstance.value.setOption({
      series: [
        {
          name: '历史轨迹',
          symbolSize: pointSize.value
        }
      ]
    });
  }
}

// 新增：保持坐标轴等宽的函数
function maintainEqualAxisScale() {
  if (!chartInstance.value || !chartContainerRef.value) return;
  
  const chartOption = chartInstance.value.getOption();
  const containerWidth = chartContainerRef.value.clientWidth;
  const containerHeight = chartContainerRef.value.clientHeight;
  
  // 考虑图表内边距，获取实际绘图区域的宽高
  const grid = chartOption.grid[0];
  const gridLeft = typeof grid.left === 'string' ? parseInt(grid.left) : grid.left;
  const gridRight = typeof grid.right === 'string' ? parseInt(grid.right) : grid.right;
  const gridTop = typeof grid.top === 'string' ? parseInt(grid.top) : grid.top;
  const gridBottom = typeof grid.bottom === 'string' ? parseInt(grid.bottom) : grid.bottom;
  
  const plotWidth = containerWidth - gridLeft - gridRight;
  const plotHeight = containerHeight - gridTop - gridBottom;
  
  // 获取当前坐标轴范围
  const xMin = chartOption.xAxis[0].min || -padding.value;
  const xMax = chartOption.xAxis[0].max || padding.value;
  const yMin = chartOption.yAxis[0].min || -padding.value;
  const yMax = chartOption.yAxis[0].max || padding.value;
  
  const xRange = xMax - xMin;
  const yRange = yMax - yMin;
  
  // 计算每单位数据对应的像素数
  const xPixelPerUnit = plotWidth / xRange;
  const yPixelPerUnit = plotHeight / yRange;
  
  // 找出较小的值，确保等宽
  const minPixelPerUnit = Math.min(xPixelPerUnit, yPixelPerUnit);
  
  // 计算新的范围，保持中心点不变
  const xCenter = (xMin + xMax) / 2;
  const yCenter = (yMin + yMax) / 2;
  
  const newXRange = plotWidth / minPixelPerUnit;
  const newYRange = plotHeight / minPixelPerUnit;
  
  const newXMin = xCenter - newXRange / 2;
  const newXMax = xCenter + newXRange / 2;
  const newYMin = yCenter - newYRange / 2;
  const newYMax = yCenter + newYRange / 2;
  
  // 应用新的范围设置
  chartInstance.value.setOption({
    xAxis: { min: newXMin, max: newXMax },
    yAxis: { min: newYMin, max: newYMax }
  });
}

let stopWatch = null;
let handleKeyDown = null;

onMounted(() => {
  setTimeout(() => {
    initChart();
  }, 100);

  watch(deviceConnected, () => {
    if (deviceConnected.value) {
      enableWindow.value = true;
    }
  });

  stopWatch = watch(
    latestPosition,
    (newVal) => {
      if (newVal && chartInstance.value) {
        handleNmeaUpdate();
      }
    },
    { immediate: true },
  );

  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  if (chartInstance.value) {
    chartInstance.value.dispose();
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  // 清理滚轮事件监听器
  if (chartDom.value) {
    chartDom.value.removeEventListener('mousewheel', handleWheel, { capture: true });
    chartDom.value.removeEventListener('wheel', handleWheel, { capture: true });
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
</style>