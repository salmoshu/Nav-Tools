<template>
  <div class="snr-container">
    <div class="control-panel">
      <div class="controls">
        <el-button type="primary" size="small" @click="toggleAutoRefresh" class="refresh-btn">
          <el-icon v-if="autoRefresh"><RefreshRight /></el-icon>
          <el-icon v-else><VideoPause /></el-icon>
          {{ autoRefresh ? '停止刷新' : '自动刷新' }}
        </el-button>
        <el-button type="default" size="small" @click="refreshData" class="refresh-btn">
          <el-icon><Refresh /></el-icon>
          手动刷新
        </el-button>
        <el-button type="default" size="small" @click="clearData" class="clear-btn">
          <el-icon><Delete /></el-icon>
          清除数据
        </el-button>
      </div>
    </div>
    
    <div class="constellation-tabs">
      <el-tabs v-model="activeConstellation" type="card" @tab-click="handleTabClick">
        <el-tab-pane label="全部" name="all"></el-tab-pane>
        <el-tab-pane label="GPS" name="GPS"></el-tab-pane>
        <el-tab-pane label="GLONASS" name="GLONASS"></el-tab-pane>
        <el-tab-pane label="BEIDOU" name="BEIDOU"></el-tab-pane>
        <el-tab-pane label="GALILEO" name="GALILEO"></el-tab-pane>
        <el-tab-pane label="其他" name="OTHER"></el-tab-pane>
      </el-tabs>
    </div>
    
    <div class="snr-content">
      <div class="snr-chart">
        <div ref="chartRef" class="chart"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import * as echarts from 'echarts';
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useNmea } from '../../composables/gnss/useNmea';
import { Refresh, RefreshRight, VideoPause, Delete } from '@element-plus/icons-vue';
import { BarChart, ScatterChart } from 'echarts/charts';
import { GridComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, ScatterChart, GridComponent, LegendComponent, CanvasRenderer]);

// 初始化NMEA解析器
const { satelliteSnrData, processRawData, clearData: clearNmeaData } = useNmea();

// 组件状态
const chartRef = ref(null);
const chartInstance = ref(null);
const autoRefresh = ref(true);
const activeConstellation = ref('all');

// 获取最新的卫星数据（每个PRN只保留最新的一条）
function getLatestSatelliteData() {
  const latestMap = new Map();
  
  // 按时间戳排序，确保最新的数据在后面
  const sortedData = [...satelliteSnrData.value].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  // 对于每个PRN，只保留最新的数据
  sortedData.forEach(sat => {
    latestMap.set(sat.prn, sat);
  });
  
  return Array.from(latestMap.values()).sort((a, b) => {
    // 按星座和PRN排序
    if (a.constellation !== b.constellation) {
      return a.constellation.localeCompare(b.constellation);
    }
    return parseInt(a.prn) - parseInt(b.prn);
  });
}

// 初始化图表
function initChart() {
  if (!chartRef.value) return;

  // 销毁已存在的图表实例
  if (chartInstance.value) {
    chartInstance.value.dispose();
  }

  chartInstance.value = echarts.init(chartRef.value);
  updateChart();

  // 监听窗口大小变化
  window.addEventListener('resize', () => {
    if (chartInstance.value) {
      chartInstance.value.resize();
    }
  }, { passive: false });
}

// 更新图表
function updateChart() {
  if (!chartInstance.value) return;

  const satellites = getLatestSatelliteData();
  
  // 按星座分组
  const constellations = ['GPS', 'GLONASS', 'BEIDOU', 'GALILEO', 'OTHER'];
  
  // 获取所有卫星数据并按顺序排列
  const allSatellites = satellites.sort((a, b) => {
    // 按星座和PRN排序
    if (a.constellation !== b.constellation) {
      return constellations.indexOf(a.constellation) - constellations.indexOf(b.constellation);
    }
    return parseInt(a.prn) - parseInt(b.prn);
  });
  
  // 创建x轴数据
  const xAxisData = allSatellites.map(sat => `${sat.constellation}-${sat.prn}`);
  
  // 为每个星座创建series，并确保数据位置与x轴对齐
  const series = constellations.map(constellation => {
    const data = [];
    
    // 为每个x轴位置创建数据点，如果属于当前星座则显示SNR值，否则显示null
    allSatellites.forEach((sat, index) => {
      if (sat.constellation === constellation || 
          (constellation === 'OTHER' && !['GPS', 'GLONASS', 'BEIDOU', 'GALILEO'].includes(sat.constellation))) {
        data.push({
          name: `${sat.constellation}-${sat.prn}`,
          value: sat.snr,
          itemStyle: {
            color: getSnrColor(sat.snr)
          }
        });
      } else {
        data.push(null); // 不属于当前星座的位置留空
      }
    });
    
    return {
      name: constellation,
      type: 'bar',
      data: data,
      itemStyle: {
        borderRadius: [4, 4, 0, 0]
      }
    };
  }).filter(series => series.data.some(item => item !== null));

  const option = {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    legend: {
      data: series.map(s => s.name),
      top: 10
    },
    grid: {
      left: '8%',
      right: '4%',
      bottom: '15%',
      top: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xAxisData,
      axisLabel: {
        rotate: 45,
        interval: 0,
        fontSize: 10
      }
    },
    yAxis: {
      type: 'value',
      name: 'SNR (dB)',
      nameLocation: 'middle',
      nameGap: 30,
      min: 0,
      max: 60
    },
    series: series,
  };

  chartInstance.value.setOption(option);
}

// 获取SNR颜色
function getSnrColor(snr) {
  if (snr >= 45) return '#52c41a';
  if (snr >= 35) return '#1890ff';
  if (snr >= 25) return '#faad14';
  return '#ff4d4f';
}

// 切换自动刷新
function toggleAutoRefresh() {
  autoRefresh.value = !autoRefresh.value;
}

// 手动刷新数据
function refreshData() {
  updateChart();
}

// 清除数据
function clearData() {
  clearNmeaData();
  updateChart();
}

// 处理标签页点击
function handleTabClick() {
  updateChart();
}

// 监听数据变化
watch(satelliteSnrData, () => {
  if (autoRefresh.value) {
    updateChart();
  }
}, { deep: true });

// 监听活动星座变化
watch(activeConstellation, () => {
  updateChart();
});

// 监听串口数据
const handleSerialData = (event, data) => {
  processRawData(data);
};

// 组件挂载时初始化
onMounted(() => {
  setTimeout(() => {
    initChart();
  }, 100);

  // 监听串口数据
  window.ipcRenderer.on('read', handleSerialData);
});

// 清理函数
onUnmounted(() => {
  if (chartInstance.value) {
    chartInstance.value.dispose();
  }
  window.ipcRenderer.off('read', handleSerialData);
});
</script>

<style scoped>
.snr-container {
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
  gap: 10px;
}

.constellation-tabs {
  background-color: #fff;
  border-bottom: 1px solid #eaeaea;
}

.snr-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.snr-chart {
  height: 300px;
  padding: 15px;
  background-color: #fff;
  border-bottom: 1px solid #eaeaea;
}

.chart {
  width: 100%;
  height: 100%;
}
</style>