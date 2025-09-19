<template>
  <div class="flow-container">
    <div class="controls">
      <div class="file-controls">
        <!-- 左侧按钮 -->
        <div class="left-buttons">
          <el-button type="default" size="small" @click="importConfigFile" class="layout-btn">
            载入配置
          </el-button>
          <input
            ref="configFileInput"
            type="file"
            accept=".json"
            style="display: none"
            @change="handleConfigFileUpload"
          />
          <el-button type="default" size="small" @click="showViewConfig" class="layout-btn">
            手动配置
          </el-button>
          <el-button type="default" size="small" @click="showMessageFormat" class="message-btn">
            消息格式
          </el-button>
        </div>
        
        <!-- 右侧按钮 -->
        <div class="right-buttons">
          <!-- 移除文件上传按钮 -->
          <el-button type="default" size="small" @click="saveData" class="save-btn" :disabled="!hasData">
            保存
          </el-button>
          <el-button type="default" size="small" @click="clearPlotData" class="clear-btn">
            清除
          </el-button>
        </div>
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
    <div class="dialog-content, message-content">
      <p><strong>数据说明：</strong></p>
      <p>数据主要采用JSON格式，并以换行符分隔。每行一个JSON对象，每个JSON对象可以灵活配置字段。</p>
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
    width="480px"
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
          <el-radio-button label="single">单Y轴</el-radio-button>
          <el-radio-button label="double">双Y轴</el-radio-button>
        </el-radio-group>
      </div>
      
      <!-- 双图模式下的数据源选择 -->
      <div v-if="viewLayout === 'double'" style="margin-bottom: 20px;">
        <!-- 双图单Y轴模式 -->
        <div v-if="yAxisConfig === 'single'" class="chart-config-grid">
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">上图表数据源（最多4个）：</h4>
            <div class="source-selectors">
              <el-select v-model="upperChartSource1" placeholder="选择数据" style="width: 100%; margin-bottom: 8px;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-select v-model="upperChartSource2" placeholder="选择数据" style="width: 100%; margin-bottom: 8px;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-select v-model="upperChartSource3" placeholder="选择数据" style="width: 100%; margin-bottom: 8px;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-select v-model="upperChartSource4" placeholder="选择数据" style="width: 100%;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
            </div>
          </div>
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">下图表数据源（最多4个）：</h4>
            <div class="source-selectors">
              <el-select v-model="lowerChartSource1" placeholder="选择数据" style="width: 100%; margin-bottom: 8px;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-select v-model="lowerChartSource2" placeholder="选择数据" style="width: 100%; margin-bottom: 8px;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-select v-model="lowerChartSource3" placeholder="选择数据" style="width: 100%; margin-bottom: 8px;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-select v-model="lowerChartSource4" placeholder="选择数据" style="width: 100%;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
            </div>
          </div>
        </div>
        
        <!-- 双图双Y轴模式 -->
        <div v-else-if="yAxisConfig === 'double'" class="chart-config-grid">
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">上图左Y轴数据（最多2个）：</h4>
            <div class="source-selectors">
              <el-select v-model="upperChartLeftSource1" placeholder="选择数据" style="width: 100%; margin-bottom: 8px;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-select v-model="upperChartLeftSource2" placeholder="选择数据" style="width: 100%;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
            </div>
          </div>
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">上图右Y轴数据（最多2个）：</h4>
            <div class="source-selectors">
              <el-select v-model="upperChartRightSource1" placeholder="选择数据" style="width: 100%; margin-bottom: 8px;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-select v-model="upperChartRightSource2" placeholder="选择数据" style="width: 100%;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
            </div>
          </div>
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">下图左Y轴数据（最多2个）：</h4>
            <div class="source-selectors">
              <el-select v-model="lowerChartLeftSource1" placeholder="选择数据" style="width: 100%; margin-bottom: 8px;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-select v-model="lowerChartLeftSource2" placeholder="选择数据" style="width: 100%;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
            </div>
          </div>
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">下图右Y轴数据（最多2个）：</h4>
            <div class="source-selectors">
              <el-select v-model="lowerChartRightSource1" placeholder="选择数据" style="width: 100%; margin-bottom: 8px;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-select v-model="lowerChartRightSource2" placeholder="选择数据" style="width: 100%;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 单图模式下的数据源选择 -->
      <div v-if="viewLayout === 'single'" style="margin-bottom: 20px;">
        <!-- 单图单Y轴模式 -->
        <div v-if="yAxisConfig === 'single'" class="chart-config-grid">
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">单图表数据源（最多4个）：</h4>
            <div class="source-selectors">
              <el-select v-model="singleChartSource1" placeholder="选择数据" style="width: 100%; margin-bottom: 8px;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-select v-model="singleChartSource2" placeholder="选择数据" style="width: 100%; margin-bottom: 8px;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-select v-model="singleChartSource3" placeholder="选择数据" style="width: 100%; margin-bottom: 8px;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-select v-model="singleChartSource4" placeholder="选择数据" style="width: 100%;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
            </div>
          </div>
        </div>
        
        <!-- 单图双Y轴模式 -->
        <div v-else-if="yAxisConfig === 'double'" class="chart-config-grid">
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">左Y轴数据（最多2个）：</h4>
            <div class="source-selectors">
              <el-select v-model="singleChartLeftSource1" placeholder="选择数据" style="width: 100%; margin-bottom: 8px;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-select v-model="singleChartLeftSource2" placeholder="选择数据" style="width: 100%;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
            </div>
          </div>
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">右Y轴数据（最多2个）：</h4>
            <div class="source-selectors">
              <el-select v-model="singleChartRightSource1" placeholder="选择数据" style="width: 100%; margin-bottom: 8px;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-select v-model="singleChartRightSource2" placeholder="选择数据" style="width: 100%;">
                <el-option label="" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
            </div>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button type="primary" @click="exportConfigFile">导出</el-button>
      <el-button type="primary" @click="applyViewConfig(createChart)">确定</el-button>
      <el-button type="default" @click="viewConfigDialogVisible = false">取消</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import * as echarts from 'echarts'
import { useFlow } from '@/composables/flow/useFlow'
import { useFlowData } from '@/composables/flow/useFlowData'
import { ElMessage } from 'element-plus'

// 初始化数据流处理
const { flowData, initRawData, clearRawData, saveData } = useFlow()

// 初始化视图配置处理
const { 
  // 状态变量
  viewConfigDialogVisible,
  viewLayout,
  yAxisConfig,
  // 数据源选择相关
  singleChartSource1,
  singleChartSource2,
  singleChartSource3,
  singleChartSource4,
  singleChartLeftSource1,
  singleChartLeftSource2,
  singleChartRightSource1,
  singleChartRightSource2,
  upperChartSource1,
  upperChartSource2,
  upperChartSource3,
  upperChartSource4,
  lowerChartSource1,
  lowerChartSource2,
  lowerChartSource3,
  lowerChartSource4,
  upperChartLeftSource1,
  upperChartLeftSource2,
  upperChartRightSource1,
  upperChartRightSource2,
  lowerChartLeftSource1,
  lowerChartLeftSource2,
  lowerChartRightSource1,
  lowerChartRightSource2,
  // 计算属性
  upperChartSources,
  lowerChartSources,
  upperChartLeftSources,
  upperChartRightSources,
  lowerChartLeftSources,
  lowerChartRightSources,
  singleChartSources,
  singleChartLeftSources,
  singleChartRightSources,
  hasData,
  availableSources,
  // 方法
  showViewConfig,
  onYAxisChange,
  onLayoutChange,
  applyViewConfig
} = useFlowData(flowData)

const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const largeDataOptions = computed(() => {
  if (flowData.value.plotTime && flowData.value.plotTime.length > 500) {
    return {
      showSymbol: false,
      large: true,
      largeThreshold: 5000,
      progressive: 5000,
      progressiveThreshold: 10000,
      animation: false,
    }
  } else {
    return {}
  }
})

// 导入配置文件
function importConfigFile() {
  configFileInput.value?.click()
}

// 处理配置文件上传
function handleConfigFileUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      try {
        // 解析JSON配置
        const config = JSON.parse(content)
        
        // 验证配置格式
        validateAndApplyConfig(config)
        
        ElMessage({
          message: `配置导入成功`,
          type: 'success',
          placement: 'bottom-right',
          offset: 50,
        })
      } catch (error) {
        ElMessage({
          message: `配置文件解析失败，请检查格式是否正确`,
          type: 'error',
          placement: 'bottom-right',
          offset: 50,
        })
      }
    }
    
    reader.readAsText(file)
    
    // 清空input以允许重复选择同一文件
    target.value = ''
  }
}

// 验证并应用配置
function validateAndApplyConfig(config: any) {
  // 验证必要字段
  if (!config.viewLayout && !config.yAxisConfig) {
    throw new Error('配置文件缺少必要的布局配置')
  }
  
  // 应用布局配置
  if (config.viewLayout) {
    if (['single', 'double'].includes(config.viewLayout)) {
      viewLayout.value = config.viewLayout
    } else {
      console.warn('无效的viewLayout值，使用默认值')
    }
  }
  
  // 应用Y轴配置
  if (config.yAxisConfig) {
    if (['single', 'double'].includes(config.yAxisConfig)) {
      yAxisConfig.value = config.yAxisConfig
    } else {
      console.warn('无效的yAxisConfig值，使用默认值')
    }
  }
  
  // 应用数据源配置（如果有）
  applyDataSourceConfig(config)
  
  // 应用配置并更新图表
  applyViewConfig(() => {
    createChart()
  })
}

// 应用数据源配置
function applyDataSourceConfig(config: any) {
  // 单图模式下的数据源配置
  if (config.viewLayout === 'single' && config.sources) {
    if (config.yAxisConfig === 'single') {
      // 单图单Y轴模式
      singleChartSource1.value = config.sources.source1 || ''
      singleChartSource2.value = config.sources.source2 || ''
      singleChartSource3.value = config.sources.source3 || ''
      singleChartSource4.value = config.sources.source4 || ''
    } else if (config.yAxisConfig === 'double') {
      // 单图双Y轴模式
      singleChartLeftSource1.value = config.sources.left1 || ''
      singleChartLeftSource2.value = config.sources.left2 || ''
      singleChartRightSource1.value = config.sources.right1 || ''
      singleChartRightSource2.value = config.sources.right2 || ''
    }
  }
  
  // 双图模式下的数据源配置
  if (config.viewLayout === 'double') {
    // 上图数据源
    if (config.upperSources) {
      if (config.yAxisConfig === 'single') {
        upperChartSource1.value = config.upperSources.source1 || ''
        upperChartSource2.value = config.upperSources.source2 || ''
        upperChartSource3.value = config.upperSources.source3 || ''
        upperChartSource4.value = config.upperSources.source4 || ''
      } else if (config.yAxisConfig === 'double') {
        upperChartLeftSource1.value = config.upperSources.left1 || ''
        upperChartLeftSource2.value = config.upperSources.left2 || ''
        upperChartRightSource1.value = config.upperSources.right1 || ''
        upperChartRightSource2.value = config.upperSources.right2 || ''
      }
    }
    
    // 下图数据源
    if (config.lowerSources) {
      if (config.yAxisConfig === 'single') {
        lowerChartSource1.value = config.lowerSources.source1 || ''
        lowerChartSource2.value = config.lowerSources.source2 || ''
        lowerChartSource3.value = config.lowerSources.source3 || ''
        lowerChartSource4.value = config.lowerSources.source4 || ''
      } else if (config.yAxisConfig === 'double') {
        lowerChartLeftSource1.value = config.lowerSources.left1 || ''
        lowerChartLeftSource2.value = config.lowerSources.left2 || ''
        lowerChartRightSource1.value = config.lowerSources.right1 || ''
        lowerChartRightSource2.value = config.lowerSources.right2 || ''
      }
    }
  }
}

// 同时，为了方便用户，我们可以添加一个导出配置的功能
function exportConfigFile() {
  let config: any = {
    viewLayout: viewLayout.value,
    yAxisConfig: yAxisConfig.value
  }
  
  // 根据当前布局和Y轴配置收集数据源配置
  if (viewLayout.value === 'single') {
    if (yAxisConfig.value === 'single') {
      config.sources = {
        source1: singleChartSource1.value,
        source2: singleChartSource2.value,
        source3: singleChartSource3.value,
        source4: singleChartSource4.value
      }
    } else {
      config.sources = {
        left1: singleChartLeftSource1.value,
        left2: singleChartLeftSource2.value,
        right1: singleChartRightSource1.value,
        right2: singleChartRightSource2.value
      }
    }
  } else {
    config.upperSources = {},
    config.lowerSources = {}
    
    if (yAxisConfig.value === 'single') {
      config.upperSources = {
        source1: upperChartSource1.value,
        source2: upperChartSource2.value,
        source3: upperChartSource3.value,
        source4: upperChartSource4.value
      }
      config.lowerSources = {
        source1: lowerChartSource1.value,
        source2: lowerChartSource2.value,
        source3: lowerChartSource3.value,
        source4: lowerChartSource4.value
      }
    } else {
      config.upperSources = {
        left1: upperChartLeftSource1.value,
        left2: upperChartLeftSource2.value,
        right1: upperChartRightSource1.value,
        right2: upperChartRightSource2.value
      }
      config.lowerSources = {
        left1: lowerChartLeftSource1.value,
        left2: lowerChartLeftSource2.value,
        right1: lowerChartRightSource1.value,
        right2: lowerChartRightSource2.value
      }
    }
  }
  
  // 创建下载链接
  const dataStr = JSON.stringify(config, null, 2)
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr)
  
  const exportFileDefaultName = `flow_chart_config_${new Date().toISOString().slice(0,10)}.json`
  
  const linkElement = document.createElement('a')
  linkElement.setAttribute('href', dataUri)
  linkElement.setAttribute('download', exportFileDefaultName)
  linkElement.click()
}

// 消息格式对话框相关
const messageDialogVisible = ref(false)
const configFileInput = ref<HTMLInputElement>()

// 显示消息格式对话框
function showMessageFormat() {
  messageDialogVisible.value = true
}

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
        ElMessage({
          message: `数据加载成功`,
          type: 'success',
          placement: 'bottom-right',
          offset: 50,
        })
      } catch (error) {
        ElMessage({
          message: `数据加载失败`,
          type: 'error',
          placement: 'bottom-right',
          offset: 50,
        })
        console.error('数据加载失败:', error)
      }
    }
    
    reader.readAsText(file)
    
    // 清空input以允许重复选择同一文件
    target.value = ''
  }
}

// 首先在导入部分添加clearAllCustomStatus
import { useFlowStore } from '@/stores/flow'

// 在script setup中初始化store
const flowStore = useFlowStore()

// 修改clearPlotData函数
function clearPlotData() {
  // 清除所有自定义属性
  flowStore.clearAllCustomStatus()
  // 清除原始数据
  clearRawData()
  // 重新创建图表
  createChart()
  // 显示成功消息
  ElMessage({
    message: `数据已清除`,
    type: 'success',
    placement: 'bottom-right',
    offset: 50,
  })
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
      // 移除双图模式下的标题
      title: { show: false },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (params.length === 0) return ''
          
          // 安全处理时间戳
          let result = `显示时间: `
          if (params[0] && params[0].data && params[0].data[0] !== null) {
            if (typeof params[0].data[0] === 'number') {
              result += `${params[0].data[0].toFixed(2)}s`
            } else {
              result += `${params[0].data[0]}s`
            }
          } else {
            result += `0.00s`
          }
          result += `<br/>`

          const timeMarker = `<div style="line-height:16px;display:inline-block;vertical-align:middle;margin-right:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24"
                fill="none" stroke="grey" stroke-width="2">
              <circle cx="12" cy="12" r="9"/>
              <path d="M12 7v5l3 3"/>
            </svg>
          </div>`
          result += `${timeMarker}time: ${(params[0].data[0]+flowData.value.startTime).toFixed(2)}<br/>`
          
          // 安全处理每个参数值
          params.forEach((param: any) => {
            if (param && param.data && param.data[1] !== null) {
              result += `${param.marker}${param.seriesName}: `
              if (typeof param.data[1] === 'number') {
                result += `${param.data[1].toFixed(2)}`
              } else {
                result += `${param.data[1]}`
              }
              result += `<br/>`
            }
          })
          return result
        }
      },
      grid: {
        left: '3%',
        right: '8%',
        bottom: '15%',
        containLabel: true
      },
      xAxis: { type: 'value', name: '  time' },
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
          flowData.value.plotTime![idx], value
        ])
        
        return {
          name: source, // 不再替换下划线
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 0,
          ...largeDataOptions.value,
        }
      })
    } else {
      // 单图双Y轴模式 - 同样不再替换下划线
      const leftSeries = singleChartLeftSources.value.map(source => {
        const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
          flowData.value.plotTime![idx], value
        ])
        
        return {
          name: source, // 不再替换下划线
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 0,
          ...largeDataOptions.value,
        }
      })
      
      const rightSeries = singleChartRightSources.value.map(source => {
        const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
          flowData.value.plotTime![idx], value
        ])
        
        return {
          name: source, // 不再替换下划线
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 1,
          ...largeDataOptions.value,
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
          
          let result = `显示时间: ${params[0].data[0].toFixed(2)}s<br/>`

          const timeMarker = `<div style="line-height:16px;display:inline-block;vertical-align:middle;margin-right:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24"
                fill="none" stroke="grey" stroke-width="2">
              <circle cx="12" cy="12" r="9"/>
              <path d="M12 7v5l3 3"/>
            </svg>
          </div>`
          result += `${timeMarker}time: ${(params[0].data[0]+flowData.value.startTime).toFixed(2)}<br/>`

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
        right: '8%',
        bottom: '15%', // 从3%增加到15%，为dataZoom留出空间
        containLabel: true
      },
      xAxis: {
        type: 'value',
        name: '  time',
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
    let upperSeries = []
    let lowerSeries = []
    
    if (yAxisConfig.value === 'double') {
      // 双图双Y轴模式 - 使用特定的左右Y轴数据
      // 上图表左侧Y轴数据
      upperSeries = upperChartLeftSources.value.map(source => {
        const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
          flowData.value.plotTime![idx], value
        ])
        
        return {
          name: source,
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 0,
          ...largeDataOptions.value,
        }
      })
      
      // 上图表右侧Y轴数据
      upperSeries.push(...upperChartRightSources.value.map(source => {
        const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
          flowData.value.plotTime![idx], value
        ])
        
        return {
          name: source,
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 1,
          ...largeDataOptions.value,
        }
      }))
      
      // 下图表左侧Y轴数据
      lowerSeries = lowerChartLeftSources.value.map(source => {
        const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
          flowData.value.plotTime![idx], value
        ])
        
        return {
          name: source,
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 2,
          ...largeDataOptions.value,
        }
      })
      
      // 下图表右侧Y轴数据
      lowerSeries.push(...lowerChartRightSources.value.map(source => {
        const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
          flowData.value.plotTime![idx], value
        ])
        
        return {
          name: source,
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 3,
          ...largeDataOptions.value,
        }
      }))
    } else {
      // 双图单Y轴模式
      // 在FlowData.vue文件中找到并修改所有类似以下的代码段
      // 以下是一个示例修改，需要对所有使用map的地方都进行类似处理
      
      // 双图单Y轴模式 - 上图表
      upperSeries = upperChartSources.value.map((source) => {
        // 添加安全检查
        const sourceData = flowData.value[source];
        const seriesData = Array.isArray(sourceData) 
        ? sourceData.map((value: any, idx: number) => [flowData.value.plotTime![idx], value])
        : [];
        
        return {
          name: source,
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 0,
          ...largeDataOptions.value,
        }
      })
      
      // 双图单Y轴模式 - 下图表
      lowerSeries = lowerChartSources.value.map((source) => {
      // 添加安全检查
      const sourceData = flowData.value[source];
      const seriesData = Array.isArray(sourceData) 
      ? sourceData.map((value: any, idx: number) => [flowData.value.plotTime![idx], value])
      : [];
      
      return {
        name: source,
        type: 'line',
        data: seriesData,
        symbolSize: 4,
        smooth: true,
        yAxisIndex: 1,
        ...largeDataOptions.value,
        }
      })
    }
    
    // 修复双图双Y轴模式下的yAxis配置
    const yAxisConfigArray = []
    if (yAxisConfig.value === 'double') {
      // 双图双Y轴模式，每个图表都有左右两个Y轴
      yAxisConfigArray.push(
        { type: 'value', gridIndex: 0 },
        { type: 'value', gridIndex: 0, show: true },
        { type: 'value', gridIndex: 1 },
        { type: 'value', gridIndex: 1, show: true }
      )
    } else {
      // 双图单Y轴模式
      yAxisConfigArray.push(
        { type: 'value', gridIndex: 0 },
        { type: 'value', gridIndex: 1 }
      )
    }
    
    // 合并所有系列数据，用于图例显示
    const allSeries = [...upperSeries, ...lowerSeries]
    
    return {
      title: { left: 'center', textStyle: { fontSize: 14 } },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (params.length === 0) return ''
          
          // 安全处理时间戳
          let result = `显示时间: `
          if (params[0] && params[0].data && params[0].data[0] !== null) {
            if (typeof params[0].data[0] === 'number') {
              result += `${params[0].data[0].toFixed(2)}s`
            } else {
              result += `${params[0].data[0]}s`
            }
          } else {
            result += `0.00s`
          }
          result += `<br/>`

          const timeMarker = `<div style="line-height:16px;display:inline-block;vertical-align:middle;margin-right:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24"
                fill="none" stroke="grey" stroke-width="2">
              <circle cx="12" cy="12" r="9"/>
              <path d="M12 7v5l3 3"/>
            </svg>
          </div>`
          result += `${timeMarker}time: ${(params[0].data[0]+flowData.value.startTime).toFixed(2)}<br/>`
          
          // 安全处理每个参数值
          params.forEach((param: any) => {
            if (param && param.data && param.data[1] !== null) {
              result += `${param.marker}${param.seriesName}: `
              if (typeof param.data[1] === 'number') {
                result += `${param.data[1].toFixed(2)}`
              } else {
                result += `${param.data[1]}`
              }
              result += `<br/>`
            }
          })
          return result
        }
      },
      legend: {
        data: allSeries.map(item => item.name),
        top: 30
      },
      grid: [
        { left: '3%', right: '8%', top: '15%', bottom: '55%', containLabel: true },
        { left: '3%', right: '8%', top: '55%', bottom: '15%', containLabel: true } // 从3%增加到15%
      ],
      xAxis: [
        { type: 'value', name: '  time', gridIndex: 0, axisLabel: { formatter: (value: number) => value.toFixed(2) } },
        { type: 'value', name: '  time', gridIndex: 1, axisLabel: { formatter: (value: number) => value.toFixed(2) } }
      ],
      yAxis: yAxisConfigArray,
      dataZoom: [
        { type: 'slider', show: true, xAxisIndex: [0, 1] },
        { type: 'inside', xAxisIndex: [0, 1] }
      ],
      series: [
        // 上图表系列 - 添加gridIndex和xAxisIndex
        ...upperSeries.map(series => ({
          ...series,
          gridIndex: 0,
          xAxisIndex: 0,
          ...largeDataOptions.value,
        })),
        // 下图表系列 - 添加gridIndex和xAxisIndex
        ...lowerSeries.map(series => ({
          ...series,
          gridIndex: 1,
          xAxisIndex: 1,
          ...largeDataOptions.value,
        }))
      ]
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
  () => flowData.value.plotTime?.length,
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

.chart-container {
  flex: 1;
  min-height: 300px;
  padding: 10px;
}

/* 按钮样式 */
.file-controls {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
}

.left-buttons {
  display: flex;
}

.right-buttons {
  display: flex;
}

.el-button {
  font-size: 12px;
}

/* 移除原来的margin-left样式 */
.layout-btn {
  margin-left: 0;
}

/* 其他样式保持不变 */
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
.message-content {
  text-align: left; /* 添加这一行，使所有内容左对齐 */
}

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

/* 图表配置区域样式 */
.chart-config-section {
  margin-bottom: 15px;
  padding: 10px;
  background-color: #f9f9f9;
  border-radius: 4px;
}

.source-selectors {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 新增加的网格布局样式 */
.chart-config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
  margin-bottom: 15px;
}

/* 针对不同屏幕尺寸的响应式调整 */
@media (max-width: 768px) {
  .chart-config-grid {
    grid-template-columns: 1fr;
  }
}
</style>
