<template>
  <div class="simulation-container">
    <div class="main-layout">
      <div id="container" ref="container">
        <div class="ruler-horizontal">
          <div 
            v-for="n in horizontalTicks" 
            :key="`h-${n}`" 
            class="tick-h" 
            :style="{ left: `${n * 50}px` }"
          >
            <span>{{ n * 50 }}</span>
          </div>
        </div>
        <div class="ruler-vertical">
          <div 
            v-for="n in verticalTicks" 
            :key="`v-${n}`" 
            class="tick-v" 
            :style="{ top: `${n * 50}px` }"
          >
            <span>{{ n * 50 }}</span>
          </div>
        </div>
        
        <!-- 视野辅助线-->
        <svg class="vision-lines" :style="{
          position: 'absolute',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
          pointerEvents: 'none'
        }">
          <path 
            :d="visionPath" 
            class="vision-cone"
            fill="rgba(255, 255, 0, 0.1)"
            stroke="rgba(255, 255, 0, 0.8)"
            stroke-width="1"
          />
          <line
            :x1="visionLines.left.x1"
            :y1="visionLines.left.y1"
            :x2="visionLines.left.x2"
            :y2="visionLines.left.y2"
            stroke="rgba(255, 255, 0, 0.8)"
            stroke-width="1"
          />
          <line
            :x1="visionLines.right.x1"
            :y1="visionLines.right.y1"
            :x2="visionLines.right.x2"
            :y2="visionLines.right.y2"
            stroke="rgba(255, 255, 0, 0.8)"
            stroke-width="1"
          />
          <line
            :x1="visionLines.center.x1"
            :y1="visionLines.center.y1"
            :x2="visionLines.center.x2"
            :y2="visionLines.center.y2"
            stroke="rgba(255, 255, 0, 0.8)"
            stroke-width="1"
            stroke-dasharray="5,5"
          />
        </svg>
        
        <div 
          id="person" 
          ref="person"
          :style="personStyle"
          @mousedown="handleMouseDown"
        ></div>
        <div 
          id="car" 
          ref="car"
          :style="carStyle"
        ></div>
      </div>
      
      <div class="sidebar">
        <!-- 控制面板 -->
        <div class="controls">
          <div class="controls-content">
            <div class="control-group">
              <h4>线速度PID参数</h4>
              <label>线速度P: 
                <input type="range" v-model="linearP" min="0" max="10" step="0.1">
                <span>{{ linearP }}</span>
              </label>
              <label>线速度I: 
                <input type="range" v-model="linearI" min="0" max="2" step="0.05">
                <span>{{ linearI }}</span>
              </label>
              <label>线速度D: 
                <input type="range" v-model="linearD" min="0" max="2" step="0.05">
                <span>{{ linearD }}</span>
              </label>
            </div>
            
            <div class="control-group">
              <h4>角速度PID参数</h4>
              <label>角速度P: 
                <input type="range" v-model="angularP" min="0" max="5" step="0.1">
                <span>{{ angularP }}</span>
              </label>
              <label>角速度I: 
                <input type="range" v-model="angularI" min="0" max="1" step="0.05">
                <span>{{ angularI }}</span>
              </label>
              <label>角速度D: 
                <input type="range" v-model="angularD" min="0" max="1" step="0.05">
                <span>{{ angularD }}</span>
              </label>
            </div>
            
            <div class="control-group">
              <h4>其他参数</h4>
              <label>跟随距离: 
                <input type="range" v-model="followDistance" min="100" max="200" step="5">
                <span>{{ followDistance }}</span>
              </label>
              <label>最大线速度: 
                <input type="range" v-model="maxLinearSpeed" min="20" max="200" step="10">
                <span>{{ maxLinearSpeed }}</span>
              </label>
              <label>最大角速度: 
                <input type="range" v-model="maxAngularSpeed" min="0.5" max="6" step="0.1">
                <span>{{ maxAngularSpeed }}</span>
              </label>
            </div>
          </div>
        </div>
        
        <!-- 状态面板 -->
        <div class="status">
          <div class="status-container">
            <div class="status-group">
              <h4>状态</h4>
              <div class="status-grid">
                <div class="status-row">
                  <span class="status-label">线速度</span>
                  <span class="status-value">{{ carState.linearSpeed.toFixed(1) }}</span>
                  <span class="status-label">角速度</span>
                  <span class="status-value">{{ carState.angularSpeed.toFixed(2) }}</span>
                  <span class="status-label">朝向角度</span>
                  <span class="status-value">{{ (carState.angle * 180 / Math.PI).toFixed(1) }}°</span>
                </div>
                <div class="status-row">
                  <span class="status-label">目标角度</span>
                  <span class="status-value">{{ (targetAngle * 180 / Math.PI).toFixed(1) }}°</span>
                  <span class="status-label">距离</span>
                  <span class="status-value">{{ distance.toFixed(1) }}</span>
                  <span class="status-label">FOV状态</span>
                  <span class="status-value" :class="{ 'in-fov': isInFOV, 'out-fov': !isInFOV }">
                    {{ isInFOV ? '范围内' : '范围外' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useCarSimulation } from '@/composables/follow/useCarSimulation'
import { useUserControl } from '@/composables/follow/useUserControl'
import { useFOV } from '@/composables/follow/useFOV'

// 配置
const config = reactive({
  followDistance: 150,
  maxLinearSpeed: 100,
  maxAngularSpeed: 3,
  linearPID: { kp: 2.0, ki: 0.1, kd: 0.5 },
  angularPID: { kp: 1.5, ki: 0.05, kd: 0.3 }
})

// 响应式参数
const linearP = ref(config.linearPID.kp)
const linearI = ref(config.linearPID.ki)
const linearD = ref(config.linearPID.kd)
const angularP = ref(config.angularPID.kp)
const angularI = ref(config.angularPID.ki)
const angularD = ref(config.angularPID.kd)
const followDistance = ref(config.followDistance)
const maxLinearSpeed = ref(config.maxLinearSpeed)
const maxAngularSpeed = ref(config.maxAngularSpeed)

// 监听参数变化
watch([linearP, linearI, linearD], ([p, i, d]) => {
  config.linearPID = { kp: p, ki: i, kd: d }
})

watch([angularP, angularI, angularD], ([p, i, d]) => {
  config.angularPID = { kp: p, ki: i, kd: d }
})

watch(followDistance, (val) => { config.followDistance = val })
watch(maxLinearSpeed, (val) => { config.maxLinearSpeed = val })
watch(maxAngularSpeed, (val) => { config.maxAngularSpeed = val })

// 使用仿真hook
const {
  carState,
  personState,
  distance,
  targetAngle,
  update,
  setPersonPosition
} = useCarSimulation(config)

// 使用FOV hook
const { isInFOV, visionLines, visionPath } = useFOV(carState, personState, followDistance)

// 用户控制
const { handleMouseDown, isDraggingPerson } = useUserControl(personState, setPersonPosition)

// 容器尺寸
const containerWidth = 800
const containerHeight = 600

// 计算属性
const horizontalTicks = computed(() => Math.floor(containerWidth / 50))
const verticalTicks = computed(() => Math.floor(containerHeight / 50))

const personStyle = computed(() => ({
  left: `${personState.x}px`,
  top: `${personState.y}px`,
  cursor: isDraggingPerson.value ? 'grabbing' : 'grab'
}))

const carStyle = computed(() => ({
  left: `${carState.x}px`,
  top: `${carState.y}px`,
  transform: `rotate(${carState.angle}rad)`
}))

// 动画循环
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

onMounted(() => {
  lastTime = performance.now()
  animationId = requestAnimationFrame(animate)
})

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
})
</script>

<style scoped>
.simulation-container {
  width: 100%;
  height: 100vh;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
}

.main-layout {
  display: flex;
  gap: 20px;
  max-width: 1200px;
  width: 100%;
  height: 600px;
}

#container {
  position: relative;
  width: 800px;
  height: 600px;
  background: white;
  border: 1px solid #ddd;
  overflow: hidden;
}

.ruler-horizontal, .ruler-vertical {
  position: absolute;
  pointer-events: none;
}

.ruler-horizontal {
  top: 0;
  left: 0;
  width: 100%;
  height: 20px;
  border-bottom: 1px solid #eee;
}

.ruler-vertical {
  top: 0;
  left: 0;
  width: 20px;
  height: 100%;
  border-right: 1px solid #eee;
}

.tick-h, .tick-v {
  position: absolute;
  font-size: 10px;
  color: #999;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.tick-h {
  top: 5px;
  transform: translateX(-50%);
}

.tick-v {
  left: 5px;
  transform: translateY(-50%);
}

#person {
  position: absolute;
  width: 30px;
  height: 30px;
  background: #ff6b6b;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  z-index: 10;
}

#car {
  position: absolute;
  width: 50px;
  height: 30px;
  background: #4ecdc4;
  border: 2px solid #fff;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  z-index: 5;
}

.sidebar {
  width: 300px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.controls, .status {
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 15px;
}

.controls {
  flex: 1;
  overflow-y: auto;
}

.status {
  flex: 1;
  overflow-y: auto;
}

.control-group, .status-group {
  margin-bottom: 15px;
}

.control-group h4, .status-group h4 {
  margin: 0 0 10px 0;
  color: #333;
  font-size: 14px;
}

label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: #666;
}

input[type="range"] {
  width: 100%;
  margin: 5px 0;
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  font-size: 12px;
}

.status-label {
  color: #666;
}

.status-value {
  color: #333;
  font-weight: bold;
}

.in-fov {
  color: #4ecdc4;
}

.out-fov {
  color: #ff6b6b;
}
</style>