import { ref, computed } from 'vue'

// 定义视图布局类型
export type ViewLayout = 'single' | 'double'
// 定义Y轴配置类型
export type YAxisConfig = 'single' | 'double'

// FlowDeviation
const deviationX = ref<string>('')
const deviationY = ref<string>('')
// 添加三条轨迹的配置
const deviationTrack1X = ref<string>('')
const deviationTrack1Y = ref<string>('')
const deviationTrack2X = ref<string>('')
const deviationTrack2Y = ref<string>('')
const deviationTrack3X = ref<string>('')
const deviationTrack3Y = ref<string>('')
const deviationTrack4X = ref<string>('')
const deviationTrack4Y = ref<string>('')
// 添加轨迹颜色配置
const deviationTrack1Color = ref<string>('#5470c6')
const deviationTrack2Color = ref<string>('#3ba272')
const deviationTrack3Color = ref<string>('#fac858')
const deviationTrack4Color = ref<string>('#9a60b4')

// FlowData
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

// 创建并导出useFlowData钩子
export function useDataConfig(flowData: any) {
  // 视图配置相关
  const viewConfigDialogVisible = ref(false)
  const viewLayout = ref<ViewLayout>('single')
  const yAxisConfig = ref<YAxisConfig>('single')

  // 计算属性 - 上图表数据源（双图模式）
  const upperChartSources = computed(() => {
    return [
      upperChartSource1.value,
      upperChartSource2.value,
      upperChartSource3.value,
      upperChartSource4.value
    ]
    // ].filter(source => source !== '')
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
    ]
    // ].filter(source => source !== '')
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
    ]
    // ].filter(source => source !== '')
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
    ]
    // ].filter(source => source !== '')
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
    ]
    // ].filter(source => source !== '')
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
    ]
    // ].filter(source => source !== '')
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
    ]
    // ].filter(source => source !== '')
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
    ]
    // ].filter(source => source !== '')
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
    ]
    // ].filter(source => source !== '')
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

  // 函数 - 验证并应用配置
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
      // 这个回调函数将在FlowData组件中提供
      // console.log('配置已应用，需要更新图表')
    })
  }

  // 函数 - 应用数据源配置
  function applyDataSourceConfig(config: any) {
    // 应用FlowDeviation配置
    if (config.deviation) {
      // 应用Deviation轨迹配置
      deviationTrack1X.value = config.deviation.track1X || ''
      deviationTrack1Y.value = config.deviation.track1Y || ''
      deviationTrack2X.value = config.deviation.track2X || ''
      deviationTrack2Y.value = config.deviation.track2Y || ''
      deviationTrack3X.value = config.deviation.track3X || ''
      deviationTrack3Y.value = config.deviation.track3Y || ''
      deviationTrack4X.value = config.deviation.track4X || ''
      deviationTrack4Y.value = config.deviation.track4Y || ''
      // 应用Deviation颜色配置
      deviationTrack1Color.value = config.deviation.track1Color || ''
      deviationTrack2Color.value = config.deviation.track2Color || ''
      deviationTrack3Color.value = config.deviation.track3Color || ''
      deviationTrack4Color.value = config.deviation.track4Color || ''
    }

    // 单图模式下的数据源配置
    if (config.viewLayout === 'single' && config.sources) {
      if (config.yAxisConfig === 'single') {
        // 单Y轴模式
        singleChartSource1.value = config.sources.source1 || ''
        singleChartSource2.value = config.sources.source2 || ''
        singleChartSource3.value = config.sources.source3 || ''
        singleChartSource4.value = config.sources.source4 || ''
        // 应用颜色配置
        if (config.colors) {
          singleChartColor1.value = config.colors.source1 || ''
          singleChartColor2.value = config.colors.source2 || ''
          singleChartColor3.value = config.colors.source3 || ''
          singleChartColor4.value = config.colors.source4 || ''
        }
        // 应用区域配置
        if (config.area) {
          singleChartUseArea1.value = config.area.source1 || ''
          singleChartUseArea2.value = config.area.source2 || ''
          singleChartUseArea3.value = config.area.source3 || ''
          singleChartUseArea4.value = config.area.source4 || ''
        }
      } else if (config.yAxisConfig === 'double') {
        // 单图双Y轴模式
        singleChartLeftSource1.value = config.sources.left1 || ''
        singleChartLeftSource2.value = config.sources.left2 || ''
        singleChartLeftSource3.value = config.sources.left3 || ''
        singleChartLeftSource4.value = config.sources.left4 || ''
        singleChartRightSource1.value = config.sources.right1 || ''
        singleChartRightSource2.value = config.sources.right2 || ''
        singleChartRightSource3.value = config.sources.right3 || ''
        singleChartRightSource4.value = config.sources.right4 || ''
        // 应用颜色配置
        if (config.colors) {
          singleChartLeftColor1.value = config.colors.left1 || ''
          singleChartLeftColor2.value = config.colors.left2 || ''
          singleChartLeftColor3.value = config.colors.left3 || ''
          singleChartLeftColor4.value = config.colors.left4 || ''
          singleChartRightColor1.value = config.colors.right1 || ''
          singleChartRightColor2.value = config.colors.right2 || ''
          singleChartRightColor3.value = config.colors.right3 || ''
          singleChartRightColor4.value = config.colors.right4 || ''
        }
        // 应用区域配置
        if (config.area) {
          singleChartLeftUseArea1.value = config.area.left1 || ''
          singleChartLeftUseArea2.value = config.area.left2 || ''
          singleChartLeftUseArea3.value = config.area.left3 || ''
          singleChartLeftUseArea4.value = config.area.left4 || ''
          singleChartRightUseArea1.value = config.area.right1 || ''
          singleChartRightUseArea2.value = config.area.right2 || ''
          singleChartRightUseArea3.value = config.area.right3 || ''
          singleChartRightUseArea4.value = config.area.right4 || ''
        }
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
          // 应用颜色配置
          if (config.upperColors) {
            upperChartColor1.value = config.upperColors.source1 || ''
            upperChartColor2.value = config.upperColors.source2 || ''
            upperChartColor3.value = config.upperColors.source3 || ''
            upperChartColor4.value = config.upperColors.source4 || ''
          }
          // 应用区域配置
          if (config.upperArea) {
            upperChartUseArea1.value = config.upperArea.source1 || ''
            upperChartUseArea2.value = config.upperArea.source2 || ''
            upperChartUseArea3.value = config.upperArea.source3 || ''
            upperChartUseArea4.value = config.upperArea.source4 || ''
          }
        } else if (config.yAxisConfig === 'double') {
          upperChartLeftSource1.value = config.upperSources.left1 || ''
          upperChartLeftSource2.value = config.upperSources.left2 || ''
          upperChartLeftSource3.value = config.upperSources.left3 || ''
          upperChartLeftSource4.value = config.upperSources.left4 || ''
          upperChartRightSource1.value = config.upperSources.right1 || ''
          upperChartRightSource2.value = config.upperSources.right2 || ''
          upperChartRightSource3.value = config.upperSources.right3 || ''
          upperChartRightSource4.value = config.upperSources.right4 || ''
          // 应用颜色配置
          if (config.upperColors) {
            upperChartLeftColor1.value = config.upperColors.left1 || ''
            upperChartLeftColor2.value = config.upperColors.left2 || ''
            upperChartLeftColor3.value = config.upperColors.left3 || ''
            upperChartLeftColor4.value = config.upperColors.left4 || ''
            upperChartRightColor1.value = config.upperColors.right1 || ''
            upperChartRightColor2.value = config.upperColors.right2 || ''
            upperChartRightColor3.value = config.upperColors.right3 || ''
            upperChartRightColor4.value = config.upperColors.right4 || ''
          }
          // 应用区域配置
          if (config.upperArea) {
            upperChartLeftUseArea1.value = config.upperArea.left1 || ''
            upperChartLeftUseArea2.value = config.upperArea.left2 || ''
            upperChartLeftUseArea3.value = config.upperArea.left3 || ''
            upperChartLeftUseArea4.value = config.upperArea.left4 || ''
            upperChartRightUseArea1.value = config.upperArea.right1 || ''
            upperChartRightUseArea2.value = config.upperArea.right2 || ''
            upperChartRightUseArea3.value = config.upperArea.right3 || ''
            upperChartRightUseArea4.value = config.upperArea.right4 || ''
          }
        }
      }
      
      // 下图数据源
      if (config.lowerSources) {
        if (config.yAxisConfig === 'single') {
          lowerChartSource1.value = config.lowerSources.source1 || ''
          lowerChartSource2.value = config.lowerSources.source2 || ''
          lowerChartSource3.value = config.lowerSources.source3 || ''
          lowerChartSource4.value = config.lowerSources.source4 || ''
          // 应用颜色配置
          if (config.lowerColors) {
            lowerChartColor1.value = config.lowerColors.source1 || ''
            lowerChartColor2.value = config.lowerColors.source2 || ''
            lowerChartColor3.value = config.lowerColors.source3 || ''
            lowerChartColor4.value = config.lowerColors.source4 || ''
          }
          // 应用区域配置
          if (config.lowerArea) {
            lowerChartUseArea1.value = config.lowerArea.source1 || ''
            lowerChartUseArea2.value = config.lowerArea.source2 || ''
            lowerChartUseArea3.value = config.lowerArea.source3 || ''
            lowerChartUseArea4.value = config.lowerArea.source4 || ''
          }
        } else if (config.yAxisConfig === 'double') {
          lowerChartLeftSource1.value = config.lowerSources.left1 || ''
          lowerChartLeftSource2.value = config.lowerSources.left2 || ''
          lowerChartLeftSource3.value = config.lowerSources.left3 || ''
          lowerChartLeftSource4.value = config.lowerSources.left4 || ''
          lowerChartRightSource1.value = config.lowerSources.right1 || ''
          lowerChartRightSource2.value = config.lowerSources.right2 || ''
          lowerChartRightSource3.value = config.lowerSources.right3 || ''
          lowerChartRightSource4.value = config.lowerSources.right4 || ''
          // 应用颜色配置
          if (config.lowerColors) {
            lowerChartLeftColor1.value = config.lowerColors.left1 || ''
            lowerChartLeftColor2.value = config.lowerColors.left2 || ''
            lowerChartLeftColor3.value = config.lowerColors.left3 || ''
            lowerChartLeftColor4.value = config.lowerColors.left4 || ''
            lowerChartRightColor1.value = config.lowerColors.right1 || ''
            lowerChartRightColor2.value = config.lowerColors.right2 || ''
            lowerChartRightColor3.value = config.lowerColors.right3 || ''
            lowerChartRightColor4.value = config.lowerColors.right4 || ''
          }
          // 应用区域配置
          if (config.lowerArea) {
            lowerChartLeftUseArea1.value = config.lowerArea.left1 || ''
            lowerChartLeftUseArea2.value = config.lowerArea.left2 || ''
            lowerChartLeftUseArea3.value = config.lowerArea.left3 || ''
            lowerChartLeftUseArea4.value = config.lowerArea.left4 || ''
            lowerChartRightUseArea1.value = config.lowerArea.right1 || ''
            lowerChartRightUseArea2.value = config.lowerArea.right2 || ''
            lowerChartRightUseArea3.value = config.lowerArea.right3 || ''
            lowerChartRightUseArea4.value = config.lowerArea.right4 || ''
          }
        }
      }
    }
  }

  function exportConfigFile() {
    let config: any = {
      viewLayout: viewLayout.value,
      yAxisConfig: yAxisConfig.value
    }

    // 添加FlowDeviation配置
    config.deviation = {
      track1X: deviationTrack1X.value,
      track1Y: deviationTrack1Y.value,
      track2X: deviationTrack2X.value,
      track2Y: deviationTrack2Y.value,
      track3X: deviationTrack3X.value,
      track3Y: deviationTrack3Y.value,
      track4X: deviationTrack4X.value,
      track4Y: deviationTrack4Y.value,
      track1Color: deviationTrack1Color.value,
      track2Color: deviationTrack2Color.value,
      track3Color: deviationTrack3Color.value,
      track4Color: deviationTrack4Color.value,
    }
    
    // 根据当前布局和Y轴配置收集数据源配置
    if (viewLayout.value === 'single') {
      if (yAxisConfig.value === 'single') {
        // 单图单Y轴模式
        config.sources = {
          source1: singleChartSource1.value,
          source2: singleChartSource2.value,
          source3: singleChartSource3.value,
          source4: singleChartSource4.value
        }
        // 添加颜色配置
        config.colors = {
          source1: singleChartColor1.value,
          source2: singleChartColor2.value,
          source3: singleChartColor3.value,
          source4: singleChartColor4.value
        }
        config.area = {
          source1: singleChartUseArea1.value,
          source2: singleChartUseArea2.value,
          source3: singleChartUseArea3.value,
          source4: singleChartUseArea4.value,
        }
      } else {
        // 单图双Y轴模式
        config.sources = {
          left1: singleChartLeftSource1.value,
          left2: singleChartLeftSource2.value,
          left3: singleChartLeftSource3.value,
          left4: singleChartLeftSource4.value,
          right1: singleChartRightSource1.value,
          right2: singleChartRightSource2.value,
          right3: singleChartRightSource3.value,
          right4: singleChartRightSource4.value
        }
        // 添加颜色配置
        config.colors = {
          left1: singleChartLeftColor1.value,
          left2: singleChartLeftColor2.value,
          left3: singleChartLeftColor3.value,
          left4: singleChartLeftColor4.value,
          right1: singleChartRightColor1.value,
          right2: singleChartRightColor2.value,
          right3: singleChartRightColor3.value,
          right4: singleChartRightColor4.value
        }
        // 添加区域配置
        config.area = {
          left1: singleChartLeftUseArea1.value,
          left2: singleChartLeftUseArea2.value,
          left3: singleChartLeftUseArea3.value,
          left4: singleChartLeftUseArea4.value,
          right1: singleChartRightUseArea1.value,
          right2: singleChartRightUseArea2.value,
          right3: singleChartRightUseArea3.value,
          right4: singleChartRightUseArea4.value,
        }
      }
    } else {
      config.upperSources = {};
      config.lowerSources = {};
      
      if (yAxisConfig.value === 'single') {
        // 双图单Y轴模式
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
        // 添加颜色配置
        config.upperColors = {
          source1: upperChartColor1.value,
          source2: upperChartColor2.value,
          source3: upperChartColor3.value,
          source4: upperChartColor4.value
        }
        config.lowerColors = {
          source1: lowerChartColor1.value,
          source2: lowerChartColor2.value,
          source3: lowerChartColor3.value,
          source4: lowerChartColor4.value
        }
        // 添加区域配置
        config.upperArea = {
          source1: upperChartUseArea1.value,
          source2: upperChartUseArea2.value,
          source3: upperChartUseArea3.value,
          source4: upperChartUseArea4.value,
        }
        config.lowerArea = {
          source1: lowerChartUseArea1.value,
          source2: lowerChartUseArea2.value,
          source3: lowerChartUseArea3.value,
          source4: lowerChartUseArea4.value,
        }
      } else {
        // 双图双Y轴模式
        config.upperSources = {
          left1: upperChartLeftSource1.value,
          left2: upperChartLeftSource2.value,
          left3: upperChartLeftSource3.value,
          left4: upperChartLeftSource4.value,
          right1: upperChartRightSource1.value,
          right2: upperChartRightSource2.value,
          right3: upperChartRightSource3.value,
          right4: upperChartRightSource4.value
        }
        config.lowerSources = {
          left1: lowerChartLeftSource1.value,
          left2: lowerChartLeftSource2.value,
          left3: lowerChartLeftSource3.value,
          left4: lowerChartLeftSource4.value,
          right1: lowerChartRightSource1.value,
          right2: lowerChartRightSource2.value,
          right3: lowerChartRightSource3.value,
          right4: lowerChartRightSource4.value
        }
        // 添加颜色配置
        config.upperColors = {
          left1: upperChartLeftColor1.value,
          left2: upperChartLeftColor2.value,
          left3: upperChartLeftColor3.value,
          left4: upperChartLeftColor4.value,
          right1: upperChartRightColor1.value,
          right2: upperChartRightColor2.value,
          right3: upperChartRightColor3.value,
          right4: upperChartRightColor4.value
        }
        config.lowerColors = {
          left1: lowerChartLeftColor1.value,
          left2: lowerChartLeftColor2.value,
          left3: lowerChartLeftColor3.value,
          left4: lowerChartLeftColor4.value,
          right1: lowerChartRightColor1.value,
          right2: lowerChartRightColor2.value,
          right3: lowerChartRightColor3.value,
          right4: lowerChartRightColor4.value
        }
        // 添加区域配置
        config.upperArea = {
          left1: upperChartLeftUseArea1.value,
          left2: upperChartLeftUseArea2.value,
          left3: upperChartLeftUseArea3.value,
          left4: upperChartLeftUseArea4.value,
          right1: upperChartRightUseArea1.value,
          right2: upperChartRightUseArea2.value,
          right3: upperChartRightUseArea3.value,
          right4: upperChartRightUseArea4.value,
        }
        config.lowerArea = {
          left1: lowerChartLeftUseArea1.value,
          left2: lowerChartLeftUseArea2.value,
          left3: lowerChartLeftUseArea3.value,
          left4: lowerChartLeftUseArea4.value,
          right1: lowerChartRightUseArea1.value,
          right2: lowerChartRightUseArea2.value,
          right3: lowerChartRightUseArea3.value,
          right4: lowerChartRightUseArea4.value,
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

  // 返回所有需要暴露的状态和方法
  return {
    // 状态变量
    viewConfigDialogVisible,
    viewLayout,
    yAxisConfig,

    // FlowDeviation
    deviationTrack1X,
    deviationTrack1Y,
    deviationTrack2X,
    deviationTrack2Y,
    deviationTrack3X,
    deviationTrack3Y,
    deviationTrack4X,
    deviationTrack4Y,
    deviationTrack1Color,
    deviationTrack2Color,
    deviationTrack3Color,
    deviationTrack4Color,

    // FlowData
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
    applyViewConfig,
    exportConfigFile,
    validateAndApplyConfig,
    applyDataSourceConfig,
  }
}