// src/stores/follow.ts
import { defineStore } from 'pinia'
import { reactive, computed, ref, type Ref } from 'vue'

// 导入Follow模块的组合式函数
import { useCarSimulation } from '@/composables/follow/useCarSimulation'
import { useUserControl } from '@/composables/follow/useUserControl'
import { useFOV } from '@/composables/follow/useFOV'

export const useFollowStore = defineStore('follow', () => {
  // 全局配置状态
  const config = reactive({
    followDistance: 150,
    maxLinearSpeed: 100,
    maxAngularSpeed: 3,
    linearPID: { kp: 2.0, ki: 0.1, kd: 0.5 },
    angularPID: { kp: 1.5, ki: 0.05, kd: 0.3 }
  })

  // 使用组合式函数
  const {
    carState,
    personState,
    distance,
    targetAngle,
    update,
    setPersonPosition
  } = useCarSimulation(config)

  const { isInFOV, visionLines, visionPath } = useFOV(carState, personState, config)
  const { handleMouseDown, isDraggingPerson } = useUserControl(personState, setPersonPosition)

  // 动画控制
  let animationId: number | null = null
  let lastTime = 0

  const animate = (currentTime: number) => {
    const dt = (currentTime - lastTime) / 1000
    lastTime = currentTime
    
    if (dt > 0 && dt < 0.1) {
      update(dt)
    }
    
    animationId = requestAnimationFrame(animate)
  }

  const startAnimation = () => {
    if (!animationId) {
      lastTime = performance.now()
      animationId = requestAnimationFrame(animate)
    }
  }

  const stopAnimation = () => {
    if (animationId) {
      cancelAnimationFrame(animationId)
      animationId = null
    }
  }

  // 计算属性
  const status = computed(() => ({
    linearSpeed: carState.linearSpeed.toFixed(1),
    angularSpeed: carState.angularSpeed.toFixed(2),
    angle: (carState.angle * 180 / Math.PI).toFixed(1) + '°',
    targetAngle: (targetAngle.value * 180 / Math.PI).toFixed(1) + '°',
    distance: distance.value.toFixed(1),
    isInFOV: isInFOV.value
  }))

  // 方法
  const updateConfig = (newConfig: Partial<typeof config>) => {
    Object.assign(config, newConfig)
  }

  const resetConfig = () => {
    Object.assign(config, {
      followDistance: 150,
      maxLinearSpeed: 100,
      maxAngularSpeed: 3,
      linearPID: { kp: 2.0, ki: 0.1, kd: 0.5 },
      angularPID: { kp: 1.5, ki: 0.05, kd: 0.3 }
    })
  }

  // 自动启动动画
  startAnimation()

  return {
    // 状态
    config,
    carState,
    personState,
    distance,
    targetAngle,
    isInFOV,
    visionLines,
    visionPath,
    isDraggingPerson,
    status,
    
    // 方法
    updateConfig,
    resetConfig,
    startAnimation,
    stopAnimation,
    handleMouseDown,
    setPersonPosition
  }
})
