import { ref, computed } from 'vue'
import { useFlow } from '@/composables/flow/useFlow'
import { defineStore } from 'pinia'

// 元数据属性列表 - 这些属性不应被添加到status中
const META_PROPERTIES = ['timestamps', 'timestamp', 'isBatchData', 'rawString']

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
    
    // 2. 替换常见的Math函数调用
    const mathFunctionRegex = /Math\.([a-zA-Z]+)\(([^)]*)\)/g
    while ((match = mathFunctionRegex.exec(processedExpr)) !== null) {
      const [fullMatch, funcName, args] = match
      const mathFunctions: Record<string, Function> = {
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
        // PI: Math.PI,
        // E: Math.E
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
    return calculateSimpleExpression(processedExpr)
  } catch (error) {
    console.error('表达式执行错误:', error)
    throw error
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
      const multDivRegex = /(-?\d+\.?\d*)([*/])(-?\d+\.?\d*)/
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
      const addSubRegex = /(-?\d+\.?\d*)([+-])(-?\d+\.?\d*)/
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
  const customStatusConfigs = ref<Array<{
    fieldName: string
    displayName: string
    decimalPlaces: number
    color: string
    isCodeDefinition?: boolean
    code?: string
  }>>([])
  
  // 创建响应式的status对象
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
          
          // 使用配置的显示名称
          result[config.displayName] = value
        } catch (error) {
          console.error('Error executing custom status code:', error)
          // 出错时设置为错误信息
          result[config.displayName] = 'Error: ' + (error as Error).message
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
          // 使用配置的显示名称
          result[config.displayName || config.fieldName] = value
        }
      }
    })
    
    return result
  })
  
  // 添加自定义状态配置
  const addCustomStatus = (config: {
    fieldName: string
    displayName: string
    decimalPlaces: number
    color: string
    isCodeDefinition?: boolean
    code?: string
  }) => {
    // 检查是否已存在相同的配置
    const existingIndex = customStatusConfigs.value.findIndex(
      c => c.displayName === config.displayName
    )
    
    if (existingIndex === -1) {
      // 添加新配置
      customStatusConfigs.value.push(config)
    } else {
      // 更新现有配置
      customStatusConfigs.value[existingIndex] = config
    }
  }
  
  // 移除自定义状态配置
  const removeCustomStatus = (displayName: string) => {
    customStatusConfigs.value = customStatusConfigs.value.filter(
      config => config.displayName !== displayName
    )
  }
  
  return {
    status,
    customStatusConfigs,
    addCustomStatus,
    removeCustomStatus
  }
})
