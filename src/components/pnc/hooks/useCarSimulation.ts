import { reactive, ref, computed, watch } from 'vue'
import { usePIDController } from './usePIDController'

export interface CarState {
  x: number
  y: number
  angle: number
  linearSpeed: number
  angularSpeed: number
}

export interface PersonState {
  x: number
  y: number
}

export interface SimulationConfig {
  followDistance: number
  maxLinearSpeed: number
  maxAngularSpeed: number
  linearPID: { kp: number; ki: number; kd: number }
  angularPID: { kp: number; ki: number; kd: number }
}

export function useCarSimulation(config: SimulationConfig) {
  const carState = reactive<CarState>({
    x: 400,
    y: 300,
    angle: Math.PI,
    linearSpeed: 0,
    angularSpeed: 0
  })

  const personState = reactive<PersonState>({
    x: 100,
    y: 100
  })

  let countDuration = 0

  const linearPID = usePIDController(config.linearPID)
  const angularPID = usePIDController(config.angularPID)

  // 添加PID参数实时监听
  watch(() => config.linearPID, (newParams) => {
    linearPID.updateParams(newParams)
  }, { deep: true })

  watch(() => config.angularPID, (newParams) => {
    angularPID.updateParams(newParams)
  }, { deep: true })

  const normalizeAngle = (angle: number): number => {
    while (angle > Math.PI) angle -= 2 * Math.PI
    while (angle < -Math.PI) angle += 2 * Math.PI
    return angle
  }

  const distance = computed(() => {
    const dx = personState.x + 15 - (carState.x + 25)
    const dy = personState.y + 15 - (carState.y + 15)
    return Math.sqrt(dx * dx + dy * dy)
  })

  const targetAngle = computed(() => {
    const dx = personState.x + 15 - (carState.x + 25)
    const dy = personState.y + 15 - (carState.y + 15)
    return Math.atan2(dy, dx)
  })

  const isInFOV = computed(() => {
    const dx = personState.x + 15 - (carState.x + 25)
    const dy = personState.y + 15 - (carState.y + 15)
    const angleToPerson = Math.atan2(dy, dx)
    let angleDiff = angleToPerson - carState.angle
    angleDiff = normalizeAngle(angleDiff)
    return Math.abs(angleDiff) <= (80 * Math.PI / 180) / 2
  })

  const update = (dt: number) => {
    const carCenterX = carState.x + 40
    const carCenterY = carState.y + 25
    const personCenterX = personState.x + 15
    const personCenterY = personState.y + 15
    
    const dx = personCenterX - carCenterX
    const dy = personCenterY - carCenterY
    const angleToPerson = Math.atan2(dy, dx)
    
    let angleDiff = angleToPerson - carState.angle
    angleDiff = normalizeAngle(angleDiff)
    
    const currentFOV = Math.abs(angleDiff) <= (80 * Math.PI / 180) / 2
    
    if (!currentFOV) {
      countDuration += dt
      if (countDuration >= 2) {
        carState.linearSpeed = 0
        carState.angularSpeed = 0
      }
    } else {
      countDuration = 0
      const currentDistance = Math.sqrt(dx * dx + dy * dy)
      const linearError = Math.max(0, currentDistance - config.followDistance)

      const targetLinearSpeed = linearPID.controller.update(linearError, dt)
      const targetAngularSpeed = angularPID.controller.update(angleDiff, dt)
      
      carState.linearSpeed = Math.max(-config.maxLinearSpeed, Math.min(config.maxLinearSpeed, targetLinearSpeed))
      carState.angularSpeed = Math.max(-config.maxAngularSpeed, Math.min(config.maxAngularSpeed, targetAngularSpeed))
      
      if (currentDistance < config.followDistance) {
        carState.linearSpeed = 0
      }
    }
    
    carState.angle = normalizeAngle(carState.angle + carState.angularSpeed * dt)
    carState.x += carState.linearSpeed * Math.cos(carState.angle) * dt
    carState.y += carState.linearSpeed * Math.sin(carState.angle) * dt
    
    carState.x = Math.max(0, Math.min(800 - 50, carState.x))
    carState.y = Math.max(0, Math.min(600 - 30, carState.y))
  }

  const setPersonPosition = (x: number, y: number) => {
    personState.x = Math.max(0, Math.min(800 - 30, x))
    personState.y = Math.max(0, Math.min(600 - 30, y))
  }

  return {
    carState,
    personState,
    distance,
    targetAngle,
    // 移除 isInFOV 返回
    update,
    setPersonPosition
  }
}