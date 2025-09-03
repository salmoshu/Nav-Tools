import { ref } from "vue"
import { useObstacleDetect } from "./useObstacleDetect"

const dt = 1/20
const timestamp = ref(0)
const timestamps = ref([] as number[])
const rawData = ref([] as number[])
const filteredData = ref([] as number[])
const obstacleData = ref([] as any[])

const { detectObstacle, detectObstacleBatch } = useObstacleDetect()

export function useUltrasonic() {
  const initRawData = (data: string, startTime: number=0) => {
    timestamp.value = startTime
    const lines = data.split("\n");
    for (const line of lines) {
      if (line.trim() !== "") {
        const data = line.split(',')[0]
        if (data && Number(data)) {
          timestamps.value.push(timestamp.value)
          rawData.value.push(Number(data))
          timestamp.value += dt
        }
      }
    }
    detectObstacleBatch(rawData.value, filteredData.value, obstacleData.value)
  }

  const addRawData = (data: string) => {
    const lines = data.split("\n");
    for (const line of lines) {
      if (line.trim() !== "") {
        const data = line.split(',')[0]
        if (data && Number(data)) {
          const histroyRawData = rawData.value
          const histroyFilteredData = filteredData.value
          const {isObstacle, filteredValue} = detectObstacle(histroyRawData, histroyFilteredData, Number(data))

          rawData.value.push(Number(data))
          filteredData.value.push(filteredValue)
          obstacleData.value.push(isObstacle ? filteredValue : null)
          timestamps.value.push(timestamp.value)
          timestamp.value += dt
        }
      }
    }
  }
  
  const clearRawData = () => {
    timestamp.value = 0
    rawData.value = []
  }
  return {
    timestamps,
    rawData,
    filteredData,
    obstacleData,
    addRawData,
    initRawData,
    clearRawData,
  }
}
