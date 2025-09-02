<template>
  <div class="ultrasonic-container">
    <div class="controls">
      <div class="file-controls">
        <input type="file" ref="fileInput" @change="handleFileUpload" accept=".txt,.csv" style="display: none">
        <el-button type="primary" size="small" @click="$refs.fileInput.click()" class="upload-btn" :disabled="deviceBusy">
          载入数据
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
import { useUltrasonic } from '@/composables/ultrasonic/useUltrasonic'
import { ElMessage } from 'element-plus'
import { useDevice } from '@/hooks/useDevice'
import { useObstacleDetect } from '@/composables/ultrasonic/useObstacleDetect'

// 初始化超声波数据处理
const { ultrasonicData, newUltrasonicData, newUltrasonicDataLen, processRawData, clearRawData } = useUltrasonic()
const { detectObstacleBatch, medianFilterBatch } = useObstacleDetect()

const fileInput = ref<HTMLInputElement>()
const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const deviceBusy = ref(useDevice().deviceBusy)

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
      processRawData(content, 0)
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

// 清除数据
function clearPlotData() {
  clearRawData()
  updateChart()
}

// 创建自定义图表配置
function createChartOption() {
  // 始终使用完整数据，通过dataZoom控制显示范围
  const data = ultrasonicData.value
  
  if (data.length === 0) {
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
      xAxis: { type: 'category', name: '时间(s)', data: [] },
      yAxis: { type: 'value', name: '距离(mm)' },
      series: [],
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
  
  const times = data.map(point => point[0].toFixed(2))
  const distances = data.map(point => point[1])
  const filteredDistances = medianFilterBatch(distances, 5)
  const obstacleData = detectObstacleBatch(filteredDistances)
  
  return {
    title: { 
      text: '超声波避障',
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
      },
      backgroundColor: 'rgba(255, 255, 255, 0.7)',
      borderColor: '#eee',
      borderWidth: 1,
      borderRadius: 4,
      shadowBlur: 5,
      shadowColor: 'rgba(0, 0, 0, 0.1)',
      maxWidth: 250,
      showDelay: 50
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
      name: '距离(mm)',
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

// 添加增量更新函数
function appendNewData(newDataPoint: [number, number]) {
  console.log(newDataPoint)
  if (!chart) return;
  
  const time = newDataPoint[0].toFixed(2);
  const distance = newDataPoint[1];
  const filteredDistance = medianFilterBatch([distance], 5)[0]; // 假设只对新数据滤波
  const obstacle = detectObstacleBatch([filteredDistance])[0];
  
  // 增量更新数据
  chart.appendData({
    seriesIndex: 0,
    data: [[time, distance]]
  });
  
  chart.appendData({
    seriesIndex: 1,
    data: [[time, filteredDistance]]
  });
  
  chart.appendData({
    seriesIndex: 2,
    data: [[time, obstacle]]
  });
}

// 修改数据处理逻辑
function handleNewData(data: [number, number][]) {
  // 处理批量新数据
  data.forEach(point => appendNewData(point));
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
watch([newUltrasonicDataLen], () => {
  // TODO: 处理新数据
  // handleNewData(newUltrasonicData.value.slice(0, newUltrasonicDataLen.value).filter((item): item is [number, number] => item.length === 2))
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
