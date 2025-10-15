import { ref, computed } from 'vue'

// 定义视图布局类型
export type ViewLayout = 'single' | 'double'
// 定义Y轴配置类型
export type YAxisConfig = 'single' | 'double'

// 预定义颜色数组
const COLOR_PALETTE = [
  '#5470c6',  // 蓝
  '#91cc75',  // 绿
  '#fac858',  // 黄
  '#ee6666',  // 红
  '#73c0de',  // 青
  '#3ba272',  // 深绿
  '#fc8452',  // 橙
  '#9a60b4',  // 紫
  '#ea7ccc',  // 粉
  '#ffbd52',  // 浅橙
  '#33baab',  // 蓝绿
  '#ffdb5c',  // 浅黄
  '#8293f0',  // 浅蓝
  '#c1232b'   // 深红
]

// 生成随机颜色的辅助函数
export function getRandomColor(colorRef: any, index: number): string {
  const cycleIndex = index % COLOR_PALETTE.length
  const color = COLOR_PALETTE[cycleIndex]
  if (colorRef) {
    colorRef.value = color
  }
  return color
}

// FlowDeviation 配置对象
const deviationConfig = {
  // 轨迹字段
  track1X: ref<string>(''),
  track1Y: ref<string>(''),
  track2X: ref<string>(''),
  track2Y: ref<string>(''),
  track3X: ref<string>(''),
  track3Y: ref<string>(''),
  track4X: ref<string>(''),
  track4Y: ref<string>(''),
  // 轨迹颜色
  track1Color: ref<string>('#5470c6'),
  track2Color: ref<string>('#3ba272'),
  track3Color: ref<string>('#fac858'),
  track4Color: ref<string>('#9a60b4')
}

// FlowData
// FlowData 配置对象 - 单图单Y轴模式
const singleChartConfig = {
  // 数据源选择
  source1: ref<string>(''),
  source2: ref<string>(''),
  source3: ref<string>(''),
  source4: ref<string>(''),
  // 颜色配置
  color1: ref<string>(''),
  color2: ref<string>(''),
  color3: ref<string>(''),
  color4: ref<string>(''),
  // areaStyle控制配置
  useArea1: ref<boolean>(false),
  useArea2: ref<boolean>(false),
  useArea3: ref<boolean>(false),
  useArea4: ref<boolean>(false)
}

// FlowData 配置对象 - 单图双Y轴模式
const singleChartDoubleYConfig = {
  // 左Y轴数据源
  leftSource1: ref<string>(''),
  leftSource2: ref<string>(''),
  leftSource3: ref<string>(''),
  leftSource4: ref<string>(''),
  rightSource1: ref<string>(''),
  rightSource2: ref<string>(''),
  rightSource3: ref<string>(''),
  rightSource4: ref<string>(''),
  // 左Y轴颜色配置
  leftColor1: ref<string>(''),
  leftColor2: ref<string>(''),
  leftColor3: ref<string>(''),
  leftColor4: ref<string>(''),
  rightColor1: ref<string>(''),
  rightColor2: ref<string>(''),
  rightColor3: ref<string>(''),
  rightColor4: ref<string>(''),
  // 区域配置
  leftUseArea1: ref<boolean>(false),
  leftUseArea2: ref<boolean>(false),
  leftUseArea3: ref<boolean>(false),
  leftUseArea4: ref<boolean>(false),
  rightUseArea1: ref<boolean>(false),
  rightUseArea2: ref<boolean>(false),
  rightUseArea3: ref<boolean>(false),
  rightUseArea4: ref<boolean>(false)
}

// FlowData 配置对象 - 双图单Y轴模式
const doubleChartConfig = {
  // 上图数据源
  upperSource1: ref<string>(''),
  upperSource2: ref<string>(''),
  upperSource3: ref<string>(''),
  upperSource4: ref<string>(''),
  lowerSource1: ref<string>(''),
  lowerSource2: ref<string>(''),
  lowerSource3: ref<string>(''),
  lowerSource4: ref<string>(''),
  // 上图颜色配置
  upperColor1: ref<string>(''),
  upperColor2: ref<string>(''),
  upperColor3: ref<string>(''),
  upperColor4: ref<string>(''),
  lowerColor1: ref<string>(''),
  lowerColor2: ref<string>(''),
  lowerColor3: ref<string>(''),
  lowerColor4: ref<string>(''),
  // 区域配置
  upperUseArea1: ref<boolean>(false),
  upperUseArea2: ref<boolean>(false),
  upperUseArea3: ref<boolean>(false),
  upperUseArea4: ref<boolean>(false),
  lowerUseArea1: ref<boolean>(false),
  lowerUseArea2: ref<boolean>(false),
  lowerUseArea3: ref<boolean>(false),
  lowerUseArea4: ref<boolean>(false)
}

/**
 * * 双图双Y轴模式
 */
// FlowData 配置对象 - 双图双Y轴模式
const doubleChartDoubleYConfig = {
  // 上图左Y轴数据源
  upperLeftSource1: ref<string>(''),
  upperLeftSource2: ref<string>(''),
  upperLeftSource3: ref<string>(''),
  upperLeftSource4: ref<string>(''),
  upperRightSource1: ref<string>(''),
  upperRightSource2: ref<string>(''),
  upperRightSource3: ref<string>(''),
  upperRightSource4: ref<string>(''),
  lowerLeftSource1: ref<string>(''),
  lowerLeftSource2: ref<string>(''),
  lowerLeftSource3: ref<string>(''),
  lowerLeftSource4: ref<string>(''),
  lowerRightSource1: ref<string>(''),
  lowerRightSource2: ref<string>(''),
  lowerRightSource3: ref<string>(''),
  lowerRightSource4: ref<string>(''),
  // 上图颜色配置
  upperLeftColor1: ref<string>(''),
  upperLeftColor2: ref<string>(''),
  upperLeftColor3: ref<string>(''),
  upperLeftColor4: ref<string>(''),
  upperRightColor1: ref<string>(''),
  upperRightColor2: ref<string>(''),
  upperRightColor3: ref<string>(''),
  upperRightColor4: ref<string>(''),
  lowerLeftColor1: ref<string>(''),
  lowerLeftColor2: ref<string>(''),
  lowerLeftColor3: ref<string>(''),
  lowerLeftColor4: ref<string>(''),
  lowerRightColor1: ref<string>(''),
  lowerRightColor2: ref<string>(''),
  lowerRightColor3: ref<string>(''),
  lowerRightColor4: ref<string>(''),
  // 区域配置
  upperLeftUseArea1: ref<boolean>(false),
  upperLeftUseArea2: ref<boolean>(false),
  upperLeftUseArea3: ref<boolean>(false),
  upperLeftUseArea4: ref<boolean>(false),
  upperRightUseArea1: ref<boolean>(false),
  upperRightUseArea2: ref<boolean>(false),
  upperRightUseArea3: ref<boolean>(false),
  upperRightUseArea4: ref<boolean>(false),
  lowerLeftUseArea1: ref<boolean>(false),
  lowerLeftUseArea2: ref<boolean>(false),
  lowerLeftUseArea3: ref<boolean>(false),
  lowerLeftUseArea4: ref<boolean>(false),
  lowerRightUseArea1: ref<boolean>(false),
  lowerRightUseArea2: ref<boolean>(false),
  lowerRightUseArea3: ref<boolean>(false),
  lowerRightUseArea4: ref<boolean>(false)
}

// 创建并导出useFlowData钩子
export function useDataConfig(flowData: any) {
  // 视图配置相关
  const viewConfigDialogVisible = ref(false)
  const viewLayout = ref<ViewLayout>('single')
  const yAxisConfig = ref<YAxisConfig>('single')

  // 计算属性 - 上图表数据源（双图模式）
  const upperChartSources = computed(() => {
    return [
      doubleChartConfig.upperSource1.value,
      doubleChartConfig.upperSource2.value,
      doubleChartConfig.upperSource3.value,
      doubleChartConfig.upperSource4.value
    ]
  })

  // 计算属性 - 上图表颜色配置（双图模式）
  const upperChartColors = computed(() => {
    return [
      doubleChartConfig.upperColor1.value,
      doubleChartConfig.upperColor2.value,
      doubleChartConfig.upperColor3.value,
      doubleChartConfig.upperColor4.value
    ]
  })

  // 计算属性 - 下图表数据源（双图模式）
  const lowerChartSources = computed(() => {
    return [
      doubleChartConfig.lowerSource1.value,
      doubleChartConfig.lowerSource2.value,
      doubleChartConfig.lowerSource3.value,
      doubleChartConfig.lowerSource4.value
    ]
  })

  // 计算属性 - 下图表颜色配置（双图模式）
  const lowerChartColors = computed(() => {
    return [
      doubleChartConfig.lowerColor1.value,
      doubleChartConfig.lowerColor2.value,
      doubleChartConfig.lowerColor3.value,
      doubleChartConfig.lowerColor4.value
    ]
  })

  // 计算属性 - 上图表左Y轴数据（双图双Y轴模式）
  const upperChartLeftSources = computed(() => {
    return [
      doubleChartDoubleYConfig.upperLeftSource1.value,
      doubleChartDoubleYConfig.upperLeftSource2.value,
      doubleChartDoubleYConfig.upperLeftSource3.value,
      doubleChartDoubleYConfig.upperLeftSource4.value
    ]
  })

  // 计算属性 - 上图表左Y轴颜色配置（双图双Y轴模式）
  const upperChartLeftColors = computed(() => {
    return [
      doubleChartDoubleYConfig.upperLeftColor1.value,
      doubleChartDoubleYConfig.upperLeftColor2.value,
      doubleChartDoubleYConfig.upperLeftColor3.value,
      doubleChartDoubleYConfig.upperLeftColor4.value
    ]
  })

  // 计算属性 - 上图表右Y轴数据（双图双Y轴模式）
  const upperChartRightSources = computed(() => {
    return [
      doubleChartDoubleYConfig.upperRightSource1.value,
      doubleChartDoubleYConfig.upperRightSource2.value,
      doubleChartDoubleYConfig.upperRightSource3.value,
      doubleChartDoubleYConfig.upperRightSource4.value
    ]
  })

  // 计算属性 - 上图表右Y轴颜色配置（双图双Y轴模式）
  const upperChartRightColors = computed(() => {
    return [
      doubleChartDoubleYConfig.upperRightColor1.value,
      doubleChartDoubleYConfig.upperRightColor2.value,
      doubleChartDoubleYConfig.upperRightColor3.value,
      doubleChartDoubleYConfig.upperRightColor4.value
    ]
  })

  // 计算属性 - 下图表左Y轴数据（双图双Y轴模式）
  const lowerChartLeftSources = computed(() => {
    return [
      doubleChartDoubleYConfig.lowerLeftSource1.value,
      doubleChartDoubleYConfig.lowerLeftSource2.value,
      doubleChartDoubleYConfig.lowerLeftSource3.value,
      doubleChartDoubleYConfig.lowerLeftSource4.value
    ]
  })

  // 计算属性 - 下图表左Y轴颜色配置（双图双Y轴模式）
  const lowerChartLeftColors = computed(() => {
    return [
      doubleChartDoubleYConfig.lowerLeftColor1.value,
      doubleChartDoubleYConfig.lowerLeftColor2.value,
      doubleChartDoubleYConfig.lowerLeftColor3.value,
      doubleChartDoubleYConfig.lowerLeftColor4.value
    ]
  })

  // 计算属性 - 下图表右Y轴数据（双图双Y轴模式）
  const lowerChartRightSources = computed(() => {
    return [
      doubleChartDoubleYConfig.lowerRightSource1.value,
      doubleChartDoubleYConfig.lowerRightSource2.value,
      doubleChartDoubleYConfig.lowerRightSource3.value,
      doubleChartDoubleYConfig.lowerRightSource4.value
    ]
  })

  // 计算属性 - 下图表右Y轴颜色配置（双图双Y轴模式）
  const lowerChartRightColors = computed(() => {
    return [
      doubleChartDoubleYConfig.lowerRightColor1.value,
      doubleChartDoubleYConfig.lowerRightColor2.value,
      doubleChartDoubleYConfig.lowerRightColor3.value,
      doubleChartDoubleYConfig.lowerRightColor4.value
    ]
  })

  // 计算属性 - 单图模式数据源
  const singleChartSources = computed(() => {
    return [
      singleChartConfig.source1.value,
      singleChartConfig.source2.value,
      singleChartConfig.source3.value,
      singleChartConfig.source4.value
    ]
  })

  // 计算属性 - 单图模式颜色配置
  const singleChartColors = computed(() => {
    return [
      singleChartConfig.color1.value,
      singleChartConfig.color2.value,
      singleChartConfig.color3.value,
      singleChartConfig.color4.value
    ]
  })

  // 计算属性 - 单图模式左Y轴数据
  const singleChartLeftSources = computed(() => {
    return [
      singleChartDoubleYConfig.leftSource1.value,
      singleChartDoubleYConfig.leftSource2.value,
      singleChartDoubleYConfig.leftSource3.value,
      singleChartDoubleYConfig.leftSource4.value
    ]
  })

  // 计算属性 - 单图模式左Y轴颜色配置
  const singleChartLeftColors = computed(() => {
    return [
      singleChartDoubleYConfig.leftColor1.value,
      singleChartDoubleYConfig.leftColor2.value,
      singleChartDoubleYConfig.leftColor3.value,
      singleChartDoubleYConfig.leftColor4.value
    ]
  })

  // 计算属性 - 单图模式右Y轴数据
  const singleChartRightSources = computed(() => {
    return [
      singleChartDoubleYConfig.rightSource1.value,
      singleChartDoubleYConfig.rightSource2.value,
      singleChartDoubleYConfig.rightSource3.value,
      singleChartDoubleYConfig.rightSource4.value
    ]
  })

  // 计算属性 - 单图模式右Y轴颜色配置
  const singleChartRightColors = computed(() => {
    return [
      singleChartDoubleYConfig.rightColor1.value,
      singleChartDoubleYConfig.rightColor2.value,
      singleChartDoubleYConfig.rightColor3.value,
      singleChartDoubleYConfig.rightColor4.value
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

  // 显示视图配置对话框
  function showViewConfig() {
    viewConfigDialogVisible.value = true
  }

  // 应用视图配置
  function applyViewConfig(createChart: () => void) {
    // 在更新图表前先销毁并重新创建图表，确保清除所有残留数据
    createChart()
    viewConfigDialogVisible.value = false
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
  }

  // 应用数据源配置
  function applyDataSourceConfig(config: any) {
    // 应用FlowDeviation配置
    if (config.deviation) {
      // 应用Deviation轨迹配置
      deviationConfig.track1X.value = config.deviation.track1X || ''
      deviationConfig.track1Y.value = config.deviation.track1Y || ''
      deviationConfig.track2X.value = config.deviation.track2X || ''
      deviationConfig.track2Y.value = config.deviation.track2Y || ''
      deviationConfig.track3X.value = config.deviation.track3X || ''
      deviationConfig.track3Y.value = config.deviation.track3Y || ''
      deviationConfig.track4X.value = config.deviation.track4X || ''
      deviationConfig.track4Y.value = config.deviation.track4Y || ''
      // 应用Deviation颜色配置
      deviationConfig.track1Color.value = config.deviation.track1Color || ''
      deviationConfig.track2Color.value = config.deviation.track2Color || ''
      deviationConfig.track3Color.value = config.deviation.track3Color || ''
      deviationConfig.track4Color.value = config.deviation.track4Color || ''
    }

    // 单图模式下的数据源配置
    if (config.viewLayout === 'single' && config.sources) {
      if (config.yAxisConfig === 'single') {
        // 单Y轴模式
        singleChartConfig.source1.value = config.sources.source1 || ''
        singleChartConfig.source2.value = config.sources.source2 || ''
        singleChartConfig.source3.value = config.sources.source3 || ''
        singleChartConfig.source4.value = config.sources.source4 || ''
        // 应用颜色配置
        if (config.colors) {
          singleChartConfig.color1.value = config.colors.source1 || ''
          singleChartConfig.color2.value = config.colors.source2 || ''
          singleChartConfig.color3.value = config.colors.source3 || ''
          singleChartConfig.color4.value = config.colors.source4 || ''
        }
        // 应用区域配置
        if (config.area) {
          singleChartConfig.useArea1.value = config.area.source1 || ''
          singleChartConfig.useArea2.value = config.area.source2 || ''
          singleChartConfig.useArea3.value = config.area.source3 || ''
          singleChartConfig.useArea4.value = config.area.source4 || ''
        }
      } else if (config.yAxisConfig === 'double') {
        // 单图双Y轴模式
        singleChartDoubleYConfig.leftSource1.value = config.sources.left1 || ''
        singleChartDoubleYConfig.leftSource2.value = config.sources.left2 || ''
        singleChartDoubleYConfig.leftSource3.value = config.sources.left3 || ''
        singleChartDoubleYConfig.leftSource4.value = config.sources.left4 || ''
        singleChartDoubleYConfig.rightSource1.value = config.sources.right1 || ''
        singleChartDoubleYConfig.rightSource2.value = config.sources.right2 || ''
        singleChartDoubleYConfig.rightSource3.value = config.sources.right3 || ''
        singleChartDoubleYConfig.rightSource4.value = config.sources.right4 || ''
        // 应用颜色配置
        if (config.colors) {
          singleChartDoubleYConfig.leftColor1.value = config.colors.left1 || ''
          singleChartDoubleYConfig.leftColor2.value = config.colors.left2 || ''
          singleChartDoubleYConfig.leftColor3.value = config.colors.left3 || ''
          singleChartDoubleYConfig.leftColor4.value = config.colors.left4 || ''
          singleChartDoubleYConfig.rightColor1.value = config.colors.right1 || ''
          singleChartDoubleYConfig.rightColor2.value = config.colors.right2 || ''
          singleChartDoubleYConfig.rightColor3.value = config.colors.right3 || ''
          singleChartDoubleYConfig.rightColor4.value = config.colors.right4 || ''
        }
        // 应用区域配置
        if (config.area) {
          singleChartDoubleYConfig.leftUseArea1.value = config.area.left1 || false
          singleChartDoubleYConfig.leftUseArea2.value = config.area.left2 || false
          singleChartDoubleYConfig.leftUseArea3.value = config.area.left3 || false
          singleChartDoubleYConfig.leftUseArea4.value = config.area.left4 || false
          singleChartDoubleYConfig.rightUseArea1.value = config.area.right1 || false
          singleChartDoubleYConfig.rightUseArea2.value = config.area.right2 || false
          singleChartDoubleYConfig.rightUseArea3.value = config.area.right3 || false
          singleChartDoubleYConfig.rightUseArea4.value = config.area.right4 || false
        }
      }
    }
    
    // 双图模式下的数据源配置
    if (config.viewLayout === 'double') {
      // 上图数据源
      if (config.upperSources) {
        if (config.yAxisConfig === 'single') {
          doubleChartConfig.upperSource1.value = config.upperSources.source1 || ''
          doubleChartConfig.upperSource2.value = config.upperSources.source2 || ''
          doubleChartConfig.upperSource3.value = config.upperSources.source3 || ''
          doubleChartConfig.upperSource4.value = config.upperSources.source4 || ''
          // 应用颜色配置
          if (config.upperColors) {
            doubleChartConfig.upperColor1.value = config.upperColors.source1 || ''
            doubleChartConfig.upperColor2.value = config.upperColors.source2 || ''
            doubleChartConfig.upperColor3.value = config.upperColors.source3 || ''
            doubleChartConfig.upperColor4.value = config.upperColors.source4 || ''
          }
          // 应用区域配置
          if (config.upperArea) {
            doubleChartConfig.upperUseArea1.value = config.upperArea.source1 || ''
            doubleChartConfig.upperUseArea2.value = config.upperArea.source2 || ''
            doubleChartConfig.upperUseArea3.value = config.upperArea.source3 || ''
            doubleChartConfig.upperUseArea4.value = config.upperArea.source4 || ''
          }
        } else if (config.yAxisConfig === 'double') {
          doubleChartDoubleYConfig.upperLeftSource1.value = config.upperSources.left1 || ''
          doubleChartDoubleYConfig.upperLeftSource2.value = config.upperSources.left2 || ''
          doubleChartDoubleYConfig.upperLeftSource3.value = config.upperSources.left3 || ''
          doubleChartDoubleYConfig.upperLeftSource4.value = config.upperSources.left4 || ''
          doubleChartDoubleYConfig.upperRightSource1.value = config.upperSources.right1 || ''
          doubleChartDoubleYConfig.upperRightSource2.value = config.upperSources.right2 || ''
          doubleChartDoubleYConfig.upperRightSource3.value = config.upperSources.right3 || ''
          doubleChartDoubleYConfig.upperRightSource4.value = config.upperSources.right4 || ''
          // 应用颜色配置
          if (config.upperColors) {
            doubleChartDoubleYConfig.upperLeftColor1.value = config.upperColors.left1 || ''
            doubleChartDoubleYConfig.upperLeftColor2.value = config.upperColors.left2 || ''
            doubleChartDoubleYConfig.upperLeftColor3.value = config.upperColors.left3 || ''
            doubleChartDoubleYConfig.upperLeftColor4.value = config.upperColors.left4 || ''
            doubleChartDoubleYConfig.upperRightColor1.value = config.upperColors.right1 || ''
            doubleChartDoubleYConfig.upperRightColor2.value = config.upperColors.right2 || ''
            doubleChartDoubleYConfig.upperRightColor3.value = config.upperColors.right3 || ''
            doubleChartDoubleYConfig.upperRightColor4.value = config.upperColors.right4 || ''
          }
          // 应用区域配置
          if (config.upperArea) {
            doubleChartDoubleYConfig.upperLeftUseArea1.value = config.upperArea.left1 || ''
            doubleChartDoubleYConfig.upperLeftUseArea2.value = config.upperArea.left2 || ''
            doubleChartDoubleYConfig.upperLeftUseArea3.value = config.upperArea.left3 || ''
            doubleChartDoubleYConfig.upperLeftUseArea4.value = config.upperArea.left4 || ''
            doubleChartDoubleYConfig.upperRightUseArea1.value = config.upperArea.right1 || ''
            doubleChartDoubleYConfig.upperRightUseArea2.value = config.upperArea.right2 || ''
            doubleChartDoubleYConfig.upperRightUseArea3.value = config.upperArea.right3 || ''
            doubleChartDoubleYConfig.upperRightUseArea4.value = config.upperArea.right4 || ''
          }
        }
      }
      
      // 下图数据源
      if (config.lowerSources) {
        if (config.yAxisConfig === 'single') {
          doubleChartConfig.lowerSource1.value = config.lowerSources.source1 || ''
          doubleChartConfig.lowerSource2.value = config.lowerSources.source2 || ''
          doubleChartConfig.lowerSource3.value = config.lowerSources.source3 || ''
          doubleChartConfig.lowerSource4.value = config.lowerSources.source4 || ''
          // 应用颜色配置
          if (config.lowerColors) {
            doubleChartConfig.lowerColor1.value = config.lowerColors.source1 || ''
            doubleChartConfig.lowerColor2.value = config.lowerColors.source2 || ''
            doubleChartConfig.lowerColor3.value = config.lowerColors.source3 || ''
            doubleChartConfig.lowerColor4.value = config.lowerColors.source4 || ''
          }
          // 应用区域配置
          if (config.lowerArea) {
            doubleChartConfig.lowerUseArea1.value = config.lowerArea.source1 || ''
            doubleChartConfig.lowerUseArea2.value = config.lowerArea.source2 || ''
            doubleChartConfig.lowerUseArea3.value = config.lowerArea.source3 || ''
            doubleChartConfig.lowerUseArea4.value = config.lowerArea.source4 || ''
          }
        } else if (config.yAxisConfig === 'double') {
          doubleChartDoubleYConfig.lowerLeftSource1.value = config.lowerSources.left1 || ''
          doubleChartDoubleYConfig.lowerLeftSource2.value = config.lowerSources.left2 || ''
          doubleChartDoubleYConfig.lowerLeftSource3.value = config.lowerSources.left3 || ''
          doubleChartDoubleYConfig.lowerLeftSource4.value = config.lowerSources.left4 || ''
          doubleChartDoubleYConfig.lowerRightSource1.value = config.lowerSources.right1 || ''
          doubleChartDoubleYConfig.lowerRightSource2.value = config.lowerSources.right2 || ''
          doubleChartDoubleYConfig.lowerRightSource3.value = config.lowerSources.right3 || ''
          doubleChartDoubleYConfig.lowerRightSource4.value = config.lowerSources.right4 || ''
          // 应用颜色配置
          if (config.lowerColors) {
            doubleChartDoubleYConfig.lowerLeftColor1.value = config.lowerColors.left1 || ''
            doubleChartDoubleYConfig.lowerLeftColor2.value = config.lowerColors.left2 || ''
            doubleChartDoubleYConfig.lowerLeftColor3.value = config.lowerColors.left3 || ''
            doubleChartDoubleYConfig.lowerLeftColor4.value = config.lowerColors.left4 || ''
            doubleChartDoubleYConfig.lowerRightColor1.value = config.lowerColors.right1 || ''
            doubleChartDoubleYConfig.lowerRightColor2.value = config.lowerColors.right2 || ''
            doubleChartDoubleYConfig.lowerRightColor3.value = config.lowerColors.right3 || ''
            doubleChartDoubleYConfig.lowerRightColor4.value = config.lowerColors.right4 || ''
          }
          // 应用区域配置
          if (config.lowerArea) {
            doubleChartDoubleYConfig.lowerLeftUseArea1.value = config.lowerArea.left1 || ''
            doubleChartDoubleYConfig.lowerLeftUseArea2.value = config.lowerArea.left2 || ''
            doubleChartDoubleYConfig.lowerLeftUseArea3.value = config.lowerArea.left3 || ''
            doubleChartDoubleYConfig.lowerLeftUseArea4.value = config.lowerArea.left4 || ''
            doubleChartDoubleYConfig.lowerRightUseArea1.value = config.lowerArea.right1 || ''
            doubleChartDoubleYConfig.lowerRightUseArea2.value = config.lowerArea.right2 || ''
            doubleChartDoubleYConfig.lowerRightUseArea3.value = config.lowerArea.right3 || ''
            doubleChartDoubleYConfig.lowerRightUseArea4.value = config.lowerArea.right4 || ''
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

    // 收集Deviation配置
    if (deviationConfig.track1X.value || deviationConfig.track1Y.value) {
      config.deviation = {
        track1X: deviationConfig.track1X.value,
        track1Y: deviationConfig.track1Y.value,
        track2X: deviationConfig.track2X.value,
        track2Y: deviationConfig.track2Y.value,
        track3X: deviationConfig.track3X.value,
        track3Y: deviationConfig.track3Y.value,
        track4X: deviationConfig.track4X.value,
        track4Y: deviationConfig.track4Y.value,
        track1Color: deviationConfig.track1Color.value,
        track2Color: deviationConfig.track2Color.value,
        track3Color: deviationConfig.track3Color.value,
        track4Color: deviationConfig.track4Color.value
      }
    }
    
    // 根据当前布局和Y轴配置收集数据源配置
    if (viewLayout.value === 'single') {
      if (yAxisConfig.value === 'single') {
        // 单图单Y轴模式
        config.sources = {
          source1: singleChartConfig.source1.value,
          source2: singleChartConfig.source2.value,
          source3: singleChartConfig.source3.value,
          source4: singleChartConfig.source4.value
        }
        // 添加颜色配置
        config.colors = {
          source1: singleChartConfig.color1.value,
          source2: singleChartConfig.color2.value,
          source3: singleChartConfig.color3.value,
          source4: singleChartConfig.color4.value
        }
        config.area = {
          source1: singleChartConfig.useArea1.value,
          source2: singleChartConfig.useArea2.value,
          source3: singleChartConfig.useArea3.value,
          source4: singleChartConfig.useArea4.value,
        }
      } else {
        // 单图双Y轴模式
        config.sources = {
          left1: singleChartDoubleYConfig.leftSource1.value,
        left2: singleChartDoubleYConfig.leftSource2.value,
        left3: singleChartDoubleYConfig.leftSource3.value,
        left4: singleChartDoubleYConfig.leftSource4.value,
        right1: singleChartDoubleYConfig.rightSource1.value,
        right2: singleChartDoubleYConfig.rightSource2.value,
        right3: singleChartDoubleYConfig.rightSource3.value,
        right4: singleChartDoubleYConfig.rightSource4.value
        }
        // 添加颜色配置
        config.colors = {
          left1: singleChartDoubleYConfig.leftColor1.value,
          left2: singleChartDoubleYConfig.leftColor2.value,
          left3: singleChartDoubleYConfig.leftColor3.value,
          left4: singleChartDoubleYConfig.leftColor4.value,
          right1: singleChartDoubleYConfig.rightColor1.value,
          right2: singleChartDoubleYConfig.rightColor2.value,
          right3: singleChartDoubleYConfig.rightColor3.value,
          right4: singleChartDoubleYConfig.rightColor4.value
        }
        // 添加区域配置
        config.area = {
          left1: singleChartDoubleYConfig.leftUseArea1.value,
          left2: singleChartDoubleYConfig.leftUseArea2.value,
          left3: singleChartDoubleYConfig.leftUseArea3.value,
          left4: singleChartDoubleYConfig.leftUseArea4.value,
          right1: singleChartDoubleYConfig.rightUseArea1.value,
          right2: singleChartDoubleYConfig.rightUseArea2.value,
          right3: singleChartDoubleYConfig.rightUseArea3.value,
          right4: singleChartDoubleYConfig.rightUseArea4.value,
        }
      }
    } else {
      config.upperSources = {};
      config.lowerSources = {};
      
      if (yAxisConfig.value === 'single') {
        // 双图单Y轴模式
        config.upperSources = {
          source1: doubleChartConfig.upperSource1.value,
          source2: doubleChartConfig.upperSource2.value,
          source3: doubleChartConfig.upperSource3.value,
          source4: doubleChartConfig.upperSource4.value
        }
        config.lowerSources = {
          source1: doubleChartConfig.lowerSource1.value,
          source2: doubleChartConfig.lowerSource2.value,
          source3: doubleChartConfig.lowerSource3.value,
          source4: doubleChartConfig.lowerSource4.value
        }
        // 添加颜色配置
        config.upperColors = {
          source1: doubleChartConfig.upperColor1.value,
          source2: doubleChartConfig.upperColor2.value,
          source3: doubleChartConfig.upperColor3.value,
          source4: doubleChartConfig.upperColor4.value
        }
        config.lowerColors = {
          source1: doubleChartConfig.lowerColor1.value,
          source2: doubleChartConfig.lowerColor2.value,
          source3: doubleChartConfig.lowerColor3.value,
          source4: doubleChartConfig.lowerColor4.value
        }
        // 添加区域配置
        config.upperArea = {
          source1: doubleChartConfig.upperUseArea1.value,
          source2: doubleChartConfig.upperUseArea2.value,
          source3: doubleChartConfig.upperUseArea3.value,
          source4: doubleChartConfig.upperUseArea4.value,
        }
        config.lowerArea = {
          source1: doubleChartConfig.lowerUseArea1.value,
          source2: doubleChartConfig.lowerUseArea2.value,
          source3: doubleChartConfig.lowerUseArea3.value,
          source4: doubleChartConfig.lowerUseArea4.value,
        }
      } else {
        // 双图双Y轴模式
        config.upperSources = {
          left1: doubleChartDoubleYConfig.upperLeftSource1.value,
          left2: doubleChartDoubleYConfig.upperLeftSource2.value,
          left3: doubleChartDoubleYConfig.upperLeftSource3.value,
          left4: doubleChartDoubleYConfig.upperLeftSource4.value,
          right1: doubleChartDoubleYConfig.upperRightSource1.value,
          right2: doubleChartDoubleYConfig.upperRightSource2.value,
          right3: doubleChartDoubleYConfig.upperRightSource3.value,
          right4: doubleChartDoubleYConfig.upperRightSource4.value
        }
        config.lowerSources = {
          left1: doubleChartDoubleYConfig.lowerLeftSource1.value,
          left2: doubleChartDoubleYConfig.lowerLeftSource2.value,
          left3: doubleChartDoubleYConfig.lowerLeftSource3.value,
          left4: doubleChartDoubleYConfig.lowerLeftSource4.value,
          right1: doubleChartDoubleYConfig.lowerRightSource1.value,
          right2: doubleChartDoubleYConfig.lowerRightSource2.value,
          right3: doubleChartDoubleYConfig.lowerRightSource3.value,
          right4: doubleChartDoubleYConfig.lowerRightSource4.value
        }
        // 添加颜色配置
        config.upperColors = {
          left1: doubleChartDoubleYConfig.upperLeftColor1.value,
          left2: doubleChartDoubleYConfig.upperLeftColor2.value,
          left3: doubleChartDoubleYConfig.upperLeftColor3.value,
          left4: doubleChartDoubleYConfig.upperLeftColor4.value,
          right1: doubleChartDoubleYConfig.upperRightColor1.value,
          right2: doubleChartDoubleYConfig.upperRightColor2.value,
          right3: doubleChartDoubleYConfig.upperRightColor3.value,
          right4: doubleChartDoubleYConfig.upperRightColor4.value
        }
        config.lowerColors = {
          left1: doubleChartDoubleYConfig.lowerLeftColor1.value,
          left2: doubleChartDoubleYConfig.lowerLeftColor2.value,
          left3: doubleChartDoubleYConfig.lowerLeftColor3.value,
          left4: doubleChartDoubleYConfig.lowerLeftColor4.value,
          right1: doubleChartDoubleYConfig.lowerRightColor1.value,
          right2: doubleChartDoubleYConfig.lowerRightColor2.value,
          right3: doubleChartDoubleYConfig.lowerRightColor3.value,
          right4: doubleChartDoubleYConfig.lowerRightColor4.value
        }
        // 添加区域配置
        config.upperArea = {
          left1: doubleChartDoubleYConfig.upperLeftUseArea1.value,
          left2: doubleChartDoubleYConfig.upperLeftUseArea2.value,
          left3: doubleChartDoubleYConfig.upperLeftUseArea3.value,
          left4: doubleChartDoubleYConfig.upperLeftUseArea4.value,
          right1: doubleChartDoubleYConfig.upperRightUseArea1.value,
          right2: doubleChartDoubleYConfig.upperRightUseArea2.value,
          right3: doubleChartDoubleYConfig.upperRightUseArea3.value,
          right4: doubleChartDoubleYConfig.upperRightUseArea4.value,
        }
        config.lowerArea = {
          left1: doubleChartDoubleYConfig.lowerLeftUseArea1.value,
          left2: doubleChartDoubleYConfig.lowerLeftUseArea2.value,
          left3: doubleChartDoubleYConfig.lowerLeftUseArea3.value,
          left4: doubleChartDoubleYConfig.lowerLeftUseArea4.value,
          right1: doubleChartDoubleYConfig.lowerRightUseArea1.value,
          right2: doubleChartDoubleYConfig.lowerRightUseArea2.value,
          right3: doubleChartDoubleYConfig.lowerRightUseArea3.value,
          right4: doubleChartDoubleYConfig.lowerRightUseArea4.value,
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

    // 配置对象
    deviationConfig,
    singleChartConfig,
    singleChartDoubleYConfig,
    doubleChartConfig,
    doubleChartDoubleYConfig,

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
    // 工具函数
    getRandomColor,
    // 方法
    showViewConfig,
    applyViewConfig,
    exportConfigFile,
    validateAndApplyConfig
  }
}