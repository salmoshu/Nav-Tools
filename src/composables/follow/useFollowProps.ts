import { reactive, onMounted, onUnmounted } from 'vue'
import { useCarSimulation } from './useCarSimulation'
import { useUserControl } from './useUserControl'
import { useFOV } from './useFOV'

// 全局配置状态
const config = reactive({
  followDistance: 150,
  maxLinearSpeed: 100,
  maxAngularSpeed: 3,
  linearPID: { kp: 2.0, ki: 0.1, kd: 0.5 },
  angularPID: { kp: 1.5, ki: 0.05, kd: 0.3 }
})

// 主组合式函数
// 添加全局单例实例
type UseFollowMainReturnType = {
  carState: ReturnType<typeof useCarSimulation>['carState']
  personState: ReturnType<typeof useCarSimulation>['personState']
  distance: ReturnType<typeof useCarSimulation>['distance']
  targetAngle: ReturnType<typeof useCarSimulation>['targetAngle']
  isInFOV: ReturnType<typeof useFOV>['isInFOV']
  visionLines: ReturnType<typeof useFOV>['visionLines']
  visionPath: ReturnType<typeof useFOV>['visionPath']
  handleMouseDown: ReturnType<typeof useUserControl>['handleMouseDown']
  isDraggingPerson: ReturnType<typeof useUserControl>['isDraggingPerson']
  startAnimation: () => void
  stopAnimation: () => void
  updateConfig: (newConfig: Partial<typeof config>) => void
  config: typeof config
}

let globalInstance: UseFollowMainReturnType | null = null
let instanceCount = 0

// 修改useFollowMain为单例模式
function useFollowMain() {
  if (globalInstance) {
    return globalInstance
  }

  // 使用仿真hook
  const {
    carState,
    personState,
    distance,
    targetAngle,
    update,
    setPersonPosition
  } = useCarSimulation(config)

  const { isInFOV, visionLines, visionPath } = useFOV(carState, personState, config)

  // 用户控制
  const { handleMouseDown, isDraggingPerson } = useUserControl(personState, setPersonPosition)

  // 动画控制
  let animationId: number
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
      animationId = 0
    }
  }

  // 确保只启动一次动画
  if (instanceCount === 0) {
    startAnimation()
    instanceCount++
  }

  globalInstance = {
    carState,
    personState,
    distance,
    targetAngle,
    isInFOV,
    visionLines,
    visionPath,
    handleMouseDown,
    isDraggingPerson,
    startAnimation,
    stopAnimation,
    updateConfig,
    config
  }

  return globalInstance
}

const updateConfig = (newConfig: Partial<typeof config>) => {
  Object.assign(config, newConfig)
}

onMounted(() => {
const { startAnimation } = useFollowMain()
startAnimation()
})

onUnmounted(() => {
  const { stopAnimation } = useFollowMain()
  stopAnimation()
})

// 只导出useFollowMain函数和config，避免循环引用
export { useFollowMain, config }
