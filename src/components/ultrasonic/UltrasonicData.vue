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
        <el-button type="default" size="small" @click="fileInput?.click()" class="upload-btn" :disabled="deviceConnected">
          载入
        </el-button>
        <el-button type="default" size="small" @click="saveData" class="save-btn" :disabled="rawData.length===0 || deviceConnected">
          保存
        </el-button>
        <el-button type="default" size="small" @click="clearPlotData" class="clear-btn">
          清除
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
import { useUltrasonic } from '@/composables/ultrasonic/useUltrasonic'
import { ElMessage } from 'element-plus'
import { useDevice } from '@/hooks/useDevice'

// 初始化超声波数据处理
const { timestamps, rawData, filteredData, obstacleData, initRawData, clearRawData, saveData } = useUltrasonic()

const fileInput = ref<HTMLInputElement>()
const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null
const deviceConnected = ref(useDevice().deviceConnected)
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
  const rawDataSeries = rawData.value.map((item, index: number) => [timestamps.value[index], item])
  const filteredDataSeries = filteredData.value.map((item, index: number) => [timestamps.value[index], item])
  const obstacleDataSeries = obstacleData.value.map((item, index: number) => [timestamps.value[index], item])

  let xAxisStart = 0
  if (timeRange.value > 0 && rawDataSeries.length > timeRange.value) {
    xAxisStart = (1 - timeRange.value / rawDataSeries.length) * 100
  }
  
  if (rawDataSeries.length === 0) {
    return {
      title: { 
        text: '超声波避障',
        left: 'center',
        textStyle: { fontSize: 14 } 
      },
      grid: {
        left: '5%',
        right: '10%',
        bottom: '15%', // 增加底部空间给dataZoom
        containLabel: true
      },
      xAxis: { type: 'value', name: '时间(s)', data: [] },
      yAxis: { type: 'value', name: '距离(m)' },
      series: [
        {
          name: '原始距离',
          symbolSize: 4,
          type: 'line',
          data: [],
          connectNulls: false,
        },
        {
          name: '5帧中值滤波',
          symbolSize: 4,
          type: 'line',
          data: [],
          connectNulls: false,
        },
        {
          name: '障碍物检测',
          symbolSize: 4,
          type: 'line',
          data: [],
          connectNulls: false,
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
        }
      ],
    }
  }

  return {
    title: { 
      text: '超声波避障',
      left: 'center',
      textStyle: { fontSize: 14 } 
    },
    tooltip: { 
      trigger: 'axis',
      formatter: (params: any) => {
        let result = `时间: ${params[0].data[0].toFixed(2)}s<br/>`
        params.forEach((param: any) => {
          if (param.value !== null) {
            result += `${param.marker}${param.seriesName}: ${param.data[1]} m<br/>`
          }
        })
        return result
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
      data: ['原始距离', '5帧中值滤波', '障碍物检测'],
      top: 50,
      left: 'right'
    },
    grid: {
      left: '2%',
      right: '10%',
      bottom: '15%',
      top: '20%', // 增加顶部空间给legend
      containLabel: true
    },
    xAxis: { 
      type: 'value',
      name: '时间(s)',
      axisLabel: {
        formatter: function(value: number) {
          return value.toFixed(2) + 's';
        }
      }
    },
    yAxis: { 
      type: 'value',
      name: '距离(m)',
      axisLabel: { formatter: '{value}' }
    },
    // 添加dataZoom组件实现滚动条和鼠标滚轮缩放
    dataZoom: [
      {
        type: 'slider',
        show: true,
        xAxisIndex: 0,
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
      // 添加inside类型的dataZoom以支持鼠标滚轮缩放
      { 
        type: 'inside',
        xAxisIndex: 0,
        start: xAxisStart,
        end: 100,
        minSpan: 1.0,
        rangeMode: 'value',
        zoomOnMouseWheel: true, // 启用鼠标滚轮缩放
        moveOnMouseMove: true, // 启用鼠标拖动平移
        moveOnMouseWheel: true, // 鼠标滚轮移动视图
        preventDefaultMouseMove: true, // 阻止默认的鼠标移动事件
      }
    ],
    series: [
      { 
        name: '原始距离',
        type: 'line',
        data: rawDataSeries,
        smooth: true,
        itemStyle: { color: '#409EFF' },
        lineStyle: { width: 2 },
        showSymbol: false,
        large: true,
        largeThreshold: 5000,
        progressive: 5000,
        progressiveThreshold: 10000,
        animation: false,
        ...(rawDataSeries.length > 5000 && { sampling: 'lttb' })
      },
      { 
        name: '5帧中值滤波',
        type: 'line',
        data: filteredDataSeries,
        smooth: true,
        itemStyle: { color: '#67C23A' },
        lineStyle: { width: 2 },
        showSymbol: false,
        large: true,
        largeThreshold: 5000,
        progressive: 5000,
        progressiveThreshold: 10000,
        animation: false,
        ...(filteredDataSeries.length > 5000 && { sampling: 'lttb' })
      },
      { 
        name: '障碍物检测',
        type: 'line',
        data: obstacleDataSeries,
        smooth: false, // 障碍物检测不使用平滑
        itemStyle: { color: '#F56C6C' },
        lineStyle: { 
          width: 3,
          type: 'solid' // 使用实线突出显示障碍物
        },
        symbol: 'circle', // 显示点标记
        symbolSize: 3, // 点标记大小
        emphasis: { 
          itemStyle: { 
            shadowBlur: 10,
            shadowColor: 'rgba(245, 108, 108, 0.5)'
          }
        },
        connectNulls: false,
        large: true,
        largeThreshold: 5000,
        progressive: 5000,
        progressiveThreshold: 10000,
        animation: false,
        ...(obstacleDataSeries.length > 5000 && { sampling: 'lttb' })
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
    if (rawData.value.length === 0) {
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
      ElMessage({
        message: `文件数据处理失败`,
        type: 'error',
        placement: 'bottom-right',
        offset: 50,
      })
      console.error('文件处理错误:', error)
    }
  }
  reader.onerror = () => {
    ElMessage({
      message: `文件读取失败`,
      type: 'error',
      placement: 'bottom-right',
      offset: 50,
    })
  }
  reader.readAsText(file)
  
  // 重置文件输入，以便可以重复上传同一个文件
  target.value = ''
}

// 监听数据变化更新图表
watch(rawData, () => {
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
  box-sizing: border-box;
}

.controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  height: 50px;
  box-sizing: border-box;
}

.time-range-control {
  font-size: 12px;
  display: flex;
  align-items: center;
  padding: 4px 12px;
}

.file-controls {
  display: flex;
}

.chart-container {
  flex: 1;
  min-height: 200px;
  /* 确保容器有明确的尺寸 */
  width: 100%;
  height: 400px;
  padding: 10px;
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
