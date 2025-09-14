// src/composables/follow/useFOV.ts
import { computed } from 'vue'
import type { CarState, PersonState } from '@/stores/followsim'

const FOV_ANGLE = 80 * Math.PI / 180

export function useFOV() {
  const createFOV = (carState: CarState, personState: PersonState, followDistance: number) => {
    const isInFOV = computed(() => {
      if (!carState || !personState) return false
      
      const carCenterX = carState.x + 25
      const carCenterY = carState.y + 15
      const carAngle = carState.angle
      
      const personCenterX = personState.x + 15
      const personCenterY = personState.y + 15
      
      const dx = personCenterX - carCenterX
      const dy = personCenterY - carCenterY
      
      const targetAngle = Math.atan2(dy, dx)
      
      let angleDiff = targetAngle - carAngle
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI
      
      const carDirectionX = Math.cos(carAngle)
      const carDirectionY = Math.sin(carAngle)
      const dotProduct = carDirectionX * dx + carDirectionY * dy
      
      const isInFront = dotProduct > 0
      const isInAngleRange = Math.abs(angleDiff) <= FOV_ANGLE / 2
      
      return isInFront && isInAngleRange
    })

    const visionLines = computed(() => {
      if (!carState) {
        return {
          left: { x1: 0, y1: 0, x2: 0, y2: 0 },
          right: { x1: 0, y1: 0, x2: 0, y2: 0 },
          center: { x1: 0, y1: 0, x2: 0, y2: 0 }
        }
      }

      const carCenterX = carState.x + 25
      const carCenterY = carState.y + 15
      const carAngle = carState.angle
      const visionRange = Math.max(50, followDistance || 100)
      
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

    const visionPath = computed(() => {
      if (!carState) return 'M 0 0 L 0 0'

      const carCenterX = carState.x + 25
      const carCenterY = carState.y + 15
      const carAngle = carState.angle
      const visionRange = Math.max(50, followDistance || 100)

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

  return {
    createFOV
  }
}