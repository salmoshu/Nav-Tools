import { ref, computed } from 'vue'

// 定义视图布局类型
export type ViewLayout = 'single' | 'double'
// 定义Y轴配置类型
export type YAxisConfig = 'single' | 'double'

// 创建并导出useFlowData钩子
export function useDataConfig(flowData: any) {
  // 视图配置相关
  const viewConfigDialogVisible = ref(false)
  const viewLayout = ref<ViewLayout>('single')
  const yAxisConfig = ref<YAxisConfig>('single')

  /**
   * * 单图单Y轴模式
   */
  // * 单图模式下的数据源选择
  const singleChartSource1 = ref<string>('')
  const singleChartSource2 = ref<string>('')
  const singleChartSource3 = ref<string>('')
  const singleChartSource4 = ref<string>('')
  // ** 添加颜色配置
  const singleChartColor1 = ref<string>('')
  const singleChartColor2 = ref<string>('')
  const singleChartColor3 = ref<string>('')
  const singleChartColor4 = ref<string>('')
  // ** 添加areaStyle控制配置
  const singleChartUseArea1 = ref<boolean>(false)
  const singleChartUseArea2 = ref<boolean>(false)
  const singleChartUseArea3 = ref<boolean>(false)
  const singleChartUseArea4 = ref<boolean>(false)

  /**
   * * 单图双Y轴模式
   */
  // 单图双Y轴模式下的数据源选择
  const singleChartLeftSource1 = ref<string>('')
  const singleChartLeftSource2 = ref<string>('')
  const singleChartLeftSource3 = ref<string>('')
  const singleChartLeftSource4 = ref<string>('')
  const singleChartRightSource1 = ref<string>('')
  const singleChartRightSource2 = ref<string>('')
  const singleChartRightSource3 = ref<string>('')
  const singleChartRightSource4 = ref<string>('')
  // ** 添加颜色配置
  const singleChartLeftColor1 = ref<string>('')
  const singleChartLeftColor2 = ref<string>('')
  const singleChartLeftColor3 = ref<string>('')
  const singleChartLeftColor4 = ref<string>('')
  const singleChartRightColor1 = ref<string>('')
  const singleChartRightColor2 = ref<string>('')
  const singleChartRightColor3 = ref<string>('')
  const singleChartRightColor4 = ref<string>('')
  // ** 添加areaStyle控制配置
  const singleChartLeftUseArea1 = ref<boolean>(false)
  const singleChartLeftUseArea2 = ref<boolean>(false)
  const singleChartLeftUseArea3 = ref<boolean>(false)
  const singleChartLeftUseArea4 = ref<boolean>(false)
  const singleChartRightUseArea1 = ref<boolean>(false)
  const singleChartRightUseArea2 = ref<boolean>(false)
  const singleChartRightUseArea3 = ref<boolean>(false)
  const singleChartRightUseArea4 = ref<boolean>(false)

  /**
   * 双图单Y轴
   */
  // ** 双图模式下的数据源选择
  const upperChartSource1 = ref<string>('')
  const upperChartSource2 = ref<string>('')
  const upperChartSource3 = ref<string>('')
  const upperChartSource4 = ref<string>('')
  const lowerChartSource1 = ref<string>('')
  const lowerChartSource2 = ref<string>('')
  const lowerChartSource3 = ref<string>('')
  const lowerChartSource4 = ref<string>('')
  // ** 添加颜色配置
  const upperChartColor1 = ref<string>('')
  const upperChartColor2 = ref<string>('')
  const upperChartColor3 = ref<string>('')
  const upperChartColor4 = ref<string>('')
  const lowerChartColor1 = ref<string>('')
  const lowerChartColor2 = ref<string>('')
  const lowerChartColor3 = ref<string>('')
  const lowerChartColor4 = ref<string>('')
  // ** 添加areaStyle控制配置
  const upperChartUseArea1 = ref<boolean>(false)
  const upperChartUseArea2 = ref<boolean>(false)
  const upperChartUseArea3 = ref<boolean>(false)
  const upperChartUseArea4 = ref<boolean>(false)
  const lowerChartUseArea1 = ref<boolean>(false)
  const lowerChartUseArea2 = ref<boolean>(false)
  const lowerChartUseArea3 = ref<boolean>(false)
  const lowerChartUseArea4 = ref<boolean>(false)

  /**
   * * 双图双Y轴模式
   */
  // ** 双图双Y轴模式下的数据源选择
  const upperChartLeftSource1 = ref<string>('')
  const upperChartLeftSource2 = ref<string>('')
  const upperChartLeftSource3 = ref<string>('')
  const upperChartLeftSource4 = ref<string>('')
  const upperChartRightSource1 = ref<string>('')
  const upperChartRightSource2 = ref<string>('')
  const upperChartRightSource3 = ref<string>('')
  const upperChartRightSource4 = ref<string>('')
  const lowerChartLeftSource1 = ref<string>('')
  const lowerChartLeftSource2 = ref<string>('')
  const lowerChartLeftSource3 = ref<string>('')
  const lowerChartLeftSource4 = ref<string>('')
  const lowerChartRightSource1 = ref<string>('')
  const lowerChartRightSource2 = ref<string>('')
  const lowerChartRightSource3 = ref<string>('')
  const lowerChartRightSource4 = ref<string>('')
  // ** 添加颜色配置
  const upperChartLeftColor1 = ref<string>('')
  const upperChartLeftColor2 = ref<string>('')
  const upperChartLeftColor3 = ref<string>('')
  const upperChartLeftColor4 = ref<string>('')
  const upperChartRightColor1 = ref<string>('')
  const upperChartRightColor2 = ref<string>('')
  const upperChartRightColor3 = ref<string>('')
  const upperChartRightColor4 = ref<string>('')
  const lowerChartLeftColor1 = ref<string>('')
  const lowerChartLeftColor2 = ref<string>('')
  const lowerChartLeftColor3 = ref<string>('')
  const lowerChartLeftColor4 = ref<string>('')
  const lowerChartRightColor1 = ref<string>('')
  const lowerChartRightColor2 = ref<string>('')
  const lowerChartRightColor3 = ref<string>('')
  const lowerChartRightColor4 = ref<string>('')
  // ** 添加areaStyle控制配置
  const upperChartLeftUseArea1 = ref<boolean>(false)
  const upperChartLeftUseArea2 = ref<boolean>(false)
  const upperChartLeftUseArea3 = ref<boolean>(false)
  const upperChartLeftUseArea4 = ref<boolean>(false)
  const upperChartRightUseArea1 = ref<boolean>(false)
  const upperChartRightUseArea2 = ref<boolean>(false)
  const upperChartRightUseArea3 = ref<boolean>(false)
  const upperChartRightUseArea4 = ref<boolean>(false)
  const lowerChartLeftUseArea1 = ref<boolean>(false)
  const lowerChartLeftUseArea2 = ref<boolean>(false)
  const lowerChartLeftUseArea3 = ref<boolean>(false)
  const lowerChartLeftUseArea4 = ref<boolean>(false)
  const lowerChartRightUseArea1 = ref<boolean>(false)
  const lowerChartRightUseArea2 = ref<boolean>(false)
  const lowerChartRightUseArea3 = ref<boolean>(false)
  const lowerChartRightUseArea4 = ref<boolean>(false)

  // 计算属性 - 上图表数据源（双图模式）
  const upperChartSources = computed(() => {
    return [
      upperChartSource1.value,
      upperChartSource2.value,
      upperChartSource3.value,
      upperChartSource4.value
    ].filter(source => source !== '')
  })

  // 计算属性 - 上图表颜色配置（双图模式）
  const upperChartColors = computed(() => {
    return [
      upperChartColor1.value,
      upperChartColor2.value,
      upperChartColor3.value,
      upperChartColor4.value
    ]
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

  // 计算属性 - 下图表颜色配置（双图模式）
  const lowerChartColors = computed(() => {
    return [
      lowerChartColor1.value,
      lowerChartColor2.value,
      lowerChartColor3.value,
      lowerChartColor4.value
    ]
  })

  // 计算属性 - 上图表左Y轴数据（双图双Y轴模式）
  const upperChartLeftSources = computed(() => {
    return [
      upperChartLeftSource1.value,
      upperChartLeftSource2.value,
      upperChartLeftSource3.value,
      upperChartLeftSource4.value
    ].filter(source => source !== '')
  })

  // 计算属性 - 上图表左Y轴颜色配置（双图双Y轴模式）
  const upperChartLeftColors = computed(() => {
    return [
      upperChartLeftColor1.value,
      upperChartLeftColor2.value,
      upperChartLeftColor3.value,
      upperChartLeftColor4.value
    ]
  })

  // 计算属性 - 上图表右Y轴数据（双图双Y轴模式）
  const upperChartRightSources = computed(() => {
    return [
      upperChartRightSource1.value,
      upperChartRightSource2.value,
      upperChartRightSource3.value,
      upperChartRightSource4.value
    ].filter(source => source !== '')
  })

  // 计算属性 - 上图表右Y轴颜色配置（双图双Y轴模式）
  const upperChartRightColors = computed(() => {
    return [
      upperChartRightColor1.value,
      upperChartRightColor2.value,
      upperChartRightColor3.value,
      upperChartRightColor4.value
    ]
  })

  // 计算属性 - 下图表左Y轴数据（双图双Y轴模式）
  const lowerChartLeftSources = computed(() => {
    return [
      lowerChartLeftSource1.value,
      lowerChartLeftSource2.value,
      lowerChartLeftSource3.value,
      lowerChartLeftSource4.value
    ].filter(source => source !== '')
  })

  // 计算属性 - 下图表左Y轴颜色配置（双图双Y轴模式）
  const lowerChartLeftColors = computed(() => {
    return [
      lowerChartLeftColor1.value,
      lowerChartLeftColor2.value,
      lowerChartLeftColor3.value,
      lowerChartLeftColor4.value
    ]
  })

  // 计算属性 - 下图表右Y轴数据（双图双Y轴模式）
  const lowerChartRightSources = computed(() => {
    return [
      lowerChartRightSource1.value,
      lowerChartRightSource2.value,
      lowerChartRightSource3.value,
      lowerChartRightSource4.value
    ].filter(source => source !== '')
  })

  // 计算属性 - 下图表右Y轴颜色配置（双图双Y轴模式）
  const lowerChartRightColors = computed(() => {
    return [
      lowerChartRightColor1.value,
      lowerChartRightColor2.value,
      lowerChartRightColor3.value,
      lowerChartRightColor4.value
    ]
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

  // 计算属性 - 单图模式颜色配置
  const singleChartColors = computed(() => {
    return [
      singleChartColor1.value,
      singleChartColor2.value,
      singleChartColor3.value,
      singleChartColor4.value
    ]
  })

  // 计算属性 - 单图模式左Y轴数据
  const singleChartLeftSources = computed(() => {
    return [
      singleChartLeftSource1.value,
      singleChartLeftSource2.value,
      singleChartLeftSource3.value,
      singleChartLeftSource4.value
    ].filter(source => source !== '')
  })

  // 计算属性 - 单图模式左Y轴颜色配置
  const singleChartLeftColors = computed(() => {
    return [
      singleChartLeftColor1.value,
      singleChartLeftColor2.value,
      singleChartLeftColor3.value,
      singleChartLeftColor4.value
    ]
  })

  // 计算属性 - 单图模式右Y轴数据
  const singleChartRightSources = computed(() => {
    return [
      singleChartRightSource1.value,
      singleChartRightSource2.value,
      singleChartRightSource3.value,
      singleChartRightSource4.value
    ].filter(source => source !== '')
  })

  // 计算属性 - 单图模式右Y轴颜色配置
  const singleChartRightColors = computed(() => {
    return [
      singleChartRightColor1.value,
      singleChartRightColor2.value,
      singleChartRightColor3.value,
      singleChartRightColor4.value
    ]
  })

  // 计算属性 - 检查是否有数据
  const hasData = computed(() => {
    return flowData.value.plotTime && flowData.value.plotTime.length > 0
  })

  // 计算属性 - 获取所有可用的数据源字段（排除元数据字段）
  // 修改 availableSources 计算属性，确保它能正确反映 flowData 的变化
  const availableSources = computed(() => {
  // 确保 flowData.value 存在
  if (!flowData.value) {
    return []
  }
  
  return Object.keys(flowData.value).filter(key => 
    key !== 'plotTime' && 
    key !== 'timestamp' && 
    key !== 'startTime' && 
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
      // 切换到单Y轴模式
    } else {
      // 切换到双Y轴模式
    }
  }

  // 函数 - 布局变化处理
  function onLayoutChange() {
    // 布局变更时只清空相关模式的选择，保留其他模式的选择
    if (viewLayout.value === 'single') {
      // 切换到单图模式
    } else {
      // 切换到双图模式
    }
  }

  // 函数 - 应用视图配置
  function applyViewConfig(createChart: () => void) {
    // 在更新图表前先销毁并重新创建图表，确保清除所有残留数据
    createChart()
    viewConfigDialogVisible.value = false
  }

  // 返回所有需要暴露的状态和方法
  return {
    // 状态变量
    viewConfigDialogVisible,
    viewLayout,
    yAxisConfig,

    // 单图单Y轴模式
    singleChartSource1,
    singleChartSource2,
    singleChartSource3,
    singleChartSource4,
    singleChartColor1,
    singleChartColor2,
    singleChartColor3,
    singleChartColor4,
    singleChartUseArea1,
    singleChartUseArea2,
    singleChartUseArea3,
    singleChartUseArea4,

    // 单图双Y轴
    singleChartLeftSource1,
    singleChartLeftSource2,
    singleChartLeftSource3,
    singleChartLeftSource4,
    singleChartRightSource1,
    singleChartRightSource2,
    singleChartRightSource3,
    singleChartRightSource4,
    singleChartLeftColor1,
    singleChartLeftColor2,
    singleChartLeftColor3,
    singleChartLeftColor4,
    singleChartRightColor1,
    singleChartRightColor2,
    singleChartRightColor3,
    singleChartRightColor4,
    singleChartLeftUseArea1,
    singleChartLeftUseArea2,
    singleChartLeftUseArea3,
    singleChartLeftUseArea4,
    singleChartRightUseArea1,
    singleChartRightUseArea2,
    singleChartRightUseArea3,
    singleChartRightUseArea4,

    // 双图单Y轴
    upperChartSource1,
    upperChartSource2,
    upperChartSource3,
    upperChartSource4,
    lowerChartSource1,
    lowerChartSource2,
    lowerChartSource3,
    lowerChartSource4,
    upperChartColor1,
    upperChartColor2,
    upperChartColor3,
    upperChartColor4,
    lowerChartColor1,
    lowerChartColor2,
    lowerChartColor3,
    lowerChartColor4,
    upperChartUseArea1,
    upperChartUseArea2,
    upperChartUseArea3,
    upperChartUseArea4,
    lowerChartUseArea1,
    lowerChartUseArea2,
    lowerChartUseArea3,
    lowerChartUseArea4,
    
    // 双图双Y轴
    upperChartLeftSource1,
    upperChartLeftSource2,
    upperChartLeftSource3,
    upperChartLeftSource4,
    upperChartRightSource1,
    upperChartRightSource2,
    upperChartRightSource3,
    upperChartRightSource4,
    lowerChartLeftSource1,
    lowerChartLeftSource2,
    lowerChartLeftSource3,
    lowerChartLeftSource4,
    lowerChartRightSource1,
    lowerChartRightSource2,
    lowerChartRightSource3,
    lowerChartRightSource4,
    upperChartLeftColor1,
    upperChartLeftColor2,
    upperChartLeftColor3,
    upperChartLeftColor4,
    upperChartRightColor1,
    upperChartRightColor2,
    upperChartRightColor3,
    upperChartRightColor4,
    lowerChartLeftColor1,
    lowerChartLeftColor2,
    lowerChartLeftColor3,
    lowerChartLeftColor4,
    lowerChartRightColor1,
    lowerChartRightColor2,
    lowerChartRightColor3,
    lowerChartRightColor4,
    upperChartLeftUseArea1,
    upperChartLeftUseArea2,
    upperChartLeftUseArea3,
    upperChartLeftUseArea4,
    upperChartRightUseArea1,
    upperChartRightUseArea2,
    upperChartRightUseArea3,
    upperChartRightUseArea4,
    lowerChartLeftUseArea1,
    lowerChartLeftUseArea2,
    lowerChartLeftUseArea3,
    lowerChartLeftUseArea4,
    lowerChartRightUseArea1,
    lowerChartRightUseArea2,
    lowerChartRightUseArea3,
    lowerChartRightUseArea4,

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
    // 颜色计算属性
    upperChartColors,
    lowerChartColors,
    upperChartLeftColors,
    upperChartRightColors,
    lowerChartLeftColors,
    lowerChartRightColors,
    singleChartColors,
    singleChartLeftColors,
    singleChartRightColors,
    // 方法
    showViewConfig,
    onYAxisChange,
    onLayoutChange,
    applyViewConfig
  }
}