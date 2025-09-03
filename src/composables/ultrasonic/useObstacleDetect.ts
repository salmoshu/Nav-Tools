// 障碍物检测阈值常量
const dTh = 1000    // 阈值设为1000mm
const deltaTh = 200 // 差值阈值设为200mm
const slidWindowSize = 5

// 单个数据点中值滤波处理
function medianFilter(
  dataHistory: number[], 
  newDataPoint: number, 
  windowSize: number = 5
): number {
  const updatedHistory = [...dataHistory, newDataPoint]
  const recentHistory = updatedHistory.slice(-windowSize)
  const sortedHistory = [...recentHistory].sort((a, b) => a - b)
  
  // 取中值
  const medianIndex = Math.floor(sortedHistory.length / 2)
  return sortedHistory[medianIndex]
}

// 中值滤波函数 - 5帧
function medianFilterBatch(data: number[], filteredData: number[], windowSize: number = 5) {
  const halfWindow = Math.floor(windowSize / 2)
  
  for (let i = 0; i < data.length; i++) {
    // 确定窗口范围
    const start = Math.max(0, i - halfWindow)
    const end = Math.min(data.length - 1, i + halfWindow)
    
    // 提取窗口内的数据
    const windowData: number[] = []
    for (let j = start; j <= end; j++) {
      windowData.push(data[j])
    }
    
    // 排序并取中值
    windowData.sort((a, b) => a - b)
    const medianIndex = Math.floor(windowData.length / 2)
    filteredData[i] = windowData[medianIndex]
  }
}

function detectObstacleBatch(rawData: number[], filteredData: number[], obstacleData: any[]) {
  // 第一步：利用中值滤波进行预处理
  medianFilterBatch(rawData, filteredData, slidWindowSize)
  
  // 第二步：标记连续3帧都小于阈值的点
  const continuousBelowThreshold: boolean[] = Array.from({ length: filteredData.length }).fill(false) as boolean[]
  
  for (let i = 2; i < filteredData.length; i++) {
    if (filteredData[i - 2] < dTh && filteredData[i - 1] < dTh && filteredData[i] < dTh) {
      continuousBelowThreshold[i] = true
    }
  }

  // 第三步：识别误检点
  const isFalseDetection: boolean[] = Array.from({ length: filteredData.length }).fill(false) as boolean[]
  
  for (let i = 1; i < filteredData.length - 1; i++) {
    const deltaPrev = Math.abs(filteredData[i] - filteredData[i - 1])
    const deltaNext = Math.abs(filteredData[i + 1] - filteredData[i])
    
    // 检测单次跳变（仅出现一次的大幅差值）
    if (deltaPrev > deltaTh && deltaNext <= deltaTh && 
        filteredData[i - 1] >= dTh && filteredData[i] < dTh && filteredData[i + 1] >= dTh) {
      isFalseDetection[i] = true
    }
  }

  // 第四步：生成障碍物数据
  for (let i = 0; i < filteredData.length; i++) {
    // 障碍物点显示为实际距离值，非障碍物点设为null不显示
    obstacleData.push(continuousBelowThreshold[i] && !isFalseDetection[i] ? filteredData[i] : null)
  }
}

// 单个数据点障碍物检测处理
function detectObstacle(
  dataHistory: number[], 
  filteredHistory: number[], 
  newDataPoint: number
): { isObstacle: boolean, filteredValue: number } {
  // 首先对新数据点进行中值滤波
  if (dataHistory.length < slidWindowSize) {
    return { isObstacle: false, filteredValue: newDataPoint }
  }
  const filteredValue = medianFilter(dataHistory, newDataPoint, slidWindowSize)
  
  const updatedFilteredHistory = [...filteredHistory, filteredValue].slice(-3)  // 只保留最近3个滤波后数据
  
  // 检查是否满足障碍物条件（连续3个滤波后数据都小于阈值）
  let isContinuousBelowThreshold = false
  if (updatedFilteredHistory.length >= 3) {
    isContinuousBelowThreshold = updatedFilteredHistory.every(value => value < dTh)
  }
  
  // 检查是否为误检点
  let isFalseDetection = false
  if (updatedFilteredHistory.length >= 3) {
    const currentIndex = updatedFilteredHistory.length - 1
    const deltaPrev = Math.abs(updatedFilteredHistory[currentIndex] - updatedFilteredHistory[currentIndex - 1])
    
    // 简化的误检判断逻辑
    if (deltaPrev > deltaTh && 
        updatedFilteredHistory[currentIndex - 1] >= dTh && 
        updatedFilteredHistory[currentIndex] < dTh) {
      isFalseDetection = true
    }
  }
  
  // 确定是否为障碍物
  const isObstacle = isContinuousBelowThreshold && !isFalseDetection
  
  return { isObstacle, filteredValue }
}

// 导出函数
export function useObstacleDetect() {
  return {
    detectObstacle,
    detectObstacleBatch,
  }
}
