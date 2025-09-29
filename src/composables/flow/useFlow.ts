import { computed, ref } from "vue"

type FlowDataType = {
  plotTime?: number[]
  timestamp?: number[]
  startTime?: number
  isBatchData?: boolean
  rawString?: string
  rawDataKeys?: string[]
  [key: string]: any[] | number | string | boolean | undefined
};

// 主数据存储对象，只包含时间相关的已知选项
const flowData = ref<FlowDataType>({
  plotTime: [],
  timestamp: [],
  startTime: 0,
  isBatchData: false,
  rawString: '',
  rawDataKeys: []
});

// 如果开启滑窗，则显示100条数据
const enableWindow = ref(false);
const plotData = computed<FlowDataType>(() => {
  if (enableWindow.value) {
    const result: FlowDataType = {};
    for (const key in flowData.value) {
      const value = flowData.value[key];
      if (Array.isArray(value)) {
        result[key] = value.slice(-100);
      } else {
        result[key] = value;
      }
    }
    return result;
  } else {
    return flowData.value;
  }
});

export function useFlow() {
  const clearRawData = () => {
    // 重置所有数据
    flowData.value = {
      plotTime: [],
      timestamp: [],
      startTime: 0,
      isBatchData: false,
      rawString: '',
      rawDataKeys: []
    }
  }

  const initRawData = (data: string) => {
    clearRawData()
    const lines = data.split("\n")
    flowData.value.isBatchData = true
    
    for (const line of lines) {
      if (line.trim() !== "") {
        try {
          const time_reg = /^\d{2}:\d{2}:\d{2}\.\d+(?:\.\d+)?:/;
          const cleanedLine = line.replace(time_reg, '').trim()

          if (cleanedLine.indexOf('{') === -1 || cleanedLine.indexOf('}') === -1) {
            continue
          }
          const json = JSON.parse(cleanedLine)
          
          // 自适应添加新的数据源字段
          Object.keys(json).forEach(key => {
            if (!(key in flowData.value) && key !== 'time') {
              flowData.value[key] = []
              flowData.value.rawDataKeys!.push(key)
            }
          })
          
          // 处理时间戳
          if (typeof json.time === 'number') {
            if (flowData.value.plotTime?.length == 0) {
              flowData.value.startTime = Number(json.time)
            }
            flowData.value.plotTime!.push(Number(json.time) - flowData.value.startTime!)
            flowData.value.timestamp!.push(Number(json.time))
          } else {
            // 如果没有time属性，则按照样本逐一展示
            if (flowData.value.plotTime?.length == 0) {
              flowData.value.startTime = 0
              flowData.value.plotTime!.push(0)
              flowData.value.timestamp!.push(0)
            } else {
              const lastTimestamp = flowData.value.timestamp![flowData.value.timestamp!.length - 1]
              flowData.value.plotTime!.push(lastTimestamp + 1)
              flowData.value.timestamp!.push(lastTimestamp + 1)
            }
          }
          
          // 存储数据
          Object.keys(json).forEach(key => {
            if (key !== 'time' && Array.isArray(flowData.value[key])) {
              (flowData.value[key] as any[]).push(json[key])
            }
          })
        } catch (error) {
          // console.log(`json解析失败: ${error}`)
        }
      }
    }
  }

  const addNullData = (now: number) => {
    // 数据间隔超过1s则存储null作为分隔
    flowData.value.plotTime!.push(now - flowData.value.startTime! - 0.5)
    flowData.value.timestamp!.push(now - 0.5)

    // 为所有数据字段添加null
    Object.keys(flowData.value).forEach(key => {
      if (Array.isArray(flowData.value[key]) && key !== 'plotTime' && key !== 'timestamp' && key !== 'rawDataKeys') {
        (flowData.value[key] as any[]).push(null)
      }
    })
  }

  const addRawData = (data: string) => {
    if (flowData.value.isBatchData) {
      clearRawData()
      flowData.value.isBatchData = false
    }
    enableWindow.value = true;
    
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
          if (line.indexOf('{') === -1 || line.indexOf('}') === -1) {
            continue
          }
          const json = JSON.parse(line)
          
          // 自适应添加新的数据源字段
          Object.keys(json).forEach(key => {
            if (!(key in flowData.value) && key !== 'time') {
              flowData.value[key] = []
            }
          })

          if (typeof json.time === 'number') {
            // 处理数据流包含time字段的情形
            if (flowData.value.plotTime?.length == 0) {
              flowData.value.startTime = Number(json.time)
            }
            flowData.value.plotTime!.push(Number(json.time) - flowData.value.startTime!)
            flowData.value.timestamp!.push(Number(json.time))
          } else {
            const now = Date.now() / 1000
            if (flowData.value.startTime === 0) {
              flowData.value.startTime = now
            }
            const lastTimestamp = (flowData.value.startTime ?? 0) + (flowData.value.plotTime?.[flowData.value.plotTime.length - 1] ?? 0)

            if (lastTimestamp && now - lastTimestamp > 1) {
              addNullData(now)
            }
            flowData.value.plotTime!.push(now - flowData.value.startTime!)
            flowData.value.timestamp!.push(now)
          }
          
          // 存储数据
          Object.keys(json).forEach(key => {
            if (key !== 'time' && Array.isArray(flowData.value[key])) {
              (flowData.value[key] as any[]).push(json[key])
            }
          })
        } catch (error) {
          // console.log(`json解析失败: ${error}`)
        }
      }
    }
  }
  
  const saveData = () => {
    // 获取第一个数据字段的长度作为基准
    const firstField = Object.keys(flowData.value).find(key => 
      key !== 'plotTime' && 
      key !== 'timestamp' && 
      key !== 'startTime' && 
      key !== 'isBatchData' && 
      key !== 'rawString' && 
      key !== 'rawDataKeys' && 
      Array.isArray(flowData.value[key])
    )
    
    const dataLength = firstField ? (flowData.value[firstField] as any[]).length : 0
    
    // 创建符合要求的格式数据
    const formattedData = Array.from({ length: dataLength }).map((_, index) => {
      const item: {[key: string]: any} = {
        time: flowData.value.timestamp![index], // 使用已有的时间戳
      }
      
      // 添加所有非元数据字段
      Object.keys(flowData.value).forEach(key => {
        if (key !== 'plotTime' && 
            key !== 'timestamp' && 
            key !== 'startTime' && 
            key !== 'isBatchData' && 
            key !== 'rawString' && 
            key !== 'rawDataKeys' && 
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
    const currentTime = now.getUTCFullYear() + '-' +
      String(now.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(now.getUTCDate()).padStart(2, '0') + 'T' +
      String(now.getUTCHours()).padStart(2, '0') + '-' +
      String(now.getUTCMinutes()).padStart(2, '0') + '-' +
      String(now.getUTCSeconds()).padStart(2, '0') + 'Z';
    a.download = `Nav-Tools_${currentTime}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  
  return {
    flowData,
    plotData,
    enableWindow,
    addRawData,
    initRawData,
    clearRawData,
    saveData
  }
}
