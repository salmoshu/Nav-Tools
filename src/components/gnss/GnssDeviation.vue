<template>
  <div class="deviation-container">
    <div class="control-panel" :class="{ 'control-panel-fullscreen': isFullScreen }">
      <div class="controls">
        <el-switch v-model="isTracking" @change="toggleTracking" class="tracking-switch" />
        <span class="switch-label">实时追踪</span>
        <el-button type="primary" size="small" @click="zoomIn" class="zoom-btn">放大</el-button>
        <el-button type="primary" size="small" @click="zoomOut" class="zoom-btn">缩小</el-button>
        <el-button type="primary" size="small" @click="resetZoom" class="zoom-btn">重置</el-button>
        <el-button type="primary" size="small" @click="clearTrack" class="clear-btn">清除轨迹</el-button>
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
          xmlns="http://www.w3.org/2000/svg"
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
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useNmea } from '../../composables/gnss/useNmea';
import { Expand, FullScreen } from '@element-plus/icons-vue';

import { ScatterChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([ScatterChart, GridComponent, CanvasRenderer]);

// 初始化NMEA解析器
const { nmeaData, currentData, latestPosition, signalQuality, fixStatus, clearData, processRawData } = useNmea();

// 组件状态
const chartRef = ref(null);
const chartInstance = ref(null);
const isTracking = ref(true);
const isFullScreen = ref(false);
const rulerText = ref('');
const deviation = ref('');

const userHasZoomed = ref(false); // 添加用户缩放标志

// 轨迹数据处理
let trackData = [];
const referencePoint = ref(null);
const maxTrackPoints = 5000; // 最大轨迹点数

// 初始化图表
function initChart() {
  if (!chartRef.value) return;

  // 销毁已存在的图表实例
  if (chartInstance.value) {
    chartInstance.value.dispose();
  }

  chartInstance.value = echarts.init(chartRef.value);

  const option = {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    tooltip: {
      trigger: 'axis',
      formatter: function(params) {
        const point = params[0].value;
        return `位置: (${point[0].toFixed(3)}, ${point[1].toFixed(3)}) m`;
      }
    },
    legend: {
      data: ['轨迹', '当前位置', '参考点'],
      right: 10,
      top: 10
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '8%',  // 从3%增加到8%，为x轴标签留出更多空间
      top: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      name: 'X偏差 (m)',
      nameLocation: 'middle',
      nameGap: 30,
      axisLabel: {
        formatter: function(value) {
          return value.toFixed(3) + ' m';
        }
      },
      splitLine: {
        lineStyle: {
          type: 'dashed',
          color: '#e0e0e0'
        }
      },
      axisLine: {
        show: true
      }
    },
    yAxis: {
      type: 'value',
      name: 'Y偏差 (m)',
      nameLocation: 'middle',
      nameGap: 40,
      axisLabel: {
        formatter: function(value) {
          return value.toFixed(3) + ' m';
        }
      },
      splitLine: {
        lineStyle: {
          type: 'dashed',
          color: '#e0e0e0'
        }
      },
      axisLine: {
        show: true
      }
    },
    series: [
      {
        name: '轨迹',
        type: 'line',
        data: [],
        coordinateSystem: 'cartesian2d',
        symbol: 'none',
        lineStyle: {
          color: '#4e6ef2',
          width: 2,
          opacity: 0.8
        }
      },
      {
        name: '当前位置',
        type: 'scatter',
        data: [],
        coordinateSystem: 'cartesian2d',
        symbolSize: 12,
        itemStyle: {
          color: '#ff4d4f'
        }
      },
      {
        name: '参考点',
        type: 'scatter',
        data: [],
        coordinateSystem: 'cartesian2d',
        symbolSize: 10,
        symbol: 'rect',
        itemStyle: {
          color: '#52c41a'
        }
      }
    ]
  };

  chartInstance.value.setOption(option);

  // 监听窗口大小变化
  window.addEventListener('resize', () => {
    if (chartInstance.value) {
      chartInstance.value.resize();
    }
  });
}

// 处理NMEA数据更新
function handleNmeaUpdate() {
  const latest = latestPosition.value;
  if (!latest || !latest.latitude || !latest.longitude) return;

  // 设置参考点（第一个有效位置）
  if (!referencePoint.value) {
    referencePoint.value = {
      latitude: latest.latitude,
      longitude: latest.longitude
    };

    // 更新图表参考点
    chartInstance.value.setOption({
      series: [
        {
          name: '参考点',
          data: [[0, 0]]
        }
      ]
    });
  }

  // 计算相对于参考点的偏差
  const x = (latest.longitude - referencePoint.value.longitude) * 111320 * Math.cos(referencePoint.value.latitude * Math.PI / 180);
  const y = (latest.latitude - referencePoint.value.latitude) * 110574;

  // 对计算结果进行四舍五入，保留3位小数
  const roundedX = Math.round(x * 1000) / 1000;
  const roundedY = Math.round(y * 1000) / 1000;

  // 更新偏差值
  deviation.value = Math.sqrt(x * x + y * y).toFixed(2);

  // 添加到轨迹数据
  trackData.push([roundedX, roundedY]);

  // 限制轨迹数据量
  if (trackData.length > maxTrackPoints) {
    trackData.shift();
  }

  // 更新图表
  chartInstance.value.setOption({
    series: [
      {
        name: '轨迹',
        data: [...trackData]
      },
      {
        name: '当前位置',
        data: [[roundedX, roundedY]]
      }
    ]
  });

  // 如果启用了追踪且用户没有手动缩放，调整视图中心
  if (isTracking.value && !userHasZoomed.value) {
    const padding = 1;

    chartInstance.value.setOption({
      xAxis: {
        min: roundedX - padding,
        max: roundedX + padding
      },
      yAxis: {
        min: roundedY - padding,
        max: roundedY + padding
      }
    });
  }
}

// 切换追踪状态
function toggleTracking() {
  if (isTracking.value) {
    userHasZoomed.value = false; // 切换到追踪模式时重置缩放标志
    const latest = trackData[trackData.length - 1];
    if (latest) {
      const x = latest[0];
      const y = latest[1];
      const padding = 1;

      chartInstance.value.setOption({
        xAxis: {
          min: x - padding,
          max: x + padding
        },
        yAxis: {
          min: y - padding,
          max: y + padding
        }
      });
    }
  }
}

// 清除轨迹
function clearTrack() {
  trackData = [];
  referencePoint.value = null;
  deviation.value = '0.00';
  clearData();

  chartInstance.value.setOption({
    series: [
      {
        name: '轨迹',
        data: []
      },
      {
        name: '当前位置',
        data: []
      },
      {
        name: '参考点',
        data: []
      }
    ]
  });
}

function toggleFullScreen() {
  isFullScreen.value = !isFullScreen.value;
  setTimeout(() => {
    if (chartInstance.value) {
      chartInstance.value.resize();
    }
  }, 100);
}

// 缩放功能
function zoomIn() {
  if (!chartInstance.value) return;
  userHasZoomed.value = true; // 标记用户进行了缩放
  const option = chartInstance.value.getOption();
  const xRange = option.xAxis[0].max - option.xAxis[0].min;
  const yRange = option.yAxis[0].max - option.yAxis[0].min;
  const xCenter = (option.xAxis[0].max + option.xAxis[0].min) / 2;
  const yCenter = (option.yAxis[0].max + option.yAxis[0].min) / 2;
  
  chartInstance.value.setOption({
    xAxis: {
      min: xCenter - xRange * 0.4,
      max: xCenter + xRange * 0.4
    },
    yAxis: {
      min: yCenter - yRange * 0.4,
      max: yCenter + yRange * 0.4
    }
  });
}

function zoomOut() {
  if (!chartInstance.value) return;
  userHasZoomed.value = true; // 标记用户进行了缩放
  const option = chartInstance.value.getOption();
  const xRange = option.xAxis[0].max - option.xAxis[0].min;
  const yRange = option.yAxis[0].max - option.yAxis[0].min;
  const xCenter = (option.xAxis[0].max + option.xAxis[0].min) / 2;
  const yCenter = (option.yAxis[0].max + option.yAxis[0].min) / 2;
  
  chartInstance.value.setOption({
    xAxis: {
      min: xCenter - xRange * 0.6,
      max: xCenter + xRange * 0.6
    },
    yAxis: {
      min: yCenter - yRange * 0.6,
      max: yCenter + yRange * 0.6
    }
  });
}

function resetZoom() {
  if (!chartInstance.value) return;
  userHasZoomed.value = false; // 重置缩放标志
  chartInstance.value.setOption({
    xAxis: {
      min: null,
      max: null
    },
    yAxis: {
      min: null,
      max: null
    }
  });
}

// 声明清理函数需要的变量
let stopWatch = null;
let handleSerialData = null;
let handleKeyDown = null;

// 组件挂载时初始化
onMounted(() => {
  // 延迟初始化，确保DOM已加载
  setTimeout(() => {
    initChart();
  }, 100)

  // 监听NMEA数据更新
  stopWatch = watch(
    latestPosition,
    (newVal) => {
      if (newVal && chartInstance.value) {
        handleNmeaUpdate();
      }
    },
    { immediate: true }
  )

  // 监听串口数据
  handleSerialData = (event, data) => {
    // 使用processRawData处理原始数据
    processRawData(data);
  }

  window.ipcRenderer.on('read', handleSerialData);

  // 监听键盘事件 - Esc键退出全屏
  handleKeyDown = (event) => {
    if (event.key === 'Escape' && isFullScreen.value) {
      toggleFullScreen();
    }
  };

  window.addEventListener('keydown', handleKeyDown);
});

// 清理函数
onUnmounted(() => {
  if (stopWatch) stopWatch();
  if (handleSerialData) window.ipcRenderer.off('read', handleSerialData);
  if (handleKeyDown) window.removeEventListener('keydown', handleKeyDown);
  if (chartInstance.value) {
    chartInstance.value.dispose();
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
  padding: 15px;
  background-color: #fff;
  border-bottom: 1px solid #eaeaea;
}


.controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tracking-switch {
  margin-right: 8px;
}

.switch-label {
  font-size: 14px;
  color: #6b7280;
  margin-right: 15px;
}

.clear-btn {
  margin-right: 8px;
}

.chart-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
  min-height: 500px; /* 从400px增加到500px，确保图表有足够的高度 */
}

.chart {
  width: 100%;
  height: 100%;
  min-height: 500px; /* 从400px增加到500px */
  touch-action: none;  /* 禁用默认触摸行为 */
  overscroll-behavior: none;  /* 禁用过度滚动 */
}

.control-panel-fullscreen {
  position: fixed;
  top: 10px;
  left: 10px;
  right: 10px;
  z-index: 1001;
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  max-height: 180px; /* 限制控制面板高度 */
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

/* 修改全屏模式下的图表容器样式 */
.chart-container.full-screen {
  top: 200px; /* 位于控制面板下方 */
  height: calc(100% - 200px); /* 高度为屏幕高度减去控制面板区域 */
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