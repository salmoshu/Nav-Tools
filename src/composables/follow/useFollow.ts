// src/composables/follow/useFollowSimulation.ts
import { useFollowStore } from '@/stores/follow'
import { useCarSimulation } from './useCarSimulation'
import { useFOV } from './useFOV'
import { computed, watch } from 'vue'

export function useFollowSimulation() {
  const store = useFollowStore()
  const { createSimulation } = useCarSimulation()
  const { createFOV } = useFOV()

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
    update
  }
}