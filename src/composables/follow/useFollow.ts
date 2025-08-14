// src/composables/follow/useFollowSimulation.ts
import { useFollowStore } from '@/stores/follow'
import { usePIDController } from './usePIDController'
import { useUserControl } from './useUserControl'
import { useFOV } from './useFOV'
import { computed, watch } from 'vue'
import type { CarState, PersonState, SimulationConfig } from '@/stores/follow'

// 从useCarSimulation.ts合并的代码
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
// 合并结束

export function useFollowSimulation() {
  const store = useFollowStore()
  const { createFOV } = useFOV()
  const { handleMouseDown, isDraggingPerson } = useUserControl(store.person, (x, y) => {
    store.person.x = x
    store.person.y = y
  })

  // 创建仿真实例
  const simulation = computed(() => 
    createSimulation(store.config, store.car, store.person)
  )
  
  const fov = computed(() => 
    createFOV(store.car, store.person, store.config.followDistance)
  )

  // 计算距离和角度
  const distance = computed(() => {
    const carCenterX = store.car.x + 25
    const carCenterY = store.car.y + 15
    const carAngle = store.car.angle
    
    const carFrontX = carCenterX + 25 * Math.cos(carAngle)
    const carFrontY = carCenterY + 25 * Math.sin(carAngle)
    
    const personCenterX = store.person.x + 15
    const personCenterY = store.person.y + 15
    
    const dx = personCenterX - carFrontX
    const dy = personCenterY - carFrontY
    
    return Math.sqrt(dx * dx + dy * dy)
  })

  const targetAngle = computed(() => {
    const carCenterX = store.car.x + 25
    const carCenterY = store.car.y + 15
    const carAngle = store.car.angle
    
    const carFrontX = carCenterX + 25 * Math.cos(carAngle)
    const carFrontY = carCenterY + 25 * Math.sin(carAngle)
    
    const personCenterX = store.person.x + 15
    const personCenterY = store.person.y + 15
    
    const dx = personCenterX - carFrontX
    const dy = personCenterY - carFrontY
    
    return Math.atan2(dy, dx)
  })

  // 更新store中的状态
  watch([distance, targetAngle], ([newDistance, newTargetAngle]) => {
    store.status.distance = newDistance
    store.status.targetAngle = newTargetAngle
  })

  // 更新视野状态 - 改为直接监听car和person的变化
  watch([() => store.car, () => store.person], () => {
    store.updateVision({
      isInFOV: fov.value.isInFOV.value,
      visionLines: fov.value.visionLines.value,
      visionPath: fov.value.visionPath.value
    })
  }, { immediate: true, deep: true })

  // 仿真更新函数
  const update = (dt: number) => {
    if (!store.status.isRunning) return
    simulation.value.update(dt)
  }

  return {
    store,
    simulation,
    fov,
    distance,
    targetAngle,
    isDraggingPerson,
    update,
    handleMouseDown,
  }
}