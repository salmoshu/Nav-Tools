import { ref, computed } from 'vue'
import { useFlow } from '@/composables/flow/useFlow'
import { defineStore } from 'pinia'
import { create, all } from 'mathjs';

const math = create(all);

// 元数据属性列表 - 这些属性不应被添加到status中
const META_PROPERTIES = ['plotTime', 'timestamp', 'isBatchData', 'rawString', 'rawDataKeys']

// 安全执行简单表达式的函数 - 完全不使用eval或Function
function evaluateExpression(expr: string, context: Record<string, any>): any {
  try {
    // 移除所有空白字符，便于解析
    const trimmedExpr = expr.replace(/\s+/g, '')
    
    // 检查表达式是否为空
    if (!trimmedExpr) {
      throw new Error('表达式不能为空')
    }
    
    // 检查表达式是否包含不允许的字符
    const allowedChars = /^[0-9.+\-*/()\[\]{}_a-zA-Z."'|>=<%,]+$/;
    if (!allowedChars.test(trimmedExpr)) {
      throw new Error('表达式包含不允许的字符')
    }
    
    // 检查是否包含危险的关键词
    const dangerousKeywords = ['eval', 'Function', 'constructor', 'prototype', 'import', 'require']
    for (const keyword of dangerousKeywords) {
      if (trimmedExpr.toLowerCase().includes(keyword)) {
        throw new Error('表达式包含不允许的关键词: ' + keyword)
      }
    }
    
    // 先替换所有的flowData访问为实际值
    let processedExpr = trimmedExpr
    for (const key of context.flowData.rawDataKeys) {
      if (trimmedExpr.includes(key)) {
        if (context.flowData[key][context.index]) {
          processedExpr = processedExpr.replace(new RegExp(key, 'g'), context.flowData[key][context.index])
        } else {
          return null
        }
      }
    }

    return math.evaluate(processedExpr)
  } catch (error) {
    console.error('表达式执行错误:', error)
    return null
  }
}

export const useFlowStore = defineStore('flow', () => {
  const { flowData } = useFlow()
  
  // 存储自定义状态配置
  const customStatusConfigs = ref<Array<{
    fieldName: string
    decimalPlaces: number
    color: string
    isCodeDefinition?: boolean
    code?: string
  }>>([])
  
  // 2. 修改 status 计算属性
  const status = computed(() => {
    const result: Record<string, any> = {} 
    // 检查flowData是否有数据
    const hasData = Object.keys(flowData.value).some(key => {
      // 跳过元数据属性
      if (META_PROPERTIES.includes(key)) return false
      
      // 检查是否为数组并且有数据
      const value = flowData.value[key]
      return Array.isArray(value) && value.length > 0
    })
    
    // 当没有数据时，返回空对象
    if (!hasData) {
      return result
    }
    
    // 首先添加默认的状态属性
    Object.keys(flowData.value).forEach(key => {
      // 跳过元数据属性
      if (META_PROPERTIES.includes(key)) return
      
      const value = flowData.value[key]
      // 检查是否为数组并且有数据
      if (Array.isArray(value) && value.length > 0) {
        // 使用数组的最后一个元素作为值
        result[key] = value[value.length - 1]
      }
    })
    
    // 然后添加自定义状态属性
    customStatusConfigs.value.forEach(config => {
      // 检查是否为代码定义的属性
      if (config.isCodeDefinition && config.code) {
        try {
          // 创建上下文对象
          const context = {
            flowData: flowData.value,
            fieldName: config.fieldName,
            index: flowData.value.timestamp ? (flowData.value.timestamp.length - 1) : 0,
          }
          
          // 使用安全的表达式执行函数
          let value = evaluateExpression(config.code, context)
          
          // 如果是数字，按照指定的小数位数格式化
          if (typeof value === 'number') {
            value = Number(value.toFixed(config.decimalPlaces))
          }
          
          // 使用字段名作为键
          result[config.fieldName] = value

          const dataArray = flowData.value[config.fieldName] as any[]
          const timestampsLength = flowData.value.timestamp?.length || 0

          // 只在数据不足时重新计算所有值
          if (dataArray.length < timestampsLength) {
            // 清空数组，重新计算所有值
            const beginIndex = dataArray.length-1;
            
            // 为每个时间点计算值
            for (let i = beginIndex; i < timestampsLength; i++) {
              try {
                // 创建包含当前时间点数据的上下文
                const timePointContext = {
                  flowData: {
                    ...flowData.value,
                  },
                  fieldName: config.fieldName,
                  index: i
                }
                
                // 计算当前时间点的值
                let timePointValue = evaluateExpression(config.code, timePointContext)
                
                // 格式化数值
                if (typeof timePointValue === 'number') {
                  timePointValue = Number(timePointValue.toFixed(config.decimalPlaces))
                }
                
                dataArray.push(timePointValue)
              } catch (e) {
                dataArray.push(null)
              }
            }
          }
        } catch (error) {
          console.error('Error executing custom status code:', error)
          // 出错时设置为错误信息
          result[config.fieldName] = 'Error: ' + (error as Error).message
        }
      } else {
        // 普通字段配置
        const dataArray = flowData.value[config.fieldName] as any[]
        if (dataArray && dataArray.length > 0) {
          // 获取最后一个元素
          let value = dataArray[dataArray.length - 1]
          // 如果是数字，按照指定的小数位数格式化
          if (typeof value === 'number') {
            value = Number(value.toFixed(config.decimalPlaces))
          }
          // 使用字段名作为键
          result[config.fieldName] = value
        }
      }
    })
    
    return result
  })

  const initCustomStatus = (config: {
    fieldName: string
    decimalPlaces: number
    color: string
    isCodeDefinition?: boolean
    code?: string
  }) => {
    const timestampsLength = flowData.value.timestamp?.length || 0
    if (timestampsLength === 0 || !config.isCodeDefinition || !config.code) {
      return
    }

    if (!(config.fieldName in flowData.value)) {
      flowData.value[config.fieldName] = []
    }

    const dataArray = flowData.value[config.fieldName] as any[]

    for (let i = 0; i < timestampsLength; i++) {
      try {
        // 创建包含当前时间点数据的上下文
        const timePointContext = {
          flowData: {
            ...flowData.value,
          },
          fieldName: config.fieldName,
          index: i
        }
        
        // 计算当前时间点的值
        let timePointValue = evaluateExpression(config.code, timePointContext)
        
        // 格式化数值
        if (typeof timePointValue === 'number') {
          timePointValue = Number(timePointValue.toFixed(config.decimalPlaces))
        }

        if (dataArray.length !== timestampsLength) {
          dataArray.push(timePointValue)
        } else {
          dataArray[i] = timePointValue
        }
      } catch (error) {
        if (dataArray.length !== timestampsLength) {
          dataArray.push(null)
        } else {
          dataArray[i] = null
        }
      }
    }

    // 等效变化plotTime从而触发更新
    const lastPlotTime = flowData.value.plotTime?.[flowData.value.plotTime.length - 1]
    if (lastPlotTime !== undefined) {
      flowData.value.plotTime?.push(lastPlotTime)
    }
    setTimeout(() => {
      flowData.value.plotTime?.pop()
    }, 2)
  }

  // 3. 修改 addNewStatus 函数
  const addNewStatus = (config: {
    fieldName: string
    decimalPlaces: number
    color: string
    isCodeDefinition?: boolean
    code?: string
  }) => {
    // 检查是否已存在相同的配置
    const existingIndex = customStatusConfigs.value.findIndex(
      c => c.fieldName === config.fieldName
    )
    
    if (existingIndex === -1) {
      // 添加新配置
      customStatusConfigs.value.push(config)
    } else {
      // 更新现有配置
      customStatusConfigs.value[existingIndex] = config
    }

    // 初始化新配置
    initCustomStatus(config)
  }

  // 4. 修改 removeCustomStatus 函数
  const removeCustomStatus = (fieldName: string) => {
    // 移除配置
    customStatusConfigs.value = customStatusConfigs.value.filter(
      config => config.fieldName !== fieldName
    )
    
    // 从flowData中删除对应的字段
    if (fieldName in flowData.value) {
      // 注意：可能不能直接删除flowData中的属性，因为它是响应式对象
      // 可以将其设置为空数组来清理数据
      // flowData.value[fieldName] = []
      delete flowData.value[fieldName]
    }
  }
    
  // 清除所有自定义状态属性
  const clearAllCustomStatus = () => {
    // 保存所有自定义属性的名称
    const customFieldNames = customStatusConfigs.value.map(config => config.fieldName)
    
    // 清空配置数组
    customStatusConfigs.value = []
    
    // 从flowData中删除所有自定义字段
    customFieldNames.forEach(fieldName => {
    if (fieldName in flowData.value) {
    // 对于响应式对象，我们不能直接删除属性，但可以将其设置为空数组
    flowData.value[fieldName] = []
    }
    })
    }
    
    // 在return语句中导出新函数
    return {
    status,
    customStatusConfigs,
    addNewStatus,
    removeCustomStatus,
    clearAllCustomStatus
    }
  })
