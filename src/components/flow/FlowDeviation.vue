<template>
  <div class="deviation-container">
    <div class="control-panel">
      <div class="controls">

        <!-- 添加轨迹点尺寸调节滑块 -->
        <span class="switch-label">追踪:</span>
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
        
        <!-- 将重置、清除按钮放在右侧 -->
        <div class="right-buttons">
          <el-button :disabled="deviceConnected" type="default" size="small" @click="toggleSlideWindow" class="layout-btn">
            <span :style="{ textDecoration: enableWindow ? 'line-through' : 'none' }">滑窗</span>
          </el-button>
          <!-- 添加视图配置按钮 -->
          <el-button type="default" size="small" @click="showViewConfig" class="control-btn config-btn">
            配置
          </el-button>
          <el-button type="default" size="small" @click="resetZoom" class="zoom-btn">重置</el-button>
          <el-button type="default" size="small" @click="toggleDataUpdate" class="clear-btn">{{ isDataUpdating ? '暂停' : '更新' }}</el-button>
        </div>
      </div>
    </div>
    <div class="chart-container" ref="chartContainerRef">
      <!-- 移除正方形包装器，让图表直接填充容器 -->
      <div ref="chartRef" class="chart"></div>
    </div>
  </div>

  <!-- 视图配置对话框 -->
  <el-dialog
    v-model="viewConfigDialogVisible"
    width="400px"
    destroy-on-close
  >
    <div class="dialog-content">
      <div style="margin-bottom: 20px;">
        <span style="display: inline-block; width: 100px;">X轴字段：</span>
        <el-select v-model="selectedXField" placeholder="选择X轴字段" style="width: 200px;">
          <el-option label="" value=""></el-option>
          <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
        </el-select>
      </div>
      
      <div style="margin-bottom: 20px;">
        <span style="display: inline-block; width: 100px;">Y轴字段：</span>
        <el-select v-model="selectedYField" placeholder="选择Y轴字段" style="width: 200px;">
          <el-option label="" value=""></el-option>
          <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
        </el-select>
      </div>
    </div>
    <template #footer>
      <el-button @click="viewConfigDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="applyViewConfig">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import * as echarts from 'echarts';
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue';
import { useFlow } from '../../composables/flow/useFlow';
import { useDevice } from '@/hooks/useDevice'
import { ScatterChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { ElMessage } from 'element-plus';

// 注册ECharts组件
const { plotData, toggleSlideWindow, enableWindow } = useFlow();
const { deviceConnected } = useDevice()

echarts.use([ScatterChart, GridComponent, CanvasRenderer]);

// DOM引用和响应式变量
const chartRef = ref(null);
const chartInstance = ref(null);
const chartContainerRef = ref(null); // 添加容器引用
const isTracking = ref(true);
const padding = ref(10000); // 默认正负10km
const pointSize = ref(10); // 初始值与图表配置一致
const chartDom = ref(null); // 添加chartDom引用
// 移除squareSize变量

// 视图配置相关变量
const viewConfigDialogVisible = ref(false);
const selectedXField = ref('');
const selectedYField = ref('');

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

// 数据存储变量
let trackData = [];
let firstPosition = null;
const maxTrackPoints = 3600 * 12;
let resizeObserver = null;
const minPadding = 10000; // 最小范围正负10km

// 显示视图配置对话框
function showViewConfig() {
  viewConfigDialogVisible.value = true;
}

// 应用视图配置
function applyViewConfig() {
  if (!selectedXField.value || !selectedYField.value) {
    ElMessage({
      message: `请选择X轴和Y轴字段`,
      type: 'warning',
      placement: 'bottom-right',
      offset: 50,
    });
    return;
  }
  
  // 清除现有轨迹数据
  trackData.splice(0, trackData.length);
  
  // 更新图表
  if (chartInstance.value) {
    chartInstance.value.setOption({
      xAxis: {
        name: selectedXField.value
      },
      yAxis: {
        name: selectedYField.value
      }
    });
  }
  
  viewConfigDialogVisible.value = false;
}

// 计算正方形尺寸
function calculateSquareSize() {
  if (!chartContainerRef.value) return;
  
  // 获取容器可用尺寸
  const containerWidth = chartContainerRef.value.clientWidth;
  const containerHeight = chartContainerRef.value.clientHeight;
  
  // 计算最大可能的正方形尺寸，取宽和高中的较小值
  const size = Math.min(containerWidth, containerHeight);
  
  // 设置正方形尺寸
  // squareSize.value = size;
}

// 设置调整大小观察器
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

// 获取数据缩放配置
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

// 初始化图表
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
        const xField = selectedXField.value || 'X';
        const yField = selectedYField.value || 'Y';
        return `${xField}: ${point[0].toFixed(2)}<br/>${yField}: ${point[1].toFixed(2)}`;
      },
      show: true,
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
      name: selectedXField.value || '',
      nameLocation: 'middle',
      nameGap: 30,
      axisLabel: {
        formatter: function(value) {
          return value.toFixed(2);
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
      name: selectedYField.value || '',
      nameLocation: 'middle',
      nameGap: 40,
      axisLabel: {
        formatter: function(value) {
          return value.toFixed(2);
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
      },
    ],
  };

  chartInstance.value.setOption(option);
  setupResizeObserver();

  // 直接在DOM元素上绑定事件监听器
  chartDom.value = chartInstance.value.getDom();
  if (chartDom.value) {
    chartDom.value.addEventListener('mousewheel', handleWheel, { passive: false, capture: true });
    chartDom.value.addEventListener('wheel', handleWheel, { passive: false, capture: true });
  }
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

// 更新数据点 - 使用真实数据而不是随机数据
function updateFlowData() {
  // 只有在选择了X轴和Y轴字段后才处理数据
  if (!selectedXField.value || !selectedYField.value) {
    return;
  }
  
  // 从flowData中获取所有数据
  const xData = plotData.value[selectedXField.value];
  const yData = plotData.value[selectedYField.value];
  
  if (!xData || !yData || xData.length === 0 || yData.length === 0) {
    return;
  }
  
  trackData.splice(0, trackData.length);
  const dataLength = Math.min(xData.length, yData.length);

  for (let i = 0; i < dataLength; i++) {
    const x = xData[i];
    const y = yData[i];
    
    // 确保数据是有效的数字
    if (typeof x === 'number' && typeof y === 'number' && !isNaN(x) && !isNaN(y)) {
      const roundedX = Math.round(x * 1000) / 1000;
      const roundedY = Math.round(y * 1000) / 1000;
      trackData.push([roundedX, roundedY]);
    }
  }

  // 更新图表显示
  updateChartDisplay();
}

// 更新图表显示
function updateChartDisplay() {
  if (!chartInstance.value) return;
  
  let displayTrackData = [...trackData];
  let currentDisplayPoint = trackData.length > 0 ? [...trackData[trackData.length - 1]] : [];

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
        symbolSize: pointSize.value,
        itemStyle: {
          color: '#4e6ef2',
          opacity: 0.6,
        },
      },
      {
        name: '当前位置',
        data: currentDisplayPoint.length > 0 ? [currentDisplayPoint] : [],
        symbolSize: pointSize.value * 1.2,
        itemStyle: {
          color: '#ff4d4f', // 内部填充色
          borderWidth: 2,   // 边框总宽度
          borderColor: '#fff', // 外层边框颜色
          borderType: 'solid',
          shadowColor: '#222', // 内层边框颜色
          shadowOffsetX: 0,
          shadowOffsetY: 0,
          shadowBlur: 2
        },
      },
    ],
  });
}

// 切换追踪模式
function toggleTracking() {
  updateChartDisplay();
  
  // 更新数据缩放配置以响应跟踪模式的变化
  if (chartInstance.value) {
    chartInstance.value.setOption({
      dataZoom: [
        {
          xAxisIndex: 0,
          moveOnMouseWheel: !isTracking.value,
          moveOnMouseMove: !isTracking.value
        },
        {
          yAxisIndex: 0,
          moveOnMouseWheel: !isTracking.value,
          moveOnMouseMove: !isTracking.value
        }
      ]
    });
  }
}

// 重置缩放
function resetZoom() {
  if (!chartInstance.value) return;
  initChart();
}

// 更新点大小
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

let handleKeyDown = null;
let dataUpdateInterval = null;

function pauseDataUpdate() {
  if (dataUpdateInterval) {
    clearInterval(dataUpdateInterval);
    dataUpdateInterval = null;
  }
}

function resumeDataUpdate() {
  if (!dataUpdateInterval) {
    dataUpdateInterval = setInterval(() => {
      updateFlowData();
    }, 100);
  }
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

  // 每100ms更新一次数据
  resumeDataUpdate();

  window.addEventListener('keydown', handleKeyDown);
});

// 组件卸载时清理资源
onUnmounted(() => {
  if (chartInstance.value) {
    chartInstance.value.dispose();
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  if (dataUpdateInterval) {
    clearInterval(dataUpdateInterval);
  }
  // 清理滚轮事件监听器
  if (chartDom.value) {
    chartDom.value.removeEventListener('mousewheel', handleWheel, { capture: true });
    chartDom.value.removeEventListener('wheel', handleWheel, { capture: true });
  }
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<style scoped>
.deviation-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  /* background-color: #f5f7fa; */
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.control-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
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

.tracking-switch {
  margin-right: 8px;
}

.switch-label {
  font-size: 12px;
  color: #6b7280;
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
  margin-left: 10px;
}

.size-label {
  margin-right: 5px;
  font-size: 12px;
  color: #6b7280;
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

/* 新增右侧按钮容器样式 */
.right-buttons {
  display: flex;
  align-items: center;
  margin-left: auto; /* 自动占据剩余空间，将按钮推到右侧 */
}
</style>