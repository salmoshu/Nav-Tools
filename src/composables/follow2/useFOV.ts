import { computed } from 'vue'

export interface CarState {
  x: number
  y: number
  angle: number
}

export interface PersonState {
  x: number
  y: number
}

// 修改useFOV的参数定义
export function useFOV(carState: any, personState: any, config: any) {
  // 使用config.followDistance而不是单独的followDistance参数
  const FOV_ANGLE = 80 * Math.PI / 180 // 80度视野

  const isInFOV = computed(() => {
    // 严格的有效性检查
    if (!carState || !personState ||
        isNaN(carState.x) || isNaN(carState.y) || isNaN(carState.angle) ||
        isNaN(personState.x) || isNaN(personState.y)) {
      return false
    }
    
    // 使用车辆中心点计算（避免车头偏移的干扰）
    const carCenterX = carState.x + 25
    const carCenterY = carState.y + 15
    const carAngle = carState.angle
    
    const personCenterX = personState.x + 15
    const personCenterY = personState.y + 15
    
    const dx = personCenterX - carCenterX
    const dy = personCenterY - carCenterY
    
    // 计算行人相对于车辆的角度
    const targetAngle = Math.atan2(dy, dx)
    
    // 计算角度差，并归一化到[-π, π]
    let angleDiff = targetAngle - carAngle
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI
    
    // 检查行人是否在车辆前方（使用点积）
    const carDirectionX = Math.cos(carAngle)
    const carDirectionY = Math.sin(carAngle)
    const dotProduct = carDirectionX * dx + carDirectionY * dy
    
    const isInFront = dotProduct > 0
    
    // 检查角度是否在FOV范围内（80度视野，半角40度 = 0.698弧度）
    const isInAngleRange = Math.abs(angleDiff) <= FOV_ANGLE / 2
    
    const result = isInFront && isInAngleRange
    
    return result
  })

  const visionLines = computed(() => {
    // 检查输入有效性
    if (!carState || isNaN(carState.x) || isNaN(carState.y) || isNaN(carState.angle)) {
      return {
        left: { x1: 0, y1: 0, x2: 0, y2: 0 },
        right: { x1: 0, y1: 0, x2: 0, y2: 0 },
        center: { x1: 0, y1: 0, x2: 0, y2: 0 }
      }
    }

    // 计算车头位置（车辆前缘中心点）
    // 车辆尺寸：50x30px，车头在车辆中心点前方25px处
    const carCenterX = carState.x + 25  // 车辆中心x
    const carCenterY = carState.y + 15  // 车辆中心y
    const carAngle = carState.angle
    const visionRange = Math.max(50, config.followDistance || 100)
    
    // 车头位置 = 车辆中心 + 车辆半长 * 方向向量
    const carFrontX = carCenterX + 25 * Math.cos(carAngle)
    const carFrontY = carCenterY + 25 * Math.sin(carAngle)
    
    const leftAngle = carAngle - FOV_ANGLE / 2
    const rightAngle = carAngle + FOV_ANGLE / 2
    
    const leftEndX = carFrontX + visionRange * Math.cos(leftAngle)
    const leftEndY = carFrontY + visionRange * Math.sin(leftAngle)
    
    const rightEndX = carFrontX + visionRange * Math.cos(rightAngle)
    const rightEndY = carFrontY + visionRange * Math.sin(rightAngle)
    
    const centerEndX = carFrontX + visionRange * Math.cos(carAngle)
    const centerEndY = carFrontY + visionRange * Math.sin(carAngle)

    return {
      left: { x1: carFrontX, y1: carFrontY, x2: leftEndX, y2: leftEndY },
      right: { x1: carFrontX, y1: carFrontY, x2: rightEndX, y2: rightEndY },
      center: { x1: carFrontX, y1: carFrontY, x2: centerEndX, y2: centerEndY }
    }
  })

  // 修复visionPath计算中的错误  
  const visionPath = computed(() => {
    // 增强有效性检查
    if (!carState || isNaN(carState.x) || isNaN(carState.y) || isNaN(carState.angle)) {
      return 'M 0 0 L 0 0' // 返回空路径
    }

    // 计算车头位置
    const carCenterX = carState.x + 25
    const carCenterY = carState.y + 15
    const carAngle = carState.angle
    const visionRange = Math.max(50, config.followDistance || 100)

    // 车头位置
    const carFrontX = carCenterX + 25 * Math.cos(carAngle)
    const carFrontY = carCenterY + 25 * Math.sin(carAngle)

    const leftAngle = carAngle - FOV_ANGLE / 2
    const rightAngle = carAngle + FOV_ANGLE / 2
    
    const leftEndX = carFrontX + visionRange * Math.cos(leftAngle)
    const leftEndY = carFrontY + visionRange * Math.sin(leftAngle)
    
    const rightEndX = carFrontX + visionRange * Math.cos(rightAngle)
    const rightEndY = carFrontY + visionRange * Math.sin(rightAngle)
    
    return `M ${carFrontX} ${carFrontY} L ${leftEndX} ${leftEndY} A ${visionRange} ${visionRange} 0 0 1 ${rightEndX} ${rightEndY} Z`
  })

  return {
    isInFOV,
    visionLines,
    visionPath
  }
}