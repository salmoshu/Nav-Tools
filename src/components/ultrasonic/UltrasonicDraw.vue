<template>
  <div class="ultrasonic-container">
    <div class="controls">
      <div class="file-controls">
        <input type="file" ref="fileInput" @change="handleFileUpload" accept=".txt,.csv" style="display: none">
        <el-button type="primary" size="small" @click="$refs.fileInput.click()" class="upload-btn">
          上传数据文件
        </el-button>
        <el-button type="default" size="small" @click="clearData" class="clear-btn">
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
import { useUltrasonicFile } from '@/composables/ultrasonic/useUltrasonicFile'
import { ElMessage } from 'element-plus'

// 初始化超声波数据处理
const { ultrasonicData, processRawData } = useUltrasonicFile()
const fileInput = ref<HTMLInputElement>()
const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

// 中值滤波函数 - 5帧
function medianFilter(data: number[], windowSize: number = 5): number[] {
  const filteredData = [...data]
  const halfWindow = Math.floor(windowSize / 2)
  
  for (let i = 0; i < data.length; i++) {
    // 确定窗口范围
    const start = Math.max(0, i - halfWindow)
    const end = Math.min(data.length - 1, i + halfWindow)
    
    // 提取窗口内的数据
    const windowData: number[] = []
    for (let j = start; j <= end; j++) {
      windowData.push(data[j])
    }
    
    // 排序并取中值
    windowData.sort((a, b) => a - b)
    const medianIndex = Math.floor(windowData.length / 2)
    filteredData[i] = windowData[medianIndex]
  }
  
  return filteredData
}

// 障碍物检测函数
function detectObstacles(data: number[]): number[] {
  const obstacleData: any[] = []
  const dTh = 1000    // 阈值设为1000mm
  const deltaTh = 200 // 差值阈值设为200mm
  
  // 第一步：标记连续3帧都小于阈值的点
  const continuousBelowThreshold: boolean[] = new Array(data.length).fill(false)
  
  for (let i = 2; i < data.length; i++) {
    if (data[i - 2] < dTh && data[i - 1] < dTh && data[i] < dTh) {
      continuousBelowThreshold[i] = true
    }
  }
  
  // 第二步：识别误检点
  const isFalseDetection: boolean[] = new Array(data.length).fill(false)
  
  for (let i = 1; i < data.length - 1; i++) {
    const deltaPrev = Math.abs(data[i] - data[i - 1])
    const deltaNext = Math.abs(data[i + 1] - data[i])
    
    // 检测单次跳变（仅出现一次的大幅差值）
    if (deltaPrev > deltaTh && deltaNext <= deltaTh && 
        data[i - 1] >= dTh && data[i] < dTh && data[i + 1] >= dTh) {
      isFalseDetection[i] = true
    }
  }
  
  // 第三步：生成障碍物数据
  for (let i = 0; i < data.length; i++) {
    // 障碍物点显示为实际距离值，非障碍物点设为null不显示
    obstacleData.push(continuousBelowThreshold[i] && !isFalseDetection[i] ? data[i] : null)
  }
  
  return obstacleData
}

// 处理文件上传
function handleFileUpload(event: Event) {
  clearData()
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    try {
      processRawData(content, 0)
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

// 清除数据
function clearData() {
  ultrasonicData.value = []
  updateChart()
}

// 创建自定义图表配置
function createChartOption() {
  // 始终使用完整数据，通过dataZoom控制显示范围
  const data = ultrasonicData.value
  
  if (data.length === 0) {
    return {
      title: { 
        text: '超声波距离测量',
        left: 'center',
        textStyle: { fontSize: 14 } 
      },
      grid: {
        left: '5%',
        right: '10%',
        bottom: '15%', // 增加底部空间给dataZoom
        containLabel: true
      },
      xAxis: { type: 'category', data: [] },
      yAxis: { type: 'value', name: '距离值' },
      series: []
    }
  }
  
  const times = data.map(point => point[0].toFixed(2))
  const distances = data.map(point => point[1])
  
  // 计算5帧中值滤波后的数据
  const filteredDistances = medianFilter(distances, 5)
  
  // 计算障碍物检测数据
  const obstacleData = detectObstacles(filteredDistances)
  
  return {
    title: { 
      text: '超声波距离测量',
      left: 'center',
      textStyle: { fontSize: 14 } 
    },
    tooltip: { 
      trigger: 'axis',
      formatter: (params: any) => {
        let result = `时间: ${params[0].name}s<br/>`
        params.forEach((param: any) => {
          if (param.value !== null) {
            result += `${param.marker}${param.seriesName}: ${param.value}<br/>`
          }
        })
        return result
      },
      textStyle: {
        fontSize: 12
      }
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
      type: 'category',
      data: times,
      name: '时间(s)'
    },
    yAxis: { 
      type: 'value',
      name: '距离值',
      axisLabel: { formatter: '{value}' }
    },
    // 添加dataZoom组件实现滚动条和鼠标滚轮缩放
    dataZoom: [
      { 
        type: 'slider',
        show: true,
        xAxisIndex: 0,
        start: 0,
        end: 100,
        bottom: 5,
        height: 20,
        borderColor: '#ddd',
        fillerColor: 'rgba(64, 158, 255, 0.1)',
        handleStyle: { color: '#409EFF' },
        textStyle: { color: '#666', fontSize: 12 }
      },
      // 添加inside类型的dataZoom以支持鼠标滚轮缩放
      { 
        type: 'inside',
        xAxisIndex: 0,
        start: 0,
        end: 100,
        zoomOnMouseWheel: true, // 启用鼠标滚轮缩放
        moveOnMouseMove: true, // 启用鼠标拖动平移
        moveOnMouseWheel: true, // 鼠标滚轮移动视图
        preventDefaultMouseMove: true // 阻止默认的鼠标移动事件
      }
    ],
    series: [
      { 
        name: '原始距离',
        type: 'line',
        data: distances,
        smooth: true,
        itemStyle: { color: '#409EFF' },
        lineStyle: { width: 2 },
        showSymbol: false // 不显示原始数据的点标记，减少视觉干扰
      },
      { 
        name: '5帧中值滤波',
        type: 'line',
        data: filteredDistances,
        smooth: true,
        itemStyle: { color: '#67C23A' },
        lineStyle: { width: 2 },
        showSymbol: false // 不显示滤波数据的点标记
      },
      { 
        name: '障碍物检测',
        type: 'line',
        data: obstacleData,
        smooth: false, // 障碍物检测不使用平滑
        itemStyle: { color: '#F56C6C' },
        lineStyle: { 
          width: 3,
          type: 'solid' // 使用实线突出显示障碍物
        },
        symbol: 'circle', // 显示点标记
        symbolSize: 6, // 点标记大小
        emphasis: { 
          itemStyle: { 
            shadowBlur: 10,
            shadowColor: 'rgba(245, 108, 108, 0.5)'
          }
        },
        connectNulls: false // 不连接null值，只显示连续的障碍物点
      }
    ]
  }
}

// 初始化图表
function initChart() {
  if (!chartRef.value || chart) return
  
  try {
    chart = echarts.init(chartRef.value)
    chart.setOption(createChartOption())
    
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
    chart.setOption(createChartOption(), { notMerge: false }) // 使用合并模式以保持交互状态
    
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

// 监听数据变化更新图表
watch([ultrasonicData], () => {
  updateChart()
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
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 10px;
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
</style>
