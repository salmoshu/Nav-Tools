import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'

// 定义视图布局类型
export type ViewLayout = 'single' | 'double'
// 定义Y轴配置类型
export type YAxisConfig = 'single' | 'double'

// 创建并导出useDataConfig钩子
export function useDataConfig(flowData: any) {
  // 视图配置相关
  const viewConfigDialogVisible = ref(false)
  const viewLayout = ref<ViewLayout>('single')
  const yAxisConfig = ref<YAxisConfig>('single')

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

  // 双图双Y轴模式下的数据源选择
  const upperChartLeftSource1 = ref<string>('')
  const upperChartLeftSource2 = ref<string>('')
  const upperChartRightSource1 = ref<string>('')
  const upperChartRightSource2 = ref<string>('')
  const lowerChartLeftSource1 = ref<string>('')
  const lowerChartLeftSource2 = ref<string>('')
  const lowerChartRightSource1 = ref<string>('')
  const lowerChartRightSource2 = ref<string>('')

  // 计算属性 - 上图表数据源（双图模式）
  const upperChartSources = computed(() => {
    return [
      upperChartSource1.value,
      upperChartSource2.value,
      upperChartSource3.value,
      upperChartSource4.value
    ].filter(source => source !== '')
  })

  // 计算属性 - 下图表数据源（双图模式）
  const lowerChartSources = computed(() => {
    return [
      lowerChartSource1.value,
      lowerChartSource2.value,
      lowerChartSource3.value,
      lowerChartSource4.value
    ].filter(source => source !== '')
  })

  // 计算属性 - 上图表左Y轴数据（双图双Y轴模式）
  const upperChartLeftSources = computed(() => {
    return [
      upperChartLeftSource1.value,
      upperChartLeftSource2.value
    ].filter(source => source !== '')
  })

  // 计算属性 - 上图表右Y轴数据（双图双Y轴模式）
  const upperChartRightSources = computed(() => {
    return [
      upperChartRightSource1.value,
      upperChartRightSource2.value
    ].filter(source => source !== '')
  })

  // 计算属性 - 下图表左Y轴数据（双图双Y轴模式）
  const lowerChartLeftSources = computed(() => {
    return [
      lowerChartLeftSource1.value,
      lowerChartLeftSource2.value
    ].filter(source => source !== '')
  })

  // 计算属性 - 下图表右Y轴数据（双图双Y轴模式）
  const lowerChartRightSources = computed(() => {
    return [
      lowerChartRightSource1.value,
      lowerChartRightSource2.value
    ].filter(source => source !== '')
  })

  // 计算属性 - 单图模式数据源
  const singleChartSources = computed(() => {
    return [
      singleChartSource1.value,
      singleChartSource2.value,
      singleChartSource3.value,
      singleChartSource4.value
    ].filter(source => source !== '')
  })

  // 计算属性 - 单图模式左Y轴数据
  const singleChartLeftSources = computed(() => {
    return [
      singleChartLeftSource1.value,
      singleChartLeftSource2.value
    ].filter(source => source !== '')
  })

  // 计算属性 - 单图模式右Y轴数据
  const singleChartRightSources = computed(() => {
    return [
      singleChartRightSource1.value,
      singleChartRightSource2.value
    ].filter(source => source !== '')
  })

  // 计算属性 - 检查是否有数据
  const hasData = computed(() => {
    return flowData.value.timestamps && flowData.value.timestamps.length > 0
  })

  // 计算属性 - 获取所有可用的数据源字段（排除元数据字段）
  // 修改 availableSources 计算属性，确保它能正确反映 flowData 的变化
  const availableSources = computed(() => {
  // 确保 flowData.value 存在
  if (!flowData.value) {
    return []
  }
  
  return Object.keys(flowData.value).filter(key => 
    key !== 'timestamps' && 
    key !== 'timestamp' && 
    key !== 'isBatchData' && 
    key !== 'rawString' && 
    key !== 'rawDataKeys' && 
    Array.isArray(flowData.value[key])
  )
})

  // 函数 - 显示视图配置对话框
  function showViewConfig() {
    viewConfigDialogVisible.value = true
  }

  // 函数 - Y轴配置变化处理
  function onYAxisChange() {
    // Y轴配置变更时只清空相关配置的选择
    if (yAxisConfig.value === 'single') {
      // 切换到单Y轴模式，清空双Y轴模式的选择
      singleChartLeftSource1.value = ''
      singleChartLeftSource2.value = ''
      singleChartRightSource1.value = ''
      singleChartRightSource2.value = ''
      upperChartLeftSource1.value = ''
      upperChartLeftSource2.value = ''
      upperChartRightSource1.value = ''
      upperChartRightSource2.value = ''
      lowerChartLeftSource1.value = ''
      lowerChartLeftSource2.value = ''
      lowerChartRightSource1.value = ''
      lowerChartRightSource2.value = ''
    } else {
      // 切换到双Y轴模式，清空单Y轴模式的选择
      singleChartSource1.value = ''
      singleChartSource2.value = ''
      singleChartSource3.value = ''
      singleChartSource4.value = ''
      upperChartSource1.value = ''
      upperChartSource2.value = ''
      upperChartSource3.value = ''
      upperChartSource4.value = ''
      lowerChartSource1.value = ''
      lowerChartSource2.value = ''
      lowerChartSource3.value = ''
      lowerChartSource4.value = ''
    }
  }

  // 函数 - 布局变化处理
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

  // 函数 - 应用视图配置
  function applyViewConfig(createChart: () => void) {
    // 在更新图表前先销毁并重新创建图表，确保清除所有残留数据
    createChart()
    viewConfigDialogVisible.value = false
    ElMessage.success('视图配置已应用')
  }

  // 返回所有需要暴露的状态和方法
  return {
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
  }
}