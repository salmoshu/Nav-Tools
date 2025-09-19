import { ref, computed } from 'vue'
import { useFlow } from '@/composables/flow/useFlow'
import { defineStore } from 'pinia'

// 元数据属性列表 - 这些属性不应被添加到status中
const META_PROPERTIES = ['plotTime', 'timestamp', 'isBatchData', 'rawString', 'rawDataKeys']

// 安全执行简单表达式的函数 - 完全不使用eval或Function
function safeEvaluateExpression(expr: string, context: Record<string, any>): any {
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
    
    // 简单表达式解析器 - 支持基本的数学运算和flowData访问
    // 这个版本会将表达式解析为tokens，然后手动计算结果
    
    // 1. 先替换所有的flowData访问为实际值
    let processedExpr = expr
    
    // 处理 flowData.fieldName 格式
    const dotAccessRegex = /flowData\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g
    let match: RegExpExecArray | null
    
    while ((match = dotAccessRegex.exec(processedExpr)) !== null) {
      const [fullMatch, field] = match
      if (context.flowData && Array.isArray(context.flowData[field]) && context.flowData[field].length > 0) {
        const value = context.flowData[field][context.flowData[field].length - 1]
        // 替换为实际值，确保数字周围有空格以便后续解析
        processedExpr = processedExpr.replace(fullMatch, String(value))
      } else {
        processedExpr = processedExpr.replace(fullMatch, '0')
      }
    }
    
    // 处理 flowData["fieldName"] 格式
    const bracketAccessRegex = /flowData\[(?:"([^"]+)"|'([^']+)')\]/g
    while ((match = bracketAccessRegex.exec(processedExpr)) !== null) {
      const [fullMatch, quotedKey1, quotedKey2] = match
      const key = quotedKey1 || quotedKey2
      if (key && context.flowData && Array.isArray(context.flowData[key]) && context.flowData[key].length > 0) {
        const value = context.flowData[key][context.flowData[key].length - 1]
        processedExpr = processedExpr.replace(fullMatch, String(value))
      } else {
        processedExpr = processedExpr.replace(fullMatch, '0')
      }
    }
    
    // 新增：处理直接引用的字段名 (如 camera_angle)
    const directFieldRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b(?![.\(])/g
    // 首先收集所有可能的匹配项
    const matches = [...processedExpr.matchAll(directFieldRegex)]
    // 按长度降序排序，确保较长的字段名优先匹配
    matches.sort((a, b) => b[0].length - a[0].length)
    
    for (const match of matches) {
      const field = match[0]
      // 跳过数字、Math函数名和已经处理过的关键词
      if (!isNaN(Number(field)) || 
          ['abs', 'sqrt', 'pow', 'sin', 'cos', 'tan', 'round', 'floor', 'ceil', 'max', 'min', 'PI', 'E'].includes(field) ||
          dangerousKeywords.includes(field)) {
        continue
      }
      
      if (context.flowData && Array.isArray(context.flowData[field]) && context.flowData[field].length > 0) {
        const value = context.flowData[field][context.flowData[field].length - 1]
        // 使用正则表达式替换所有匹配项
        const regex = new RegExp(`\\b${field}\\b(?![.\\(])`, 'g')
        processedExpr = processedExpr.replace(regex, String(value))
      }
    }
    
    // 2. 替换常见的Math函数调用
    const mathFunctionRegex = /([a-zA-Z]+)\(([^)]*)\)/g
    while ((match = mathFunctionRegex.exec(processedExpr)) !== null) {
      const [fullMatch, funcName, args] = match
      const mathFunctions: Record<string, any> = {
        abs: Math.abs,
        sqrt: Math.sqrt,
        pow: Math.pow,
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        round: Math.round,
        floor: Math.floor,
        ceil: Math.ceil,
        max: Math.max,
        min: Math.min,
        PI: Math.PI,
        E: Math.E
      }
      
      if (mathFunctions[funcName]) {
        try {
          // 这里我们需要计算参数值，然后应用Math函数
          // 对于简单参数，我们可以使用eval的安全替代方案
          const argsValue = args.split(',').map(arg => {
            // 尝试将参数解析为数字
            const num = parseFloat(arg.trim())
            return isNaN(num) ? arg.trim() : num
          })
          
          // 应用Math函数
          const result = (mathFunctions[funcName] as Function).apply(null, argsValue)
          processedExpr = processedExpr.replace(fullMatch, String(result))
        } catch (e) {
          throw new Error('Math函数执行错误: ' + funcName)
        }
      }
    }
    
    // 3. 处理简单的数学表达式 - 这是一个简化版的计算器
    // 注意：这个简单计算器只支持基本的四则运算和括号
    // 对于更复杂的表达式，我们需要更复杂的解析器
    const result = calculateSimpleExpression(processedExpr)
    
    // 确保返回值要么是数字要么是null
    if (result === null || result === undefined) {
      return null
    }
    
    // 尝试将结果转换为数字
    const numResult = Number(result)
    if (!isNaN(numResult)) {
      return numResult
    }
    
    // 如果转换失败，返回null而不是原始值
    return null
  } catch (error) {
    console.error('表达式执行错误:', error)
    // 出错时返回null而不是抛出异常
    return null
  }
}

// 简单表达式计算器 - 不使用eval或Function
function calculateSimpleExpression(expression: string): any {
  // 这个函数实现了一个简单的表达式计算器
  // 它支持基本的四则运算和括号
  
  // 首先检查表达式是否只包含数字和运算符
  const numRegex = /^[0-9.+\-*/()\s]+$/;
  if (!numRegex.test(expression)) {
    // 如果表达式包含非数字和运算符的内容，直接返回该内容
    return expression
  }
  
  try {
    // 使用一个非常有限的白名单方法来计算表达式
    // 1. 替换所有的括号表达式
    const evaluateParentheses = (expr: string): string => {
      const parenthesisRegex = /\(([^()]+)\)/
      let result = expr
      let match: RegExpExecArray | null
      
      while ((match = parenthesisRegex.exec(result)) !== null) {
        const [fullMatch, innerExpr] = match
        const innerResult = evaluateSimple(innerExpr)
        result = result.replace(fullMatch, String(innerResult))
      }
      
      return result
    }
    
    // 2. 计算没有括号的简单表达式
    const evaluateSimple = (expr: string): number => {
      // 处理乘法和除法
      const multDivRegex = /(-?\d+\.?\d*)\s*([*\/])\s*(-?\d+\.?\d*)/
      let result = expr
      let match: RegExpExecArray | null
      
      while ((match = multDivRegex.exec(result)) !== null) {
        const [fullMatch, left, operator, right] = match
        let calculated = 0
        
        if (operator === '*') {
          calculated = parseFloat(left) * parseFloat(right)
        } else if (operator === '/') {
          calculated = parseFloat(left) / parseFloat(right)
        }
        
        result = result.replace(fullMatch, String(calculated))
      }
      
      // 处理加法和减法
      const addSubRegex = /(-?\d+\.?\d*)\s*([+-])\s*(-?\d+\.?\d*)/
      while ((match = addSubRegex.exec(result)) !== null) {
        const [fullMatch, left, operator, right] = match
        let calculated = 0
        
        if (operator === '+') {
          calculated = parseFloat(left) + parseFloat(right)
        } else if (operator === '-') {
          calculated = parseFloat(left) - parseFloat(right)
        }
        
        result = result.replace(fullMatch, String(calculated))
      }
      
      return parseFloat(result)
    }
    
    // 先处理括号，再计算简单表达式
    const withoutParentheses = evaluateParentheses(expression)
    return evaluateSimple(withoutParentheses)
  } catch (error) {
    throw new Error('表达式计算错误: ' + (error as Error).message)
  }
}

export const useFlowStore = defineStore('flow', () => {
  const { flowData } = useFlow()
  
  // 存储自定义状态配置
  // 1. 修改 customStatusConfigs 的类型定义
  const customStatusConfigs = ref<Array<{
    fieldName: string
    decimalPlaces: number
    color: string
    isCodeDefinition?: boolean
    code?: string
  }>>([])
  
  // 2. 修改 status 计算属性，为批量数据生成完整的计算值
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
            fieldName: config.fieldName
          }
          
          // 使用安全的表达式执行函数
          let value = safeEvaluateExpression(config.code, context)
          
          // 如果是数字，按照指定的小数位数格式化
          if (typeof value === 'number') {
            value = Number(value.toFixed(config.decimalPlaces))
          }
          
          // 使用字段名作为键
          result[config.fieldName] = value
          
          // 确保计算属性存在于flowData中且为数组
          if (!(config.fieldName in flowData.value) || !Array.isArray(flowData.value[config.fieldName])) {
            flowData.value[config.fieldName] = []
          }
          
          // 确保计算属性与原始数据长度一致
          const dataArray = flowData.value[config.fieldName] as any[]
          const timestampsLength = flowData.value.timestamp?.length || 0
          
          // 只在数据不足时重新计算所有值
          if (dataArray.length < timestampsLength) {
            // 清空数组，重新计算所有值
            dataArray.length = 0
            
            // 为每个时间点计算值
            for (let i = 0; i < timestampsLength; i++) {
              try {
                // 创建包含当前时间点数据的上下文
                const timePointContext = {
                  flowData: {
                    ...flowData.value,
                  },
                  fieldName: config.fieldName
                }
                
                // 计算当前时间点的值
                let timePointValue = safeEvaluateExpression(config.code, timePointContext)
                
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
    
    // 初始化flowData中的自定义字段为数组，确保只包含数字或null
    if (!(config.fieldName in flowData.value) || !Array.isArray(flowData.value[config.fieldName])) {
      flowData.value[config.fieldName] = []
      
      // 如果已有数据，为新字段填充null值以保持长度一致
      const timestampsLength = flowData.value.timestamp?.length || 0
      if (timestampsLength > 0) {
        const dataArray = flowData.value[config.fieldName] as any[]
        for (let i = 0; i < timestampsLength - 1; i++) {
          dataArray.push(null)
        }
      }
    } else {
      // 清理现有数据，确保只包含数字或null
      const dataArray = flowData.value[config.fieldName] as any[]
      for (let i = 0; i < dataArray.length; i++) {
        const value = dataArray[i]
        if (value === null || value === undefined) {
          // 保留null值
          continue
        }
        
        const numValue = Number(value)
        if (!isNaN(numValue)) {
          dataArray[i] = numValue
        } else {
          dataArray[i] = null
        }
      }
    }
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
