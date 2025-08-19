<template>
  <div class="deviation-container" v-if="false">
    <div class="control-panel">
      <div class="title">
        <div class="title-icon"></div>
        <h2>GNSS偏差分析</h2>
      </div>
      <div class="data-cards">
        <div class="data-card">
          <div class="card-title">当前状态</div>
          <div class="card-value">{{ fixStatus }}</div>
          <div class="card-subtitle">定位状态</div>
        </div>
        <div class="data-card">
          <div class="card-title">信号质量</div>
          <div class="card-value">{{ signalQuality }}</div>
          <div class="card-subtitle">{{ satellites || '0' }}颗卫星</div>
        </div>
        <div class="data-card">
          <div class="card-title">偏差值</div>
          <div class="card-value">{{ deviation || '0.00' }} m</div>
          <div class="card-subtitle">当前位置偏差</div>
        </div>
      </div>
      <div class="controls">
        <el-switch v-model="isTracking" @change="toggleTracking" class="tracking-switch" />
        <span class="switch-label">实时追踪</span>
        <el-button type="primary" size="small" @click="clearTrack" class="clear-btn">清除轨迹</el-button>
        <el-button type="default" size="small" @click="toggleFullScreen" class="fullscreen-btn">
          <el-icon v-if="!isFullScreen"><Expand /></el-icon>
          <el-icon v-else><MinusSquare /></el-icon> <!-- 使用MinusSquare替代Compress -->
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
    </div>
  </div>
</template>

<script setup>
// 在文件顶部添加echarts导入
import * as echarts from 'echarts';
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useNmea } from '../../composables/gnss/useNmea';
import elementResizeDetectorMaker from 'element-resize-detector';

// 初始化NMEA解析器
const { nmeaData, currentData, latestPosition, signalQuality, fixStatus, clearData } = useNmea();

// 组件状态
const chartRef = ref(null);
const chartInstance = ref(null);
const isTracking = ref(true);
const isFullScreen = ref(false);
const rulerText = ref('');
const deviation = ref('');
const satellites = computed(() => currentData.value.satellites || '0');

// 轨迹数据处理 - 改为普通数组，不使用ref
let trackData = [];
const referencePoint = ref(null);
const maxTrackPoints = 5000; // 最大轨迹点数

// 初始化图表
function initChart() {
  if (!chartRef.value) return;

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
      bottom: '3%',
      top: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      name: 'X偏差 (m)',
      nameLocation: 'middle',
      nameGap: 30,
      axisLabel: {
        formatter: '{value} m'
      },
      splitLine: {
        lineStyle: {
          type: 'dashed',
          color: '#e0e0e0'
        }
      }
    },
    yAxis: {
      type: 'value',
      name: 'Y偏差 (m)',
      nameLocation: 'middle',
      nameGap: 40,
      axisLabel: {
        formatter: '{value} m'
      },
      splitLine: {
        lineStyle: {
          type: 'dashed',
          color: '#e0e0e0'
        }
      }
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'none'
      },
      {
        type: 'inside',
        yAxisIndex: 0,
        filterMode: 'none'
      }
    ],
    series: [
      {
        name: '轨迹',
        type: 'line',
        data: [],  // 空数组初始化
        coordinateSystem: 'cartesian2d',  // 添加这行
        symbol: 'none',
        lineStyle: {
          color: '#4e6ef2',
          width: 2,
          opacity: 0.8
        },
        progressive: 1000,
        progressiveThreshold: 500
      },
      {
        name: '当前位置',
        type: 'scatter',
        data: [],
        coordinateSystem: 'cartesian2d',  // 添加这行
        symbolSize: 12,
        itemStyle: {
          color: '#ff4d4f'
        }
      },
      {
        name: '参考点',
        type: 'scatter',
        data: [],
        coordinateSystem: 'cartesian2d',  // 添加这行
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
  const erd = elementResizeDetectorMaker();
  erd.listenTo(chartRef.value, () => {
    // 使用setTimeout确保DOM更新完成
    setTimeout(() => {
      if (chartInstance.value) {
        chartInstance.value.resize();
        
        // 获取当前完整的option配置
        const currentOption = chartInstance.value.getOption();
        
        // 重新设置完整的配置，确保坐标系信息不丢失
        chartInstance.value.setOption({
          ...currentOption,
          series: currentOption.series.map(series => ({
            ...series,
            coordinateSystem: 'cartesian2d'  // 确保每个系列都有坐标系配置
          }))
        }, { notMerge: false });  // 使用合并模式
        
        updateRuler();
      }
    }, 50);  // 50ms延迟确保DOM更新完成
  });

  // 监听图表缩放事件
  chartInstance.value.on('dataZoom', () => {
    updateRuler();
  });
}

// 更新比例尺
function updateRuler() {
  if (!chartInstance.value) return;

  const xAxis = chartInstance.value.getModel('xAxis', 0).getComponent('xAxis', 0).axis;
  const interval = xAxis.scale._interval;

  // 根据间隔确定合适的单位
  const units = ['mm', 'cm', 'm', 'km'];
  const factors = [0.001, 0.01, 1, 1000];

  let m = parseFloat(interval);
  for (let i = 0; i < units.length - 1; i++) {
    if (m >= factors[i] && m < factors[i + 1]) {
      const value = m / factors[i];
      rulerText.value = value.toFixed(0) + units[i];
      return;
    } else if (m < factors[i]) {
      rulerText.value = (m / factors[i]).toFixed(1) + units[i];
      return;
    }
  }
  rulerText.value = (m / factors[units.length - 1]).toFixed(0) + units[units.length - 1];
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
          data: [[0, 0]],
          coordinateSystem: 'cartesian2d'  // 添加这行
        }
      ]
    });
  }

  // 计算相对于参考点的偏差
  const x = (latest.longitude - referencePoint.value.longitude) * 111320 * Math.cos(referencePoint.value.latitude * Math.PI / 180);
  const y = (latest.latitude - referencePoint.value.latitude) * 110574;

  // 更新偏差值
  deviation.value = Math.sqrt(x * x + y * y).toFixed(2);

  // 添加到轨迹数据
  trackData.push([x, y]);

  // 限制轨迹数据量
  if (trackData.length > maxTrackPoints) {
    trackData.shift();
  }

  // 更新图表 - 使用完整的数据数组
  chartInstance.value.setOption({
    series: [
      {
        name: '轨迹',
        data: [...trackData],  // 创建新数组引用
        coordinateSystem: 'cartesian2d'  // 添加这行
      },
      {
        name: '当前位置',
        data: [[x, y]],
        coordinateSystem: 'cartesian2d'  // 添加这行
      }
    ]
  });

  // 如果启用了追踪，调整视图中心
  if (isTracking.value) {
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

// 切换追踪状态
function toggleTracking() {
  if (isTracking.value) {
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
        data: [],
        coordinateSystem: 'cartesian2d'  // 添加这行
      },
      {
        name: '当前位置',
        data: [],
        coordinateSystem: 'cartesian2d'  // 添加这行
      },
      {
        name: '参考点',
        data: [],
        coordinateSystem: 'cartesian2d'  // 添加这行
      }
    ]
  });
}

// 切换全屏
function toggleFullScreen() {
  isFullScreen.value = !isFullScreen.value;
  setTimeout(() => {
    if (chartInstance.value) {
      chartInstance.value.resize();
      updateRuler();
    }
  }, 100);
}

// 组件挂载时初始化
onMounted(() => {
  initChart();

  // 监听NMEA数据更新
  const stopWatch = watch(
    latestPosition,
    (newVal) => {
      if (newVal) {
        handleNmeaUpdate();
      }
    },
    { immediate: true }
  );

  // 监听串口数据
  let buffer = '';

  const handleSerialData = (event, data) => {
    buffer += data;
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('$')) {
        currentData.value = useNmea().parseNmea(line);
      }
    }
  };

  window.ipcRenderer.on('read', handleSerialData);

  // 清理函数
  onUnmounted(() => {
    stopWatch();
    window.ipcRenderer.off('read', handleSerialData);
    if (chartInstance.value) {
      chartInstance.value.dispose();
    }
  });
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

.title {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
}

.title-icon {
  width: 4px;
  height: 20px;
  background-color: #4e6ef2;
  margin-right: 8px;
  border-radius: 2px;
}

h2 {
  font-size: 18px;
  font-weight: 600;
  color: #1f2329;
  margin: 0;
}

.data-cards {
  display: flex;
  gap: 15px;
  margin-bottom: 15px;
}

.data-card {
  flex: 1;
  min-width: 120px;
  padding: 12px;
  background-color: #f0f7ff;
  border-radius: 6px;
  text-align: center;
  transition: all 0.3s ease;
}

.data-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 10px rgba(78, 110, 242, 0.15);
}

.card-title {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 5px;
}

.card-value {
  font-size: 20px;
  font-weight: 600;
  color: #4e6ef2;
  margin-bottom: 3px;
}

.card-subtitle {
  font-size: 12px;
  color: #9ca3af;
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

.chart {
  width: 100%;
  height: 100%;
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

@media (max-width: 768px) {
  .data-cards {
    flex-wrap: wrap;
  }

  .data-card {
    flex: 0 0 calc(50% - 7.5px);
  }
}
</style>