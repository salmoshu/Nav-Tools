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
import { onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useNmea } from '@/composables/gnss/useNmea';
import { useDevice } from '@/hooks/useDevice'
import { useTheme } from '@/composables/useTheme'
import { useDeviationChart } from '../common/deviation/useDeviationChart';

const { latestPosition, latestGgaPosition, enableWindow, plotData, clearData } = useNmea();
const { deviceConnected } = useDevice()
const { chartTheme, resolvedTheme } = useTheme()

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

// let trackData = [];
let firstPosition = null;
// const maxTrackPoints = 3600*12;
const minPadding = 10000; // 最小范围正负10km
const MAX_LARGE_THRESHOLD = 5*60    // 5min 先存储5分钟数据以规避系统崩溃的问题

function toggleSlideWindow() {
  enableWindow.value = !enableWindow.value;
  handleNmeaUpdate();
}

function initChart() {
  if (!createChart()) return;
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
        color: colors.textMuted,
        formatter: function(value) {
          return value.toFixed(2) + ' m';
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
          return value.toFixed(2) + ' m';
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
  setupResizeObserver(maintainEqualAxisScale);

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
  bindWheelHandler(handleWheel);
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

watch(resolvedTheme, () => {
  nextTick(() => {
    initChart();
    handleNmeaUpdate();
  });
});

onUnmounted(() => {
  if (chartInstance.value) {
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
</style>
