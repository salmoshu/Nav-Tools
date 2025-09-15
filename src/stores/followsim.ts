import { defineStore } from 'pinia'
import { ref } from 'vue'

// 基础类型定义
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

export interface VisionState {
  isInFOV: boolean
  visionLines: {
    left: { x1: number; y1: number; x2: number; y2: number }
    right: { x1: number; y1: number; x2: number; y2: number }
    center: { x1: number; y1: number; x2: number; y2: number }
  }
  visionPath: string
}

export interface SystemStatus {
  isRunning: boolean
  distance: number
  targetAngle: number
  fovStatus: boolean
}

// 最基础的store定义
export const useFollowStore = defineStore('followsim', () => {
  // 状态数据（最基础的数据存储）
  const status = ref<SystemStatus>({
    isRunning: true,
    distance: 0,
    targetAngle: 0,
    fovStatus: false
  })

  const config = ref<SimulationConfig>({
    followDistance: 150,
    maxLinearSpeed: 100,
    maxAngularSpeed: 3,
    linearPID: { kp: 2.0, ki: 0.1, kd: 0.5 },
    angularPID: { kp: 1.5, ki: 0.05, kd: 0.3 }
  })

  const car = ref<CarState>({
    x: 400,
    y: 300,
    angle: Math.PI,
    linearSpeed: 0,
    angularSpeed: 0
  })

  const person = ref<PersonState>({
    x: 100,
    y: 100
  })

  const vision = ref<VisionState>({
    isInFOV: false,
    visionLines: {
      left: { x1: 0, y1: 0, x2: 0, y2: 0 },
      right: { x1: 0, y1: 0, x2: 0, y2: 0 },
      center: { x1: 0, y1: 0, x2: 0, y2: 0 }
    },
    visionPath: ''
  })

  // 基础actions（仅用于数据更新）
  const updatePersonPosition = (position: { x: number; y: number }) => {
    person.value.x = Math.max(0, Math.min(800 - 30, position.x))
    person.value.y = Math.max(0, Math.min(600 - 30, position.y))
  }

  const updateCarState = (newState: Partial<CarState>) => {
    Object.assign(car.value, newState)
  }

  const updateConfig = (newConfig: Partial<SimulationConfig>) => {
    Object.assign(config.value, newConfig)
  }

  const updateVision = (newVision: Partial<VisionState>) => {
    Object.assign(vision.value, newVision)
    status.value.fovStatus = newVision.isInFOV ?? false
  }

  const startSimulation = () => {
    status.value.isRunning = true
  }

  const stopSimulation = () => {
    status.value.isRunning = false
  }

  const resetSimulation = () => {
    car.value = {
      x: 400,
      y: 300,
      angle: Math.PI,
      linearSpeed: 0,
      angularSpeed: 0
    }
    person.value = { x: 100, y: 100 }
    status.value = {
      isRunning: false,
      distance: 0,
      targetAngle: 0,
      fovStatus: false
    }
  }

  return {
    // 状态
    status,
    config,
    car,
    person,
    vision,
    
    // 基础actions
    updatePersonPosition,
    updateCarState,
    updateConfig,
    updateVision,
    startSimulation,
    stopSimulation,
    resetSimulation
  }
})