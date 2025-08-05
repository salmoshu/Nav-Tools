import { computed, type Ref } from 'vue'

export interface CarState {
  x: number
  y: number
  angle: number
}

export interface PersonState {
  x: number
  y: number
}

export function useFOV(carState: CarState, personState: PersonState, followDistance: Ref<number>) {
  const FOV_ANGLE = 80 * Math.PI / 180

  const normalizeAngle = (angle: number): number => {
    while (angle > Math.PI) angle -= 2 * Math.PI
    while (angle < -Math.PI) angle += 2 * Math.PI
    return angle
  }

  const isInFOV = computed(() => {
    const carCenterX = carState.x + 25
    const carCenterY = carState.y + 15
    const personCenterX = personState.x + 15
    const personCenterY = personState.y + 15
    
    const dx = personCenterX - carCenterX
    const dy = personCenterY - carCenterY
    const angleToPerson = Math.atan2(dy, dx)
    
    let angleDiff = angleToPerson - carState.angle
    angleDiff = normalizeAngle(angleDiff)
    
    return Math.abs(angleDiff) <= FOV_ANGLE / 2
  })

  const visionLines = computed(() => {
    const carCenterX = carState.x + 25
    const carCenterY = carState.y + 15
    const carAngle = carState.angle
    
    const leftAngle = carAngle - FOV_ANGLE / 2
    const rightAngle = carAngle + FOV_ANGLE / 2
    const visionRange = followDistance.value
    
    const leftEndX = carCenterX + visionRange * Math.cos(leftAngle)
    const leftEndY = carCenterY + visionRange * Math.sin(leftAngle)
    
    const rightEndX = carCenterX + visionRange * Math.cos(rightAngle)
    const rightEndY = carCenterY + visionRange * Math.sin(rightAngle)
    
    const centerEndX = carCenterX + visionRange * Math.cos(carAngle)
    const centerEndY = carCenterY + visionRange * Math.sin(carAngle)
    
    return {
      left: { x1: carCenterX, y1: carCenterY, x2: leftEndX, y2: leftEndY },
      right: { x1: carCenterX, y1: carCenterY, x2: rightEndX, y2: rightEndY },
      center: { x1: carCenterX, y1: carCenterY, x2: centerEndX, y2: centerEndY }
    }
  })

  const visionPath = computed(() => {
    const carCenterX = carState.x + 25
    const carCenterY = carState.y + 15
    const carAngle = carState.angle
    
    const leftAngle = carAngle - FOV_ANGLE / 2
    const rightAngle = carAngle + FOV_ANGLE / 2
    const visionRange = followDistance.value
    
    const leftEndX = carCenterX + visionRange * Math.cos(leftAngle)
    const leftEndY = carCenterY + visionRange * Math.sin(leftAngle)
    
    const rightEndX = carCenterX + visionRange * Math.cos(rightAngle)
    const rightEndY = carCenterY + visionRange * Math.sin(rightAngle)
    
    return `M ${carCenterX} ${carCenterY} L ${leftEndX} ${leftEndY} A ${visionRange} ${visionRange} 0 0 1 ${rightEndX} ${rightEndY} Z`
  })

  return {
    isInFOV,
    visionLines,
    visionPath
  }
}