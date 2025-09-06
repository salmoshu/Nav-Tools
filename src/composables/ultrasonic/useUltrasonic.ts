import { ref } from "vue"
import { useObstacleDetect } from "./useObstacleDetect"

const dt = 1/20
const timestamp = ref(0)
const timestamps = ref([] as any[])
const rawData = ref([] as any[])
const filteredData = ref([] as any[])
const obstacleData = ref([] as any[])
const isBatchData = ref(false)

const { detectObstacle, detectObstacleBatch } = useObstacleDetect()

export function useUltrasonic() {
  const clearRawData = () => {
    timestamp.value = 0
    rawData.value = []
    filteredData.value = []
    obstacleData.value = []
    timestamps.value = []
  }

  const initRawData = (data: string, startTime: number=0) => {
    isBatchData.value = true
    timestamp.value = startTime
    const lines = data.split("\n")
    for (const line of lines) {
      if (line.trim() !== "") {
        try {
          const json = JSON.parse(line)
          const data = json.ultrasonic
          if (typeof json.time === 'number') {
            if (timestamp.value == 0) {
              // 增加一个极小量 0.0005，以处理为0的情况
              timestamp.value = Number(json.time) - 0.0005
            }
            timestamps.value.push(Number(json.time) - timestamp.value)
          } else {
            // 如果没有time属性，则假设数据为20Hz
            timestamps.value.push(timestamp.value)
            timestamp.value += dt
          }
          rawData.value.push(data)
        } catch (error) {
          console.log('json解析失败', error)
        }
      }
    }
    detectObstacleBatch(rawData.value, filteredData.value, obstacleData.value)
  }

  const addNullData = () => {
    const now = Date.now() / 1000
    timestamps.value.push(now - timestamp.value - 0.5)
    rawData.value.push(null)
    filteredData.value.push(null)
    obstacleData.value.push(null)
  }

  const addRawData = (data: string) => {
    if (isBatchData.value) {
      clearRawData()
      isBatchData.value = false
    }
    const lines = data.split("\n")
    for (const line of lines) {
      if (line.trim() !== "") {
        try {
          const json = JSON.parse(line)
          const data = json.ultrasonic
          if (data && Number(data)) {
            const histroyRawData = rawData.value
            const histroyFilteredData = filteredData.value
            const {isObstacle, filteredValue} = detectObstacle(histroyRawData, histroyFilteredData, Number(data))

            if (typeof json.time === 'number') {
              if (timestamp.value == 0) {
                // 增加一个极小量 0.0005，以处理为0的情况
                timestamp.value = Number(json.time) - 0.0005
              }
              timestamps.value.push(Number(json.time) - timestamp.value)
            } else {
              const now = Date.now() / 1000
              if (timestamp.value == 0) {
                timestamp.value = now
              }
              const lastTimestamp = timestamp.value + timestamps.value[timestamps.value.length - 1]
              if (lastTimestamp && now - lastTimestamp > 1) {
                addNullData()
              }

              timestamps.value.push(now - timestamp.value)
              if (data && Number(data)) {
                rawData.value.push(Number(data))
                filteredData.value.push(filteredValue)
                obstacleData.value.push(isObstacle ? filteredValue : null)
              } else {
                rawData.value.push(null)
                filteredData.value.push(null)
                obstacleData.value.push(null)
              }
            }
          }
        } catch (error) {
          console.log('json解析失败', error)
        }
      }
    }
  }
  
  const saveData = () => {
    // 创建符合要求的格式数据
    const formattedData = rawData.value.map((ultrasonic, index) => {
      return {
        time: timestamps.value[index], // 使用已有的时间戳或计算时间
        ultrasonic: ultrasonic,
      };
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
    timestamps,
    rawData,
    filteredData,
    obstacleData,
    addRawData,
    initRawData,
    clearRawData,
    saveData,
  }
}
