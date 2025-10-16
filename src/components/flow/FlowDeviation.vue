<template>
  <div class="deviation-container">
    <div class="control-panel">
      <div class="controls">
        <!-- 视图配置按钮 -->
        <el-button type="default" size="small" @click="showViewConfig" class="control-btn config-btn">
          <el-icon><Setting /></el-icon>&nbsp;配置
        </el-button>
        
        <!-- 滑窗开关按钮 -->
        <el-button :disabled="deviceConnected" type="default" size="small" @click="toggleSlideWindow">
          <el-icon v-if="enableWindow"><CircleClose /></el-icon>
          <el-icon v-else><CircleCheck /></el-icon>
          &nbsp;{{enableWindow?"关闭滑窗":"启用滑窗"}}
        </el-button>

        <el-button type="default" size="small" @click="toggleTracking">
          <el-icon><Aim /></el-icon>
          &nbsp;{{isTracking?"关闭跟踪":"启用跟踪"}}
        </el-button>
        
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
  <el-dialog
    v-model="viewConfigDialogVisible"
    :width="'710px'"
    destroy-on-close
    title="轨迹配置"
  >
    <div class="dialog-content">
      <div class="chart-config-grid">
        <!-- 轨迹1配置 -->
        <div class="chart-config-section">
          <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
            <h4 style="color: #303133; margin: 0;">轨迹1</h4>
            <el-color-picker v-model="deviationConfig.track1Color.value" placeholder="选择颜色" style="margin-left: 10px;"></el-color-picker>
          </div>
          <div class="source-selectors">
            <div style="display: flex; align-items: center; margin-bottom: 12px;">
              <span style="display: inline-block; width: 80px; font-size: 14px; color: #606266;">X轴：</span>
              <el-select v-model="deviationConfig.track1X.value" placeholder="选择X轴字段" style="width: 200px;">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
            </div>
            <div style="display: flex; align-items: center;">
              <span style="display: inline-block; width: 80px; font-size: 14px; color: #606266;">Y轴：</span>
              <el-select v-model="deviationConfig.track1Y.value" placeholder="选择Y轴字段" style="width: 200px;">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
            </div>
          </div>
        </div>

        <!-- 轨迹2配置 -->
        <div class="chart-config-section">
          <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
            <h4 style="color: #303133; margin: 0;">轨迹2</h4>
            <el-color-picker v-model="deviationConfig.track2Color.value" placeholder="选择颜色" style="margin-left: 10px;"></el-color-picker>
          </div>
          <div class="source-selectors">
            <div style="display: flex; align-items: center; margin-bottom: 12px;">
              <span style="display: inline-block; width: 80px; font-size: 14px; color: #606266;">X轴：</span>
              <el-select v-model="deviationConfig.track2X.value" placeholder="选择X轴字段" style="width: 200px;">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
            </div>
            <div style="display: flex; align-items: center;">
              <span style="display: inline-block; width: 80px; font-size: 14px; color: #606266;">Y轴：</span>
              <el-select v-model="deviationConfig.track2Y.value" placeholder="选择Y轴字段" style="width: 200px;">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
            </div>
          </div>
        </div>

        <!-- 轨迹3配置 -->
        <div class="chart-config-section">
          <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
            <h4 style="color: #303133; margin: 0;">轨迹3</h4>
            <el-color-picker v-model="deviationConfig.track3Color.value" placeholder="选择颜色" style="margin-left: 10px;"></el-color-picker>
          </div>
          <div class="source-selectors">
            <div style="display: flex; align-items: center; margin-bottom: 12px;">
              <span style="display: inline-block; width: 80px; font-size: 14px; color: #606266;">X轴：</span>
              <el-select v-model="deviationConfig.track3X.value" placeholder="选择X轴字段" style="width: 200px;">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
            </div>
            <div style="display: flex; align-items: center;">
              <span style="display: inline-block; width: 80px; font-size: 14px; color: #606266;">Y轴：</span>
              <el-select v-model="deviationConfig.track3Y.value" placeholder="选择Y轴字段" style="width: 200px;">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
            </div>
          </div>
        </div>

        <!-- 轨迹4配置 -->
        <div class="chart-config-section">
          <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
            <h4 style="color: #303133; margin: 0;">轨迹4</h4>
            <el-color-picker v-model="deviationConfig.track4Color.value" placeholder="选择颜色" style="margin-left: 10px;"></el-color-picker>
          </div>
          <div class="source-selectors">
            <div style="display: flex; align-items: center; margin-bottom: 12px;">
              <span style="display: inline-block; width: 80px; font-size: 14px; color: #606266;">X轴：</span>
              <el-select v-model="deviationConfig.track4X.value" placeholder="选择X轴字段" style="width: 200px;">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
            </div>
            <div style="display: flex; align-items: center;">
              <span style="display: inline-block; width: 80px; font-size: 14px; color: #606266;">Y轴：</span>
              <el-select v-model="deviationConfig.track4Y.value" placeholder="选择Y轴字段" style="width: 200px;">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
            </div>
          </div>
        </div>
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
import { ref, watch, onMounted, onUnmounted, nextTick, computed, reactive } from 'vue';
import { useFlow } from '@/composables/flow/useFlow';
import { useDevice } from '@/hooks/useDevice'
import { ScatterChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { ElMessage } from 'element-plus';
import { useDataConfig } from '@/composables/flow/useDataConfig';
import { useConsole } from '@/composables/flow/useConsole';

const { deviationConfig } = useDataConfig();

// 导入搜索功能
const { searchQuery, findAll } = useConsole();

// 注册ECharts组件
const { plotData, toggleSlideWindow, enableWindow } = useFlow();
const { deviceConnected } = useDevice()

echarts.use([ScatterChart, GridComponent, CanvasRenderer]);

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
const chartRef = ref(null);
const chartInstance = ref(null);
const chartContainerRef = ref(null); // 添加容器引用
const isTracking = ref(false);
const padding = ref(10000); // 默认正负10km
const pointSize = ref(10); // 初始值与图表配置一致
const chartDom = ref(null); // 添加chartDom引用
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
// 最新点信息，用于高亮显示
const latestPointInfo = reactive({
  track: null, // 1, 2, 或 3
  index: -1,   // 在对应轨迹中的索引
  data: null   // [x, y] 坐标
});
// let firstPosition = null;
// const maxTrackPoints = 3600 * 12;
let resizeObserver = null;
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
      message: `请至少配置一条轨迹的X轴和Y轴字段`,
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
        name: xAxisName || 'X轴'
      },
      yAxis: {
        name: yAxisName || 'Y轴'
      }
    });
  }
  
  viewConfigDialogVisible.value = false;

  updateFlowData();
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
  updateFlowData();
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
    graphic: [{
      type: 'text',
      left: 10,
      top: 10,
      z: 99,
      style: {
        text: '',
        font: '14px Microsoft YaHei',
        fill: '#000',
        backgroundColor: '#fff',
        padding: [6, 10]
      }
    }],
    tooltip: {
      trigger: 'item',
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
      name: isTracking.value ? 'X轴' : 'X轴',
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
      name: isTracking.value ? 'Y轴' : 'Y轴',
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
        symbolSize: pointSize.value * 1.2,
        itemStyle: {
          color: '#ff4d4f',
          borderWidth: 2,
          borderColor: '#fff',
          shadowBlur: 2,
          shadowColor: 'rgba(0, 0, 0, 0.3)',
        },
        sampling: 'lttb',
        large: true,
      },
    ],
  };

  chartInstance.value.setOption(option);
  
  // 添加鼠标事件监听
  chartInstance.value.on('mouseover', handleMouseOver);
  chartInstance.value.on('mouseout', handleMouseOut);
  chartInstance.value.on('globalout', handleMouseOut); // 添加全局鼠标移出事件
  chartInstance.value.on('dblclick', handleChartDblClick); // 添加双击事件监听
  
  // 添加legend点击事件监听
  chartInstance.value.on('legendselectchanged', handleLegendSelectChanged);
  
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
    // 跟踪模式下保持中心在原点
    newXStart = Math.max(-limit, -xSpan / 2);
    newXEnd = Math.min(limit, xSpan / 2);
    newYStart = Math.max(-limit, -ySpan / 2);
    newYEnd = Math.min(limit, ySpan / 2);
  } else {
    // 非跟踪模式下，以当前视图中心进行缩放（参考GnssDeviation的实现）
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

// 更新数据点 - 支持三条平级轨迹
function updateFlowData() {
  // 清空所有轨迹数据和时间索引
  track1Data.splice(0, track1Data.length);
  track2Data.splice(0, track2Data.length);
  track3Data.splice(0, track3Data.length);
  track4Data.splice(0, track4Data.length);
  track1ToRawIndex.splice(0, track1ToRawIndex.length);
  track2ToRawIndex.splice(0, track2ToRawIndex.length);
  track3ToRawIndex.splice(0, track3ToRawIndex.length);
  track4ToRawIndex.splice(0, track4ToRawIndex.length);
  trackOffsetX = 0;
  trackOffsetY = 0;

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

  // 处理轨迹1数据
  if (deviationConfig.track1X.value && deviationConfig.track1Y.value) {
    const track1XData = plotData.value[deviationConfig.track1X.value];
    const track1YData = plotData.value[deviationConfig.track1Y.value];
    
    if (track1XData && track1YData && track1XData.length > 0 && track1YData.length > 0) {
      const track1DataLength = Math.min(track1XData.length, track1YData.length);
      for (let i = 0; i < track1DataLength; i++) {
        const x = track1XData[i];
        const y = track1YData[i];
        if (typeof x === 'number' && typeof y === 'number' && !isNaN(x) && !isNaN(y)) {
          const roundedX = Math.round((x - offsetX) * 1000) / 1000;
          const roundedY = Math.round((y - offsetY) * 1000) / 1000;
          track1Data.push([roundedX, roundedY]);
          track1ToRawIndex.push(i);
        }
      }
    }
  }

  // 处理轨迹2数据
  if (deviationConfig.track2X.value && deviationConfig.track2Y.value) {
    const track2XData = plotData.value[deviationConfig.track2X.value];
    const track2YData = plotData.value[deviationConfig.track2Y.value];
    
    if (track2XData && track2YData && track2XData.length > 0 && track2YData.length > 0) {
      const track2DataLength = Math.min(track2XData.length, track2YData.length);
      for (let i = 0; i < track2DataLength; i++) {
        const x = track2XData[i];
        const y = track2YData[i];
        if (typeof x === 'number' && typeof y === 'number' && !isNaN(x) && !isNaN(y)) {
          const roundedX = Math.round((x - offsetX) * 1000) / 1000;
          const roundedY = Math.round((y - offsetY) * 1000) / 1000;
          track2Data.push([roundedX, roundedY]);
          track2ToRawIndex.push(i);
        }
      }
    }
  }

  // 处理轨迹3数据
  if (deviationConfig.track3X.value && deviationConfig.track3Y.value) {
    const track3XData = plotData.value[deviationConfig.track3X.value];
    const track3YData = plotData.value[deviationConfig.track3Y.value];
    
    if (track3XData && track3YData && track3XData.length > 0 && track3YData.length > 0) {
      const track3DataLength = Math.min(track3XData.length, track3YData.length);
      for (let i = 0; i < track3DataLength; i++) {
        const x = track3XData[i];
        const y = track3YData[i];
        if (typeof x === 'number' && typeof y === 'number' && !isNaN(x) && !isNaN(y)) {
          const roundedX = Math.round((x - offsetX) * 1000) / 1000;
          const roundedY = Math.round((y - offsetY) * 1000) / 1000;
          track3Data.push([roundedX, roundedY]);
          track3ToRawIndex.push(i);
        }
      }
    }
  }

  // 处理轨迹4数据
  if (deviationConfig.track4X.value && deviationConfig.track4Y.value) {
    const track4XData = plotData.value[deviationConfig.track4X.value];
    const track4YData = plotData.value[deviationConfig.track4Y.value];
    
    if (track4XData && track4YData && track4XData.length > 0 && track4YData.length > 0) {
      const track4DataLength = Math.min(track4XData.length, track4YData.length);
      for (let i = 0; i < track4DataLength; i++) {
        const x = track4XData[i];
        const y = track4YData[i];
        track4ToRawIndex.push(i);
        if (typeof x === 'number' && typeof y === 'number' && !isNaN(x) && !isNaN(y)) {
          const roundedX = Math.round((x - offsetX) * 1000) / 1000;
          const roundedY = Math.round((y - offsetY) * 1000) / 1000;
          track4Data.push([roundedX, roundedY]);
        }
      }
    }
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
      name: '轨迹1',
      type: 'scatter',
      data: track1Data,
      coordinateSystem: 'cartesian2d',
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
      sampling: 'lttb',
      large: true,
    });
  }

  // 添加轨迹2
  if (deviationConfig.track2X.value && deviationConfig.track2Y.value && track2Data.length > 0) {
    const isLatestTrack = latestPointInfo.track === 2;
    series.push({
      name: '轨迹2',
      type: 'scatter',
      data: track2Data,
      coordinateSystem: 'cartesian2d',
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
      sampling: 'lttb',
      large: true,
    });
  }

  // 添加轨迹3
  if (deviationConfig.track3X.value && deviationConfig.track3Y.value && track3Data.length > 0) {
    const isLatestTrack = latestPointInfo.track === 3;
    series.push({
      name: '轨迹3',
      type: 'scatter',
      data: track3Data,
      coordinateSystem: 'cartesian2d',
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
      sampling: 'lttb',
      large: true,
    });
  }

  // 添加轨迹4
  if (deviationConfig.track4X.value && deviationConfig.track4Y.value && track4Data.length > 0) {
    const isLatestTrack = latestPointInfo.track === 4;
    series.push({
      name: '轨迹4',
      type: 'scatter',
      data: track4Data,
      coordinateSystem: 'cartesian2d',
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
      sampling: 'lttb',
      large: true,
    });
  }

  // 为每条轨迹添加独立的当前位置系列（不在legend中显示）
  // 跟踪模式下：所有轨迹都显示当前位置，但只有轨迹1的当前位置固定在中心
  if (isTracking.value) {
    // 轨迹1当前位置（固定在中心）
    if (deviationConfig.track1X.value && deviationConfig.track1Y.value && track1Data.length > 0) {
      series.push({
        name: '当前位置1',
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
        sampling: 'lttb',
        large: true,
      });
    }

    // 轨迹2当前位置（显示在真实位置）
    if (deviationConfig.track2X.value && deviationConfig.track2Y.value && track2Data.length > 0) {
      const lastPoint2 = track2Data[track2Data.length - 1];
      series.push({
        name: '当前位置2',
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
        sampling: 'lttb',
        large: true,
      });
    }

    // 轨迹3当前位置（显示在真实位置）
    if (deviationConfig.track3X.value && deviationConfig.track3Y.value && track3Data.length > 0) {
      const lastPoint3 = track3Data[track3Data.length - 1];
      series.push({
        name: '当前位置3',
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
        sampling: 'lttb',
        large: true,
      });
    }

    // 轨迹4当前位置（显示在真实位置）
    if (deviationConfig.track4X.value && deviationConfig.track4Y.value && track4Data.length > 0) {
      const lastPoint4 = track4Data[track4Data.length - 1];
      series.push({
        name: '当前位置4',
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
        sampling: 'lttb',
        large: true,
      });
    }
  } else {
    // 非跟踪模式下，显示所有轨迹的当前位置
    // 轨迹1当前位置
    if (deviationConfig.track1X.value && deviationConfig.track1Y.value && track1Data.length > 0) {
      const lastPoint1 = track1Data[track1Data.length - 1];
      series.push({
        name: '当前位置1',
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
        sampling: 'lttb',
        large: true,
      });
    }

    // 轨迹2当前位置
    if (deviationConfig.track2X.value && deviationConfig.track2Y.value && track2Data.length > 0) {
      const lastPoint2 = track2Data[track2Data.length - 1];
      series.push({
        name: '当前位置2',
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
        sampling: 'lttb',
        large: true,
      });
    }

    // 轨迹3当前位置
    if (deviationConfig.track3X.value && deviationConfig.track3Y.value && track3Data.length > 0) {
      const lastPoint3 = track3Data[track3Data.length - 1];
      series.push({
        name: '当前位置3',
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
        sampling: 'lttb',
        large: true,
      });
    }

    // 轨迹4当前位置
    if (deviationConfig.track4X.value && deviationConfig.track4Y.value && track4Data.length > 0) {
      const lastPoint4 = track4Data[track4Data.length - 1];
      series.push({
        name: '当前位置4',
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
        sampling: 'lttb',
        large: true,
      });
    }
  }

  // 更新图例（过滤掉所有当前位置系列）
  const legendData = series.filter(s => !s.name.startsWith('当前位置')).map(s => {
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

  chartInstance.value.setOption({
    legend: {
      data: legendData,
      right: 10,
      top: 10,
    },
    series: series
  }, {
    replaceMerge: ['series'],
    silent: false
  });
}

// 切换追踪模式
function toggleTracking() {
  isTracking.value = !isTracking.value;

  if (isTracking.value) {
    // 开启跟踪模式：以最新轨迹点为中心
    updateFlowData(); // 重新计算偏移量
    
    if (chartInstance.value) {
      // 使用maintainEqualAxisScale来保持坐标轴等比例关系
      maintainEqualAxisScale();
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
        name: xAxisName || 'X轴',
        moveOnMouseWheel: !isTracking.value,
        moveOnMouseMove: !isTracking.value
      },
      yAxis: {
        name: yAxisName || 'Y轴',
        moveOnMouseWheel: !isTracking.value,
        moveOnMouseMove: !isTracking.value
      }
    });
  }
}

// 重置缩放
function resetZoom() {
  if (!chartInstance.value) return;
  initChart();
  updateFlowData();
}

// 更新点大小
function updatePointSize() {
  if (chartInstance.value) {
    // 获取当前图表配置
    const option = chartInstance.value.getOption();
    if (option && option.series) {
      // 更新所有系列的点大小，当前位置系列使用1.2倍大小
      const updatedSeries = option.series.map(series => {
        if (series.name === '当前位置' || series.name.startsWith('当前位置')) {
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
  if (params.name === '轨迹1') {
    // 获取轨迹1的选中状态
    const track1Selected = selected['轨迹1'];
    
    // 同步设置当前位置1的选中状态
    if (track1Selected !== undefined) {
      chartInstance.value.dispatchAction({
        type: 'legendToggleSelect',
        name: '当前位置1'
      });
    }
  }
  
  // 当点击轨迹2时，同步控制当前位置2的显示状态
  if (params.name === '轨迹2') {
    // 获取轨迹2的选中状态
    const track2Selected = selected['轨迹2'];
    
    // 同步设置当前位置2的选中状态
    if (track2Selected !== undefined) {
      chartInstance.value.dispatchAction({
        type: 'legendToggleSelect',
        name: '当前位置2'
      });
    }
  }
  
  // 当点击轨迹3时，同步控制当前位置3的显示状态
  if (params.name === '轨迹3') {
    // 获取轨迹3的选中状态
    const track3Selected = selected['轨迹3'];
    
    // 同步设置当前位置3的选中状态
    if (track3Selected !== undefined) {
      chartInstance.value.dispatchAction({
        type: 'legendToggleSelect',
        name: '当前位置3'
      });
    }
  }

  // 当点击轨迹4时，同步控制当前位置4的显示状态
  if (params.name === '轨迹4') {
    // 获取轨迹4的选中状态
    const track4Selected = selected['轨迹4'];
    
    // 同步设置当前位置4的选中状态
    if (track4Selected !== undefined) {
      chartInstance.value.dispatchAction({
        type: 'legendToggleSelect',
        name: '当前位置4'
      });
    }
  }

  updateFlowData();
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

function handleChartDblClick(params) {
  // params 包含了双击事件的相关信息，如坐标、数据等
  if (params.componentType === 'series') {
    const dataIndex = params.dataIndex;
    const seriesName = params.seriesName;
    let rawTime = null;
    
    // 根据系列名称获取对应的时间戳
    if (seriesName === '轨迹1' && track1ToRawIndex[dataIndex] !== undefined) {
      rawTime = plotData.value.timestamp[track1ToRawIndex[dataIndex]];
    } else if (seriesName === '轨迹2' && track2ToRawIndex[dataIndex] !== undefined) {
      rawTime = plotData.value.timestamp[track2ToRawIndex[dataIndex]];
    } else if (seriesName === '轨迹3' && track3ToRawIndex[dataIndex] !== undefined) {
      rawTime = plotData.value.timestamp[track3ToRawIndex[dataIndex]];
    } else if (seriesName === '轨迹4' && track4ToRawIndex[dataIndex] !== undefined) {
      rawTime = plotData.value.timestamp[track4ToRawIndex[dataIndex]];
    } else if (seriesName === '当前位置1' && track1ToRawIndex.length > 0) {
      // 当前位置1使用轨迹1的最后一个时间戳
      rawTime = plotData.value.timestamp[track1ToRawIndex[track1ToRawIndex.length - 1]];
    } else if (seriesName === '当前位置2' && track2ToRawIndex.length > 0) {
      // 当前位置2使用轨迹2的最后一个时间戳
      rawTime = plotData.value.timestamp[track2ToRawIndex[track2ToRawIndex.length - 1]];
    } else if (seriesName === '当前位置3' && track3ToRawIndex.length > 0) {
      // 当前位置3使用轨迹3的最后一个时间戳
      rawTime = plotData.value.timestamp[track3ToRawIndex[track3ToRawIndex.length - 1]];
    } else if (seriesName === '当前位置4' && track4ToRawIndex.length > 0) {
      // 当前位置4使用轨迹4的最后一个时间戳
      rawTime = plotData.value.timestamp[track4ToRawIndex[track4ToRawIndex.length - 1]];
    }
    
    if (rawTime !== null) {
      const parts = rawTime.toString().split('.');
      const targetTime = parts[0] + (parts[1] ? '.' + parts[1].substring(0, 2) : '.00');

      searchQuery.value = targetTime;
      findAll();
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
  if (seriesName === '轨迹1' && track1ToRawIndex[dataIndex] !== undefined) {
    targetTime = plotData.value.timestamp[track1ToRawIndex[dataIndex]];
  } else if (seriesName === '轨迹2' && track2ToRawIndex[dataIndex] !== undefined) {
    targetTime = plotData.value.timestamp[track2ToRawIndex[dataIndex]];
  } else if (seriesName === '轨迹3' && track3ToRawIndex[dataIndex] !== undefined) {
    targetTime = plotData.value.timestamp[track3ToRawIndex[dataIndex]];
  } else if (seriesName === '轨迹4' && track4ToRawIndex[dataIndex] !== undefined) {
    targetTime = plotData.value.timestamp[track4ToRawIndex[dataIndex]];
  } else if (seriesName === '当前位置1' && track1ToRawIndex.length > 0) {
    targetTime = plotData.value.timestamp[track1ToRawIndex[track1ToRawIndex.length - 1]];
  } else if (seriesName === '当前位置2' && track2ToRawIndex.length > 0) {
    targetTime = plotData.value.timestamp[track2ToRawIndex[track2ToRawIndex.length - 1]];
  } else if (seriesName === '当前位置3' && track3ToRawIndex.length > 0) {
    targetTime = plotData.value.timestamp[track3ToRawIndex[track3ToRawIndex.length - 1]];
  } else if (seriesName === '当前位置4' && track4ToRawIndex.length > 0) {
    targetTime = plotData.value.timestamp[track4ToRawIndex[track4ToRawIndex.length - 1]];
  }
  
  if (targetTime === null) return;
  
  // 首先清理之前的高亮状态
  handleMouseOut();
  
  // 找到所有轨迹中相同时间的点并高亮（包括当前轨迹）
  const highlightData = [];
  const series = chartInstance.value.getOption().series;
  
  // 检查轨迹1中是否有相同时间的点
  for (let i = 0; i < track1ToRawIndex.length; i++) {
    if (plotData.value.timestamp[track1ToRawIndex[i]] === targetTime) {
      const seriesIndex = series.findIndex(s => s.name === '轨迹1');
      if (seriesIndex !== -1) {
        highlightData.push({
          seriesIndex: seriesIndex,
          dataIndex: i
        });
      }
      break;
    }
  }
  
  // 检查轨迹2中是否有相同时间的点
  for (let i = 0; i < track2ToRawIndex.length; i++) {
    if (plotData.value.timestamp[track2ToRawIndex[i]] === targetTime) {
      const seriesIndex = series.findIndex(s => s.name === '轨迹2');
      if (seriesIndex !== -1) {
        highlightData.push({
          seriesIndex: seriesIndex,
          dataIndex: i
        });
      }
      break;
    }
  }
  
  // 检查轨迹3中是否有相同时间的点
  for (let i = 0; i < track3ToRawIndex.length; i++) {
    if (plotData.value.timestamp[track3ToRawIndex[i]] === targetTime) {
      const seriesIndex = series.findIndex(s => s.name === '轨迹3');
      if (seriesIndex !== -1) {
        highlightData.push({
          seriesIndex: seriesIndex,
          dataIndex: i
        });
      }
      break;
    }
  }
  
  // 检查轨迹4中是否有相同时间的点
  for (let i = 0; i < track4ToRawIndex.length; i++) {
    if (plotData.value.timestamp[track4ToRawIndex[i]] === targetTime) {
      const seriesIndex = series.findIndex(s => s.name === '轨迹4');
      if (seriesIndex !== -1) {
        highlightData.push({
          seriesIndex: seriesIndex,
          dataIndex: i
        });
      }
      break;
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
  if (seriesName === '轨迹1' && deviationConfig.track1X.value && deviationConfig.track1Y.value) {
    xField = deviationConfig.track1X.value;
    yField = deviationConfig.track1Y.value;
    dataIndexModifed = track1ToRawIndex[params.dataIndex];
    currentTime = plotData.value.timestamp[dataIndexModifed];
    originX = plotData.value[deviationConfig.track1X.value][dataIndexModifed];
    originY = plotData.value[deviationConfig.track1Y.value][dataIndexModifed];
  } else if (seriesName === '轨迹2' && deviationConfig.track2X.value && deviationConfig.track2Y.value) {
    xField = deviationConfig.track2X.value;
    yField = deviationConfig.track2Y.value;
    dataIndexModifed = track2ToRawIndex[params.dataIndex];
    currentTime = plotData.value.timestamp[dataIndexModifed];
    originX = plotData.value[deviationConfig.track2X.value][dataIndexModifed];
    originY = plotData.value[deviationConfig.track2Y.value][dataIndexModifed];
  } else if (seriesName === '轨迹3' && deviationConfig.track3X.value && deviationConfig.track3Y.value) {
    xField = deviationConfig.track3X.value;
    yField = deviationConfig.track3Y.value;
    dataIndexModifed = track3ToRawIndex[params.dataIndex];
    currentTime = plotData.value.timestamp[dataIndexModifed];
    originX = plotData.value[deviationConfig.track3X.value][dataIndexModifed];
    originY = plotData.value[deviationConfig.track3Y.value][dataIndexModifed];
  } else if (seriesName === '轨迹4' && deviationConfig.track4X.value && deviationConfig.track4Y.value) {
    xField = deviationConfig.track4X.value;
    yField = deviationConfig.track4Y.value;
    dataIndexModifed = track4ToRawIndex[params.dataIndex];
    currentTime = plotData.value.timestamp[dataIndexModifed];
    originX = plotData.value[deviationConfig.track4X.value][dataIndexModifed];
    originY = plotData.value[deviationConfig.track4Y.value][dataIndexModifed];
  } else if (seriesName === '当前位置1' && deviationConfig.track1X.value && deviationConfig.track1Y.value) {
    // 当前位置1使用轨迹1的字段和时间
    xField = deviationConfig.track1X.value;
    yField = deviationConfig.track1Y.value;
    dataIndexModifed = track1ToRawIndex[track1Data.length - 1];
    currentTime = plotData.value.timestamp[dataIndexModifed];
    originX = plotData.value[deviationConfig.track1X.value][dataIndexModifed];
    originY = plotData.value[deviationConfig.track1Y.value][dataIndexModifed];
  } else if (seriesName === '当前位置2' && deviationConfig.track2X.value && deviationConfig.track2Y.value) {
    // 当前位置2使用轨迹2的字段和时间
    xField = deviationConfig.track2X.value;
    yField = deviationConfig.track2Y.value;
    dataIndexModifed = track2ToRawIndex[track2Data.length - 1];
    currentTime = plotData.value.timestamp[dataIndexModifed];
    originX = plotData.value[deviationConfig.track2X.value][dataIndexModifed];
    originY = plotData.value[deviationConfig.track2Y.value][dataIndexModifed];
  } else if (seriesName === '当前位置3' && deviationConfig.track3X.value && deviationConfig.track3Y.value) {
    // 当前位置3使用轨迹3的字段和时间
    xField = deviationConfig.track3X.value;
    yField = deviationConfig.track3Y.value;
    dataIndexModifed = track3ToRawIndex[track3Data.length - 1];
    currentTime = plotData.value.timestamp[dataIndexModifed];
    originX = plotData.value[deviationConfig.track3X.value][dataIndexModifed];
    originY = plotData.value[deviationConfig.track3Y.value][dataIndexModifed];
  } else if (seriesName === '当前位置4' && deviationConfig.track4X.value && deviationConfig.track4Y.value) {
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
  
  // 获取当前图表配置
  const option = chartInstance.value.getOption();
  if (!option || !option.series) return;
  
  // 取消所有系列的高亮状态
  option.series.forEach((series, index) => {
    if (series.data && series.data.length > 0) {
      // 为每个数据点执行downplay操作
      for (let i = 0; i < series.data.length; i++) {
        chartInstance.value.dispatchAction({
          type: 'downplay',
          seriesIndex: index,
          dataIndex: i
        });
      }
    }
  });

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


  window.addEventListener('keydown', handleKeyDown);
});

// 组件卸载时清理资源
onUnmounted(() => {
  if (chartInstance.value) {
    // 移除事件监听
    chartInstance.value.off('mouseover', handleMouseOver);
    chartInstance.value.off('mouseout', handleMouseOut);
    chartInstance.value.off('globalout', handleMouseOut);
    chartInstance.value.off('dblclick', handleChartDblClick); // 移除双击事件监听
    chartInstance.value.off('legendselectchanged', handleLegendSelectChanged); // 移除图例点击事件监听
    
    chartInstance.value.dispose();
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  if (dataUpdateInterval) {
    clearInterval(dataUpdateInterval);
  }
  // 清理高亮超时定时器
  if (highlightTimeout.value) {
    clearTimeout(highlightTimeout.value);
    highlightTimeout.value = null;
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
  margin: 0 10px;
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
  background-color: #f9f9f9;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
  transition: all 0.3s ease;
}

.chart-config-section:hover {
  background-color: #f5f7fa;
  border-color: #c0c4cc;
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
  color: #303133;
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