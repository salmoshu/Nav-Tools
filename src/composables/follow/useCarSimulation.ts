// src/composables/follow/useCarSimulation.ts
import { usePIDController } from './usePIDController'
import type { CarState, PersonState, SimulationConfig } from '@/stores/follow'

export function useCarSimulation() {
  const normalizeAngle = (angle: number): number => {
    while (angle > Math.PI) angle -= 2 * Math.PI
    while (angle < -Math.PI) angle += 2 * Math.PI
    return angle
  }

  const createSimulation = (config: SimulationConfig, carState: CarState, personState: PersonState) => {
    const linearPID = usePIDController(config.linearPID)
    const angularPID = usePIDController(config.angularPID)

    const update = (dt: number) => {
      // 使用车头位置计算
      const carCenterX = carState.x + 25
      const carCenterY = carState.y + 15
      const carAngle = carState.angle
      
      const carFrontX = carCenterX + 25 * Math.cos(carAngle)
      const carFrontY = carCenterY + 25 * Math.sin(carAngle)
      
      const personCenterX = personState.x + 15
      const personCenterY = personState.y + 15
      
      const dx = personCenterX - carFrontX
      const dy = personCenterY - carFrontY
      const angleToPerson = Math.atan2(dy, dx)
      
      let angleDiff = angleToPerson - carAngle
      angleDiff = normalizeAngle(angleDiff)
      
      const currentDistance = Math.sqrt(dx * dx + dy * dy)
      const linearError = Math.max(0, currentDistance - config.followDistance)
    
      const targetLinearSpeed = linearPID.controller.update(linearError, dt)
      const targetAngularSpeed = angularPID.controller.update(angleDiff, dt)
      
      carState.linearSpeed = Math.max(-config.maxLinearSpeed, Math.min(config.maxLinearSpeed, targetLinearSpeed))
      carState.angularSpeed = Math.max(-config.maxAngularSpeed, Math.min(config.maxAngularSpeed, targetAngularSpeed))
      
      if (currentDistance < config.followDistance) {
        carState.linearSpeed = 0
      }
      
      carState.angle = normalizeAngle(carState.angle + carState.angularSpeed * dt)
      carState.x += carState.linearSpeed * Math.cos(carState.angle) * dt
      carState.y += carState.linearSpeed * Math.sin(carState.angle) * dt
      
      carState.x = Math.max(0, Math.min(800 - 50, carState.x))
      carState.y = Math.max(0, Math.min(600 - 30, carState.y))
    }

    return {
      update,
      linearPID: linearPID.controller,
      angularPID: angularPID.controller
    }
  }

  return {
    createSimulation
  }
}