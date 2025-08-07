import { reactive, computed, watch } from 'vue'
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
    x: 400, // 确保是数字
    y: 300, // 确保是数字
    angle: Math.PI, // 确保是数字
    linearSpeed: 0,
    angularSpeed: 0
  })
  
  const personState = reactive<PersonState>({
    x: 100, // 确保是数字
    y: 100  // 确保是数字
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

  // 修改距离计算，使用车头位置
  const distance = computed(() => {
    // 车辆中心位置
    const carCenterX = carState.x + 25
    const carCenterY = carState.y + 15
    const carAngle = carState.angle
    
    // 车头位置 = 车辆中心 + 车辆半长 * 方向向量
    const carFrontX = carCenterX + 25 * Math.cos(carAngle)
    const carFrontY = carCenterY + 25 * Math.sin(carAngle)
    
    // 行人中心位置
    const personCenterX = personState.x + 15
    const personCenterY = personState.y + 15
    
    const dx = personCenterX - carFrontX
    const dy = personCenterY - carFrontY
    return Math.sqrt(dx * dx + dy * dy)
  })
  
  // 修改角度计算
  const targetAngle = computed(() => {
    const carCenterX = carState.x + 25
    const carCenterY = carState.y + 15
    const carAngle = carState.angle
    const carFrontX = carCenterX + 25 * Math.cos(carAngle)
    const carFrontY = carCenterY + 25 * Math.sin(carAngle)
    
    const personCenterX = personState.x + 15
    const personCenterY = personState.y + 15
    
    const dx = personCenterX - carFrontX
    const dy = personCenterY - carFrontY
    return Math.atan2(dy, dx)
  })
  
  // 修改update函数中的距离计算
  // 修复update函数，添加缺失的车辆移动逻辑
  const update = (dt: number) => {
    // 使用车头位置作为参考点
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
    
    // 添加缺失的车辆位置更新逻辑
    carState.angle = normalizeAngle(carState.angle + carState.angularSpeed * dt)
    carState.x += carState.linearSpeed * Math.cos(carState.angle) * dt
    carState.y += carState.linearSpeed * Math.sin(carState.angle) * dt
    
    // 添加边界检查
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
    update,
    setPersonPosition
  }
}