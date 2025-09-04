import { ref } from "vue"
import { useObstacleDetect } from "./useObstacleDetect"
import { ElMessage } from "element-plus"

const dt = 1/20
const timestamp = ref(0)
const timestamps = ref([] as number[])
const rawData = ref([] as number[])
const filteredData = ref([] as number[])
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
          if (data && Number(data)) {
            // console.log(json.time, Number(json.time), json.time && Number(json.time))
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
            rawData.value.push(Number(data))
            console.log(
              timestamps.value[timestamps.value.length - 1],
              rawData.value[rawData.value.length - 1]
            )
          }
        } catch (error) {
          console.log('json解析失败', error)
        }
      }
    }
    detectObstacleBatch(rawData.value, filteredData.value, obstacleData.value)
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

            rawData.value.push(Number(data))
            filteredData.value.push(filteredValue)
            obstacleData.value.push(isObstacle ? filteredValue : null)
            if (typeof json.time === 'number') {
              if (timestamp.value == 0) {
                // 增加一个极小量 0.0005，以处理为0的情况
                timestamp.value = Number(json.time) - 0.0005
              }
              timestamps.value.push(Number(json.time) - timestamp.value)
            } else {
              if (timestamp.value == 0) {
                timestamp.value = Date.now() / 1000
              }
              timestamps.value.push(Date.now() / 1000 - timestamp.value)
            }
          }
        } catch (error) {
          console.log('json解析失败', error)
        }
      }
    }
  }
  
  const saveData = () => {
    ElMessage.error('该功能还存在一些BUG!')
    return
    // 创建符合要求的格式数据
    const formattedData = rawData.value.map((ultrasonic, index) => {
      return {
        time: timestamps.value[index], // 使用已有的时间戳或计算时间
        ultrasonic: ultrasonic,
        camera_distance: 0, // 目前未提供摄像头距离数据，设为默认值0
        camera_angle: 0 // 目前未提供摄像头角度数据，设为默认值0
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
    a.download = `Nav-Tools_${timestamp}.csv`;
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
