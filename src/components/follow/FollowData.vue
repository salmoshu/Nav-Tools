<template>
  <div class="ultrasonic-container">
    <div class="controls">
      <div class="time-range-control">
        <span>时间范围/帧：</span>
        <el-select v-model="timeRange" placeholder="选择时间范围" size="small" @change="updateChart" :disabled="!deviceConnected">
          <el-option label="100" :value="100"></el-option>
          <el-option label="200" :value="200"></el-option>
          <el-option label="500" :value="500"></el-option>
          <el-option label="全部" :value="0"></el-option>
        </el-select>
      </div>
      
      <div class="file-controls">
        <input type="file" ref="fileInput" @change="handleFileUpload" accept=".txt,.csv" style="display: none">
        <el-button type="primary" size="small" @click="fileInput?.click()" class="upload-btn" :disabled="deviceConnected">
          载入数据
        </el-button>
        <el-button type="primary" size="small" @click="saveData" class="save-btn" :disabled="cameraDistance.length===0 || deviceConnected">
          保存数据
        </el-button>
        <el-button type="default" size="small" @click="clearPlotData" class="clear-btn">
          清除数据
        </el-button>
      </div>
    </div>
    <!-- 使用从useEcharts返回的chartRef -->
    <div ref="chartRef" class="chart-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import { useFollow } from '@/composables/follow/useFollow'
import { ElMessage } from 'element-plus'
import { useDevice } from '@/hooks/useDevice'

// 初始化超声波数据处理
const { timestamps, cameraDistance, cameraAngle, motorLeftSpeed, motorRightSpeed, initRawData, clearRawData, saveData } = useFollow()

const fileInput = ref<HTMLInputElement>()
const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null
const deviceConnected = ref(useDevice().deviceConnected)
// 将timeRange改为响应式变量
const timeRange = ref<number>(100)

// 清除数据
function clearPlotData() {
  clearRawData()
  updateChart()
}

// 创建自定义图表配置
function createChartOption() {
  // 由于x、y轴都是value类型，因此需要处理为二维数组的形式
  // item, index
  const cameraDistanceSeries = cameraDistance.value.map((item, index: number) => [timestamps.value[index], item])
  const cameraAngleSeries = cameraAngle.value.map((item, index: number) => [timestamps.value[index], item])
  const motorLeftSpeedSeries = motorLeftSpeed.value.map((item, index: number) => [timestamps.value[index], item])
  const motorRightSpeedSeries = motorRightSpeed.value.map((item, index: number) => [timestamps.value[index], item])

  let xAxisStart = 0
  if (timeRange.value > 0 && cameraDistanceSeries.length > timeRange.value) {
    xAxisStart = (1 - timeRange.value / cameraDistanceSeries.length) * 100
  }
  
  if (cameraDistanceSeries.length === 0) {
    return {
      title: { 
        text: 'FollowFit 感知与控制',
        left: 'center',
        textStyle: { fontSize: 14 } 
      },
      grid: [
        {
          left: '5%',
          right: '10%',
          bottom: '60%',
          containLabel: true
        },
        {
          left: '5%',
          right: '10%',
          top: '50%',
          containLabel: true
        }
      ],
      xAxis: [
        { type: 'value', name: '时间(s)', data: [], gridIndex: 0 },
        { type: 'value', name: '时间(s)', data: [], gridIndex: 1 }
      ],
      yAxis: [
        { type: 'value', name: '距离(m)', gridIndex: 0 },
        { type: 'value', name: '角度(°)', gridIndex: 0 },
        { type: 'value', name: '速度(m/s)', gridIndex: 1 }
      ],
      series: [
        {
          name: '相机距离',
          symbolSize: 4,
          type: 'line',
          data: [],
          yAxisIndex: 0,
          xAxisIndex: 0
        },
        {
          name: '相机角度',
          symbolSize: 4,
          type: 'line',
          data: [],
          yAxisIndex: 1,
          xAxisIndex: 0
        },
        {
          name: '左轮速度',
          symbolSize: 4,
          type: 'line',
          data: [],
          yAxisIndex: 2,
          xAxisIndex: 1
        },
        {
          name: '右轮速度',
          symbolSize: 4,
          type: 'line',
          data: [],
          yAxisIndex: 2,
          xAxisIndex: 1
        }
      ],
      dataZoom: [
        {
          type: 'slider',
          show: false,
          xAxisIndex: 0
        },
        {
          type: 'inside',
          show: false,
          xAxisIndex: 0
        },
        {
          type: 'slider',
          show: false,
          xAxisIndex: 1
        },
        {
          type: 'inside',
          show: false,
          xAxisIndex: 1
        }
      ],
    }
  }

  return {
    title: { 
      text: 'FollowFit 感知与控制',
      left: 'center',
      textStyle: { fontSize: 14 } 
    },
    tooltip: { 
      trigger: 'axis',
      formatter: (params: any) => {
        let result = `时间: ${params[0].data[0].toFixed(2)}s<br/>`
        if (params[0] && params[0].data[1] !== null) {
          result += `${params[0].marker}相机距离: ${params[0].data[1].toFixed(2)}m<br/>`
        }
        if (params[1] && params[1].data[1] !== null) {
          result += `${params[1].marker}相机角度: ${params[1].data[1].toFixed(1)}°<br/>`
        }
        if (params[2] && params[2].data[1] !== null) {
          result += `${params[2].marker}左轮速度: ${params[2].data[1].toFixed(2)}m/s<br/>`
        }
        if (params[3] && params[3].data[1] !== null) {
          result += `${params[3].marker}右轮速度: ${params[3].data[1].toFixed(2)}m/s<br/>`
        }
        return result;
      },
      textStyle: {
        fontSize: 12
      },
      backgroundColor: 'rgba(255, 255, 255, 0.7)',
      borderColor: '#eee',
      borderWidth: 1,
      borderRadius: 4,
      shadowBlur: 5,
      shadowColor: 'rgba(0, 0, 0, 0.1)',
      maxWidth: 250,
    },
    legend: { 
      data: ['相机距离', '相机角度', '左轮速度', '右轮速度'],
      top: 50,
      left: 'right'
    },
    grid: [
      {
        left: '2%',
        right: '10%',
        // 1 - top - bottom
        bottom: '45%',
        top: '20%',
        containLabel: true
      },
      {
        left: '2%',
        // 1 - top - bottom
        right: '10%',
        top: '60%',
        bottom: '10%',
        containLabel: true
      }
    ],
    xAxis: [
      {
        type: 'value',
        name: '时间(s)',
        axisLabel: {
          formatter: function(value: number) {
            return value.toFixed(2);
          }
        },
        gridIndex: 0,
        nameGap: 45,
      },
      {
        type: 'value',
        name: '时间(s)',
        axisLabel: {
          formatter: function(value: number) {
            return value.toFixed(2);
          }
        },
        gridIndex: 1
      }
    ],
    yAxis: [
      {
        type: 'value',
        name: '距离(m)',
        axisLabel: {
          formatter: function(value: any) {
            return value ? value.toFixed(2) : null;
          }
        },
        gridIndex: 0
      },
      {
        type: 'value',
        name: '角度(°)',
        axisLabel: {
          formatter: function(value: any) {
            return value ? value.toFixed(1) : null;
          }
        },
        gridIndex: 0
      },
      {
        type: 'value',
        name: '速度(m/s)',
        axisLabel: {
          formatter: function(value: any) {
            return value ? value.toFixed(2) : null;
          }
        },
        gridIndex: 1
      }
    ],
    // 添加dataZoom组件实现滚动条和鼠标滚轮缩放
    dataZoom: [
      {
        type: 'slider',
        show: true,
        xAxisIndex: [0, 1],
        start: xAxisStart,
        end: 100,
        bottom: 5,
        height: 20,
        borderColor: '#ddd',
        fillerColor: 'rgba(64, 158, 255, 0.1)',
        handleStyle: { color: '#409EFF' },
        textStyle: { color: '#666', fontSize: 12 },
        minSpan: 1.0,
        rangeMode: 'value',
      },
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        start: xAxisStart,
        end: 100,
        minSpan: 1.0,
        rangeMode: 'value',
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: true,
        preventDefaultMouseMove: true,
      }
    ],
    series: [
      {
        name: '相机距离',
        type: 'line',
        data: cameraDistanceSeries,
        smooth: true,
        itemStyle: { color: '#409EFF' },
        lineStyle: { width: 2 },
        showSymbol: false,
        large: true,
        largeThreshold: 5000,
        progressive: 5000,
        progressiveThreshold: 10000,
        animation: false,
        yAxisIndex: 0,
        xAxisIndex: 0,
        connectNulls: false,
        ...(cameraDistanceSeries.length > 5000 && { sampling: 'lttb' })
      },
      {
        name: '相机角度',
        type: 'line',
        data: cameraAngleSeries,
        smooth: true,
        itemStyle: { color: '#FF4040' },
        lineStyle: { width: 2 },
        showSymbol: false,
        large: true,
        largeThreshold: 5000,
        progressive: 5000,
        progressiveThreshold: 10000,
        animation: false,
        yAxisIndex: 1,
        xAxisIndex: 0,
        markLine: {
          silent: true,
          lineStyle: {
            color: '#000',
            width: 1,
            type: 'solid',
          },
          data: [{
            yAxis: 0,
          }],
          symbol: 'none',
          label: {
            show: false,
          },
        },
        connectNulls: false,
        ...(cameraAngleSeries.length > 5000 && { sampling: 'lttb' })
      },
      {
        name: '左轮速度',
        type: 'line',
        data: motorLeftSpeedSeries,
        smooth: true,
        itemStyle: { color: '#20C997' },
        lineStyle: { width: 2 },
        showSymbol: false,
        large: true,
        largeThreshold: 5000,
        progressive: 5000,
        progressiveThreshold: 10000,
        animation: false,
        yAxisIndex: 2,
        xAxisIndex: 1,
        connectNulls: false,
        ...(motorLeftSpeedSeries.length > 5000 && { sampling: 'lttb' })
      },
      {
        name: '右轮速度',
        type: 'line',
        data: motorRightSpeedSeries,
        smooth: true,
        itemStyle: { color: '#F7BA1E' },
        lineStyle: { width: 2 },
        showSymbol: false,
        large: true,
        largeThreshold: 5000,
        progressive: 5000,
        progressiveThreshold: 10000,
        animation: false,
        yAxisIndex: 2,
        xAxisIndex: 1,
        connectNulls: false,
        ...(motorRightSpeedSeries.length > 5000 && { sampling: 'lttb' })
      }
    ]
  }
}

// 初始化图表
function initChart() {
  if (!chartRef.value || chart) return

  try {
    chart = echarts.init(chartRef.value)
    const options = createChartOption()
    chart.setOption(options)
    
    // 延迟调整尺寸
    setTimeout(() => {
      if (chart && chartRef.value) {
        chart.resize()
      }
    }, 10)
    
    // 添加ResizeObserver
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        if (chart && chartRef.value) {
          chart.resize()
        }
      })
      resizeObserver.observe(chartRef.value)
    }
  } catch (error) {
    console.error('Failed to initialize chart:', error)
  }
}

// 更新图表
function updateChart() {
  if (!chart) return
  
  try {
    const options = createChartOption()
    if (cameraDistance.value.length === 0) {
      // 当数据为空时，使用notMerge: true强制替换所有配置
      chart.setOption(options, { notMerge: true })
    } else {
      // 当有数据时，仍使用合并模式以保持交互状态
      chart.setOption(options, { notMerge: false, lazyUpdate: true })
    }
    
    // 延迟调整尺寸
    setTimeout(() => {
      if (chart && chartRef.value) {
        chart.resize()
      }
    }, 500)
  } catch (error) {
    console.error('Failed to update chart:', error)
  }
}

// 清理资源
function dispose() {
  if (resizeObserver && chartRef.value) {
    resizeObserver.unobserve(chartRef.value)
    resizeObserver = null
  }
  
  if (chart) {
    chart.dispose()
    chart = null
  }
}

// 处理文件上传
function handleFileUpload(event: Event) {
  clearPlotData()
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    try {
      timeRange.value = 0
      initRawData(content, 0)
      updateChart()
    } catch (error) {
      ElMessage.error('文件数据处理失败')
      console.error('文件处理错误:', error)
    }
  }
  reader.onerror = () => {
    ElMessage.error('文件读取失败')
  }
  reader.readAsText(file)
  
  // 重置文件输入，以便可以重复上传同一个文件
  target.value = ''
}

// 监听数据变化更新图表
watch(cameraDistance, () => {
  if (deviceConnected.value) {
    updateChart()
  }
}, { immediate: true, deep: true })

// 组件挂载时初始化
onMounted(() => {
  // 延迟初始化确保DOM就绪
  setTimeout(initChart, 50)
})

// 组件卸载时清理
onUnmounted(() => {
  dispose()
})
</script>

<style scoped>
.ultrasonic-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 10px;
  box-sizing: border-box;
}

.controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 10px;
}

.time-range-control {
  font-size: 12px;
  display: flex;
  align-items: center;
  padding: 4px 12px;
}

.file-controls {
  display: flex;
  gap: 5px;
}

.chart-container {
  flex: 1;
  min-height: 200px;
  /* 确保容器有明确的尺寸 */
  width: 100%;
  height: 400px;
}

/* Element Plus 按钮样式调整 */
:deep(.upload-btn) {
  font-size: 12px;
  padding: 4px 12px;
}

:deep(.clear-btn) {
  font-size: 12px;
  padding: 4px 12px;
}

/* Element Plus 下拉框样式调整 */
:deep(.el-select) {
  width: 120px;
}

:deep(.el-select .el-input__inner) {
  font-size: 12px;
}
</style>
