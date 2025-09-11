import { ref } from "vue"

// 时间间隔常量
const dt = 1/10

// 主数据存储对象，只包含时间相关的已知选项
const flowData = ref<{
  timestamps?: number[]
  timestamp?: number
  isBatchData?: boolean
  rawString?: string
  [key: string]: any[] | number | string | boolean | undefined
}>({
  timestamps: [],
  timestamp: 0,
  isBatchData: false,
  rawString: ''
})

export function useFlow() {
  const clearRawData = () => {
    // 重置所有数据
    flowData.value = {
      timestamps: [],
      timestamp: 0,
      isBatchData: false,
      rawString: ''
    }
  }

  const initRawData = (data: string, startTime: number=0) => {
    flowData.value.isBatchData = true
    flowData.value.timestamp = startTime
    const lines = data.split("\n")
    
    // 清除之前的所有数据
    clearRawData()
    flowData.value.isBatchData = true
    flowData.value.timestamp = startTime
    
    for (const line of lines) {
      if (line.trim() !== "") {
        try {
          const json = JSON.parse(line)
          
          // 自适应添加新的数据源字段
          Object.keys(json).forEach(key => {
            if (!(key in flowData.value) && key !== 'time') {
              flowData.value[key] = []
            }
          })
          
          // 处理时间戳
          if (typeof json.time === 'number') {
            if (flowData.value.timestamp === 0) {
              // 增加一个极小量 0.0005，以处理为0的情况
              flowData.value.timestamp = Number(json.time) - 0.0005
            }
            flowData.value.timestamps!.push(Number(json.time) - flowData.value.timestamp!)
          } else {
            // 如果没有time属性，则假设数据为20Hz
            flowData.value.timestamps!.push(flowData.value.timestamp!)
            flowData.value.timestamp! += dt
          }
          
          // 存储数据
          Object.keys(json).forEach(key => {
            if (key !== 'time' && Array.isArray(flowData.value[key])) {
              // 对特定字段进行类型转换
              if (key === 'pid_left_speed' || key === 'pid_right_speed') {
                (flowData.value[key] as any[]).push(Number(json[key]))
              } else {
                (flowData.value[key] as any[]).push(json[key])
              }
            }
          })
        } catch (error) {
          console.log('json解析失败', error)
        }
      }
    }
  }

  const addNullData = () => {
    // 数据间隔超过1s则存储null作为分隔
    const now = Date.now() / 1000
    flowData.value.timestamps!.push(now - flowData.value.timestamp! - 0.5)
    
    // 为所有数据字段添加null
    Object.keys(flowData.value).forEach(key => {
      if (Array.isArray(flowData.value[key]) && key !== 'timestamps') {
        (flowData.value[key] as any[]).push(null)
      }
    })
  }

  const addRawData = (data: string) => {
    if (flowData.value.isBatchData) {
      clearRawData()
      flowData.value.isBatchData = false
    }
    
    // 处理原始字符串
    flowData.value.rawString! += data
    
    if (flowData.value.rawString!.indexOf('\n') === -1) {
      return
    }
    
    const lines = flowData.value.rawString!.split('\n')
    flowData.value.rawString = lines[lines.length - 1]
    
    for (const line of lines) {
      if (line.trim() !== "") {
        try {
          const json = JSON.parse(line)
          
          // 自适应添加新的数据源字段
          Object.keys(json).forEach(key => {
            if (!(key in flowData.value) && key !== 'time') {
              flowData.value[key] = []
            }
          })
          
          // 处理时间戳
          if (typeof json.time === 'number') {
            if (flowData.value.timestamp === 0) {
              // 增加一个极小量 0.0005，以处理为0的情况
              flowData.value.timestamp = Number(json.time) - 0.0005
            }
            flowData.value.timestamps!.push(Number(json.time) - flowData.value.timestamp!)
          } else {
            const now = Date.now() / 1000
            if (flowData.value.timestamp === 0) {
              flowData.value.timestamp = now
            }
            const lastTimestamp = flowData.value.timestamp + flowData.value.timestamps![flowData.value.timestamps!.length - 1]
            if (lastTimestamp && now - lastTimestamp > 1) {
              addNullData()
            }
            flowData.value.timestamps!.push(now - flowData.value.timestamp!)
          }
          
          // 存储数据
          Object.keys(json).forEach(key => {
            if (key !== 'time' && Array.isArray(flowData.value[key])) {
              // 对特定字段进行类型转换
              if (key === 'pid_left_speed' || key === 'pid_right_speed') {
                (flowData.value[key] as any[]).push(Number(json[key]))
              } else {
                (flowData.value[key] as any[]).push(json[key])
              }
            }
          })
        } catch (error) {
          console.log('json解析失败', error)
        }
      }
    }
  }
  
  const saveData = () => {
    // 获取第一个数据字段的长度作为基准
    const firstField = Object.keys(flowData.value).find(key => 
      key !== 'timestamps' && 
      key !== 'timestamp' && 
      key !== 'isBatchData' && 
      key !== 'rawString' && 
      Array.isArray(flowData.value[key])
    )
    
    const dataLength = firstField ? (flowData.value[firstField] as any[]).length : 0
    
    // 创建符合要求的格式数据
    const formattedData = Array.from({ length: dataLength }).map((_, index) => {
      const item: {[key: string]: any} = {
        time: flowData.value.timestamps![index] // 使用已有的时间戳
      }
      
      // 添加所有非元数据字段
      Object.keys(flowData.value).forEach(key => {
        if (key !== 'timestamps' && 
            key !== 'timestamp' && 
            key !== 'isBatchData' && 
            key !== 'rawString' && 
            Array.isArray(flowData.value[key])) {
          item[key] = flowData.value[key]![index]
        }
      })
      
      return item
    });
    
    // 生成每行一个JSON对象的文件内容
    const fileContent = formattedData.map(item => JSON.stringify(item)).join('\n');
    
    // 创建Blob并下载文件
    const blob = new Blob([fileContent], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const now = new Date();
    // 格式化为：YYYY-MM-DDTHH-mm-ssZ，不含毫秒
    const timestamp = now.getUTCFullYear() + '-' +
      String(now.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(now.getUTCDate()).padStart(2, '0') + 'T' +
      String(now.getUTCHours()).padStart(2, '0') + '-' +
      String(now.getUTCMinutes()).padStart(2, '0') + '-' +
      String(now.getUTCSeconds()).padStart(2, '0') + 'Z';
    a.download = `Nav-Tools_${timestamp}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  
  return {
    flowData,
    addRawData,
    initRawData,
    clearRawData,
    saveData
  }
}
