import { ref } from "vue"
import { useObstacleDetect } from "./useObstacleDetect"
import { useUltrasonicStore } from '@/stores/ultrasonic'

const dt = 1/20
const timestamp = ref(0)
const timestamps = ref([] as any[])
const rawData = ref([] as any[])
const filteredData = ref([] as any[])
const obstacleData = ref([] as any[])
const isBatchData = ref(false)

const { detectObstacle, detectObstacleBatch } = useObstacleDetect()

// 创建更新ultrasonic状态的函数
const updateUltrasonicStatus = () => {
  const ultrasonicStore = useUltrasonicStore()
  
  // 获取各个数组的最后一个元素作为status内容
  ultrasonicStore.status = {
    timestamp: timestamps.value.length > 0 ? timestamps.value[timestamps.value.length - 1] : null,
    rawDistance: rawData.value.length > 0 ? rawData.value[rawData.value.length - 1] : null,
    filteredDistance: filteredData.value.length > 0 ? filteredData.value[filteredData.value.length - 1] : null,
    isObstacle: obstacleData.value.length > 0 ? obstacleData.value[obstacleData.value.length - 1] !== null : false
  }
}

export function useUltrasonic() {
  const clearRawData = () => {
    timestamp.value = 0
    rawData.value = []
    filteredData.value = []
    obstacleData.value = []
    timestamps.value = []
  }

  const initRawData = (data: string, startTime: number=0) => {
    clearRawData();
    isBatchData.value = true
    timestamp.value = startTime
    const lines = data.split("\n")
    for (const line of lines) {
      if (line.trim() !== "") {
        try {
          const time_reg = /^\d{2}:\d{2}:\d{2}\.\d+(?:\.\d+)?:/;
          const cleanedLine = line.replace(time_reg, '').trim()
          const json = JSON.parse(cleanedLine)
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
    // 在批量数据初始化完成后更新状态
    updateUltrasonicStatus()
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
    // 在添加新数据后更新状态
    updateUltrasonicStatus()
  }
  
  return {
    timestamps,
    rawData,
    filteredData,
    obstacleData,
    addRawData,
    initRawData,
    clearRawData,
    updateUltrasonicStatus // 可选：导出更新函数，以便外部手动触发更新
  }
}
