<template>
  <div class="flow-container">
    <div class="controls">
      <div class="file-controls">
        <input type="file" ref="fileInput" @change="handleFileUpload" accept=".txt,.csv" style="display: none">
        <el-button type="primary" size="small" @click="fileInput?.click()" class="upload-btn">
          载入数据
        </el-button>
        <el-button type="primary" size="small" @click="saveData" class="save-btn" :disabled="!hasData">
          保存数据
        </el-button>
        <el-button type="default" size="small" @click="clearPlotData" class="clear-btn">
          清除数据
        </el-button>
        <el-button type="default" size="small" @click="showMessageFormat" class="message-btn">
          消息格式
        </el-button>
        <el-button type="primary" size="small" @click="showViewConfig" class="layout-btn">
          视图配置
        </el-button>
      </div>
    </div>
    
    <!-- 图表容器 -->
    <div ref="chartRef" class="chart-container"></div>
  </div>

  <!-- 消息格式对话框 -->
  <el-dialog
    v-model="messageDialogVisible"
    width="600px"
  >
    <div class="dialog-content">
      <p><strong>数据说明：</strong></p>
      <p>数据主要采用JSON格式，并以换行符分隔。每行一个JSON对象，每个JSON对象包含以下字段：</p>
      <ul style="list-style-type: disc; padding-left: 20px;">
        <li style="display: flex; align-items: center; margin-bottom: 5px;"><code style="min-width: 120px; display: inline-block;">time</code>: 时间戳 (s)</li>
        <li style="display: flex; align-items: center; margin-bottom: 5px;"><code style="min-width: 120px; display: inline-block;">camera_distance</code>: 相机距离 (m)</li>
        <li style="display: flex; align-items: center; margin-bottom: 5px;"><code style="min-width: 120px; display: inline-block;">camera_angle</code>: 相机角度 (°)</li>
        <li style="display: flex; align-items: center; margin-bottom: 5px;"><code style="min-width: 120px; display: inline-block;">pid_left_speed</code>: PID左轮速度 (m/s)</li>
        <li style="display: flex; align-items: center; margin-bottom: 5px;"><code style="min-width: 120px; display: inline-block;">pid_right_speed</code>: PID右轮速度 (m/s)</li>
        <li style="display: flex; align-items: center; margin-bottom: 5px;"><code style="min-width: 120px; display: inline-block;">motor_left_speed</code>: 电机左轮速度 (m/s)</li>
        <li style="display: flex; align-items: center; margin-bottom: 5px;"><code style="min-width: 120px; display: inline-block;">motor_right_speed</code>: 电机右轮速度 (m/s)</li>
      </ul>
      <el-divider></el-divider>
      <p><strong>示例数据：</strong></p>
      <pre class="example-code">
{"time": 0.00, "camera_distance": 1.20, "camera_angle": 0.5, "pid_left_speed": 0.30, "pid_right_speed": 0.30, "motor_left_speed": 0.28, "motor_right_speed": 0.28}
{"time": 0.05, "camera_distance": 1.18, "camera_angle": 0.4, "pid_left_speed": 0.30, "pid_right_speed": 0.30, "motor_left_speed": 0.29, "motor_right_speed": 0.29}
{"time": 0.10, "camera_distance": 1.15, "camera_angle": 0.3, "pid_left_speed": 0.31, "pid_right_speed": 0.30, "motor_left_speed": 0.30, "motor_right_speed": 0.29}
      </pre>
      <el-divider></el-divider>
      <p><strong>注意事项：</strong></p>
      <ul style="list-style-type: disc; padding-left: 20px;">
        <li>数值型空数据请使用null</li>
        <li>时间戳非必须选项，若不包含则默认从0开始递增</li>
      </ul>
    </div>
    <template #footer>
      <el-button @click="messageDialogVisible = false">关闭</el-button>
    </template>
  </el-dialog>

  <!-- 视图配置对话框 -->
  <el-dialog
    v-model="viewConfigDialogVisible"
    width="450px"
    destroy-on-close
  >
    <div class="dialog-content">
      <div style="margin-bottom: 20px;">
        <span style="display: inline-block; width: 100px;">布局方式：</span>
        <el-radio-group v-model="viewLayout" @change="onLayoutChange">
          <el-radio-button label="single">单图</el-radio-button>
          <el-radio-button label="double">双图</el-radio-button>
        </el-radio-group>
      </div>
      
      <div style="margin-bottom: 20px;">
        <span style="display: inline-block; width: 100px;">Y轴配置：</span>
        <el-radio-group v-model="yAxisConfig" @change="onYAxisChange">
          <el-radio-button class="config-btn" label="single">单Y轴</el-radio-button>
          <el-radio-button class="config-btn" label="double">双Y轴</el-radio-button>
        </el-radio-group>
      </div>
      
      <!-- 单图模式下的数据源选择 -->
      <div v-if="viewLayout === 'single'" style="margin-bottom: 20px;">
        <div v-if="yAxisConfig === 'single'" style="margin-bottom: 15px;">
          <h4 style="margin-bottom: 10px;">数据源选择（最多4个）：</h4>
          <div class="source-selectors">
            <el-select v-model="singleChartSource1" placeholder="选择数据源" style="width: 100%; margin-bottom: 8px;">
              <el-option label="" value=""></el-option>
              <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
            </el-select>
            <el-select v-model="singleChartSource2" placeholder="选择数据源" style="width: 100%; margin-bottom: 8px;">
              <el-option label="" value=""></el-option>
              <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
            </el-select>
            <el-select v-model="singleChartSource3" placeholder="选择数据源" style="width: 100%; margin-bottom: 8px;">
              <el-option label="" value=""></el-option>
              <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
            </el-select>
            <el-select v-model="singleChartSource4" placeholder="选择数据源" style="width: 100%;">
              <el-option label="" value=""></el-option>
              <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
            </el-select>
          </div>
        </div>
        
        <div v-if="yAxisConfig === 'double'" style="margin-bottom: 15px;">
          <h4 style="margin-bottom: 10px;">左侧Y轴数据源（最多2个）：</h4>
          <div class="source-selectors">
            <el-select v-model="singleChartLeftSource1" placeholder="选择数据源" style="width: 100%; margin-bottom: 8px;">
              <el-option label="" value=""></el-option>
              <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
            </el-select>
            <el-select v-model="singleChartLeftSource2" placeholder="选择数据源" style="width: 100%;">
              <el-option label="" value=""></el-option>
              <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
            </el-select>
          </div>
          
          <h4 style="margin-bottom: 10px; margin-top: 15px;">右侧Y轴数据源（最多2个）：</h4>
          <div class="source-selectors">
            <el-select v-model="singleChartRightSource1" placeholder="选择数据源" style="width: 100%; margin-bottom: 8px;">
              <el-option label="" value=""></el-option>
              <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
            </el-select>
            <el-select v-model="singleChartRightSource2" placeholder="选择数据源" style="width: 100%;">
              <el-option label="" value=""></el-option>
              <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
            </el-select>
          </div>
        </div>
      </div>
      
      <!-- 双图模式下的数据源选择 -->
      <div v-if="viewLayout === 'double'" style="margin-bottom: 20px;">
        <div style="margin-bottom: 15px;">
          <h4 style="margin-bottom: 10px;">上图表数据源（最多4个）：</h4>
          <div class="source-selectors">
            <el-select v-model="upperChartSource1" placeholder="选择数据源" style="width: 100%; margin-bottom: 8px;">
              <el-option label="" value=""></el-option>
              <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
            </el-select>
            <el-select v-model="upperChartSource2" placeholder="选择数据源" style="width: 100%; margin-bottom: 8px;">
              <el-option label="" value=""></el-option>
              <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
            </el-select>
            <el-select v-model="upperChartSource3" placeholder="选择数据源" style="width: 100%; margin-bottom: 8px;">
              <el-option label="" value=""></el-option>
              <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
            </el-select>
            <el-select v-model="upperChartSource4" placeholder="选择数据源" style="width: 100%;">
              <el-option label="" value=""></el-option>
              <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
            </el-select>
          </div>
        </div>
        <div>
          <h4 style="margin-bottom: 10px;">下图表数据源（最多4个）：</h4>
          <div class="source-selectors">
            <el-select v-model="lowerChartSource1" placeholder="选择数据源" style="width: 100%; margin-bottom: 8px;">
              <el-option label="" value=""></el-option>
              <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
            </el-select>
            <el-select v-model="lowerChartSource2" placeholder="选择数据源" style="width: 100%; margin-bottom: 8px;">
              <el-option label="" value=""></el-option>
              <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
            </el-select>
            <el-select v-model="lowerChartSource3" placeholder="选择数据源" style="width: 100%; margin-bottom: 8px;">
              <el-option label="" value=""></el-option>
              <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
            </el-select>
            <el-select v-model="lowerChartSource4" placeholder="选择数据源" style="width: 100%;">
              <el-option label="" value=""></el-option>
              <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
            </el-select>
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

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import * as echarts from 'echarts'
import { useFlow } from '@/composables/flow/useFlow'
import { ElMessage } from 'element-plus'

// 初始化数据流处理
const { flowData, initRawData, clearRawData, saveData } = useFlow()

const fileInput = ref<HTMLInputElement>()
const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

// 消息格式对话框相关
const messageDialogVisible = ref(false)

// 显示消息格式对话框
function showMessageFormat() {
  messageDialogVisible.value = true
}

// 视图配置相关
const viewConfigDialogVisible = ref(false)
const viewLayout = ref<'single' | 'double'>('single')
const yAxisConfig = ref<'single' | 'double'>('single')

// 单图模式下的数据源选择
const singleChartSource1 = ref<string>('')
const singleChartSource2 = ref<string>('')
const singleChartSource3 = ref<string>('')
const singleChartSource4 = ref<string>('')

// 单图双Y轴模式下的数据源选择
const singleChartLeftSource1 = ref<string>('')
const singleChartLeftSource2 = ref<string>('')
const singleChartRightSource1 = ref<string>('')
const singleChartRightSource2 = ref<string>('')

// 双图模式下的数据源选择
const upperChartSource1 = ref<string>('')
const upperChartSource2 = ref<string>('')
const upperChartSource3 = ref<string>('')
const upperChartSource4 = ref<string>('')
const lowerChartSource1 = ref<string>('')
const lowerChartSource2 = ref<string>('')
const lowerChartSource3 = ref<string>('')
const lowerChartSource4 = ref<string>('')

// 添加以下计算属性
// 上图表数据源（双图模式）
const upperChartSources = computed(() => {
  return [
    upperChartSource1.value,
    upperChartSource2.value,
    upperChartSource3.value,
    upperChartSource4.value
  ].filter(source => source !== '')
})

// 下图表数据源（双图模式）
const lowerChartSources = computed(() => {
  return [
    lowerChartSource1.value,
    lowerChartSource2.value,
    lowerChartSource3.value,
    lowerChartSource4.value
  ].filter(source => source !== '')
})

// 单图表数据源（单Y轴模式）
const singleChartSources = computed(() => {
  return [
    singleChartSource1.value,
    singleChartSource2.value,
    singleChartSource3.value,
    singleChartSource4.value
  ].filter(source => source !== '')
})

// 单图表左Y轴数据源（双Y轴模式）
const singleChartLeftSources = computed(() => {
  return [
    singleChartLeftSource1.value,
    singleChartLeftSource2.value
  ].filter(source => source !== '')
})

// 单图表右Y轴数据源（双Y轴模式）
const singleChartRightSources = computed(() => {
  return [
    singleChartRightSource1.value,
    singleChartRightSource2.value
  ].filter(source => source !== '')
})

// 显示视图配置对话框
function showViewConfig() {
  // 移除清空操作，保留用户之前的选择
  viewConfigDialogVisible.value = true
}

// 布局变化处理
function onLayoutChange() {
  // 布局变更时只清空相关模式的选择，保留其他模式的选择
  if (viewLayout.value === 'single') {
    // 切换到单图模式，清空双图模式的选择
    upperChartSource1.value = ''
    upperChartSource2.value = ''
    upperChartSource3.value = ''
    upperChartSource4.value = ''
    lowerChartSource1.value = ''
    lowerChartSource2.value = ''
    lowerChartSource3.value = ''
    lowerChartSource4.value = ''
  } else {
    // 切换到双图模式，清空单图模式的选择
    singleChartSource1.value = ''
    singleChartSource2.value = ''
    singleChartSource3.value = ''
    singleChartSource4.value = ''
    singleChartLeftSource1.value = ''
    singleChartLeftSource2.value = ''
    singleChartRightSource1.value = ''
    singleChartRightSource2.value = ''
  }
}

// Y轴配置变化处理
function onYAxisChange() {
  // Y轴配置变更时只清空相关配置的选择
  if (yAxisConfig.value === 'single') {
    // 切换到单Y轴模式，清空双Y轴模式的选择
    singleChartLeftSource1.value = ''
    singleChartLeftSource2.value = ''
    singleChartRightSource1.value = ''
    singleChartRightSource2.value = ''
  } else {
    // 切换到双Y轴模式，清空单Y轴模式的选择
    singleChartSource1.value = ''
    singleChartSource2.value = ''
    singleChartSource3.value = ''
    singleChartSource4.value = ''
  }
}

// 应用视图配置
function applyViewConfig() {
  updateChart()
  viewConfigDialogVisible.value = false
  ElMessage.success('视图配置已应用')
}

// 检查是否有数据
const hasData = computed(() => {
  return flowData.value.timestamps && flowData.value.timestamps.length > 0
})

// 获取所有可用的数据源字段（排除元数据字段）
const availableSources = computed(() => {
  return Object.keys(flowData.value).filter(key => 
    key !== 'timestamps' && 
    key !== 'timestamp' && 
    key !== 'isBatchData' && 
    key !== 'rawString' && 
    Array.isArray(flowData.value[key])
  )
})

// 处理文件上传
const handleFileUpload = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      try {
        initRawData(content)
        updateChart()
        ElMessage.success('数据加载成功')
      } catch (error) {
        ElMessage.error('数据加载失败')
        console.error('数据加载失败:', error)
      }
    }
    reader.readAsText(file)
    
    // 清空input以允许重复选择同一文件
    target.value = ''
  }
}

// 清除数据
function clearPlotData() {
  clearRawData()
  updateChart()
  ElMessage.success('数据已清除')
}

// 创建图表
function createChart() {
  if (!chartRef.value) return
  
  // 销毁已有图表
  if (chart) {
    chart.dispose()
  }
  
  chart = echarts.init(chartRef.value)
  updateChart()
}

// 更新图表
function updateChart() {
  if (!chart || !hasData.value) {
    // 如果没有数据，显示空图表
    chart?.setOption({
      title: {
        left: 'center',
        textStyle: { fontSize: 14 }
      },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'value', name: '时间(s)' },
      yAxis: { type: 'value' },
      series: []
    })
    return
  }
  
  // 根据视图配置准备图表选项
  const option = createChartOption()
  chart.setOption(option)
}

// 创建图表选项
function createChartOption() {
  if (viewLayout.value === 'single') {
    // 单图模式
    let series = []
    
    if (yAxisConfig.value === 'single') {
      // 单图单Y轴模式
      series = singleChartSources.value.map((source) => {
        const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
          flowData.value.timestamps![idx], value
        ])
        
        return {
          name: source, // 不再替换下划线
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 0
        }
      })
    } else {
      // 单图双Y轴模式 - 同样不再替换下划线
      const leftSeries = singleChartLeftSources.value.map(source => {
        const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
          flowData.value.timestamps![idx], value
        ])
        
        return {
          name: source, // 不再替换下划线
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 0
        }
      })
      
      const rightSeries = singleChartRightSources.value.map(source => {
        const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
          flowData.value.timestamps![idx], value
        ])
        
        return {
          name: source, // 不再替换下划线
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 1
        }
      })
      
      series = [...leftSeries, ...rightSeries]
    }
    
    return {
      title: {
        left: 'center',
        textStyle: { fontSize: 14 }
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (params.length === 0) return ''
          
          let result = `时间: ${params[0].data[0].toFixed(2)}s<br/>`
          params.forEach((param: any) => {
            if (param.data[1] !== null) {
              result += `${param.marker}${param.seriesName}: ${param.data[1].toFixed(2)}<br/>`
            }
          })
          return result
        }
      },
      legend: {
        data: series.map(item => item.name), // 直接使用原始名称
        top: 30
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        name: '时间(s)',
        axisLabel: {
          formatter: function(value: number) {
            return value.toFixed(2)
          }
        }
      },
      yAxis: yAxisConfig.value === 'double' ? [
        { type: 'value' },
        { type: 'value', show: true }
      ] : { type: 'value' },
      dataZoom: [
        { type: 'slider', show: true, xAxisIndex: 0 },
        { type: 'inside', xAxisIndex: 0 }
      ],
      series
    }
  } else {
    // 双图模式
    // 处理上图表数据
    const upperSeries = upperChartSources.value.map((source, index) => {
      const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
        flowData.value.timestamps![idx], value
      ])
      
      return {
        name: source, // 不再替换下划线
        type: 'line',
        data: seriesData,
        symbolSize: 4,
        smooth: true,
        yAxisIndex: yAxisConfig.value === 'double' && upperChartSources.value.indexOf(source) % 2 === 1 ? 1 : 0
      }
    })
    
    // 处理下图表数据
    const lowerSeries = lowerChartSources.value.map((source, index) => {
      const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
        flowData.value.timestamps![idx], value
      ])
      
      return {
        name: source, // 不再替换下划线
        type: 'line',
        data: seriesData,
        symbolSize: 4,
        smooth: true,
        yAxisIndex: yAxisConfig.value === 'double' && lowerChartSources.value.indexOf(source) % 2 === 1 ? 1 : 0
      }
    })
    
    return {
      title: { text: '数据流可视化', left: 'center', textStyle: { fontSize: 14 } },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (params.length === 0) return ''
          
          let result = `时间: ${params[0].data[0].toFixed(2)}s<br/>`
          params.forEach((param: any) => {
            if (param.data[1] !== null) {
              result += `${param.marker}${param.seriesName}: ${param.data[1].toFixed(2)}<br/>`
            }
          })
          return result
        }
      },
      legend: {
        data: [...new Set([...upperChartSources.value, ...lowerChartSources.value])], // 直接使用原始名称
        top: 30
      },
      grid: [
        { left: '3%', right: '4%', top: '15%', bottom: '55%', containLabel: true },
        { left: '3%', right: '4%', top: '55%', bottom: '3%', containLabel: true }
      ],
      xAxis: [
        { type: 'value', name: '时间(s)', gridIndex: 0, axisLabel: { formatter: (value: number) => value.toFixed(2) } },
        { type: 'value', name: '时间(s)', gridIndex: 1, axisLabel: { formatter: (value: number) => value.toFixed(2) } }
      ],
      yAxis: [
        { type: 'value', gridIndex: 0 },
        { type: 'value', gridIndex: 1 }
      ],
      dataZoom: [
        { type: 'slider', show: true, xAxisIndex: [0, 1] },
        { type: 'inside', xAxisIndex: [0, 1] }
      ],
      series: [...upperChartSources.value.map((source, index) => {
        const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
          flowData.value.timestamps![idx], value
        ])
        
        return {
          name: source,
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          xAxisIndex: 0,
          yAxisIndex: 0
        }
      }), ...lowerChartSources.value.map((source, index) => {
        const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
          flowData.value.timestamps![idx], value
        ])
        
        return {
          name: source,
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          xAxisIndex: 1,
          yAxisIndex: 1
        }
      })]
    }
  }
}

// 监听窗口大小变化
function handleResize() {
  chart?.resize()
}

// 组件挂载时初始化图表
onMounted(() => {
  createChart()
  window.addEventListener('resize', handleResize)
  
  // 设置ResizeObserver监听图表容器大小变化
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(chartRef.value)
  }
})

// 组件卸载时清理
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (resizeObserver && chartRef.value) {
    resizeObserver.unobserve(chartRef.value)
  }
  chart?.dispose()
})

// 监听flowData变化，更新图表
watch(
  () => flowData.value.timestamps?.length,
  () => {
    updateChart()
  }
)
</script>

<style scoped>
.flow-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 10px;
}

.controls {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.chart-container {
  flex: 1;
  min-height: 400px;
}

/* 按钮样式 */
.file-controls {
  display: flex;
  gap: 8px;
}

.el-button {
  font-size: 12px;
}

/* 示例代码样式 */
.example-code {
  background-color: #f5f5f5;
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.5;
}

/* 对话框内容样式 */
.dialog-content > div {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dialog-content span {
  min-width: 100px;
}

/* 视图配置按钮样式 */
.layout-btn {
  margin-left: 8px;
}

/* 配置按钮样式 */
.config-btn {
  margin-right: 8px;
}

/* 数据源选择器样式 */
.source-selectors {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
