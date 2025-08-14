<!-- src/components/follow/FollowDraw.vue -->
<script lang="ts" setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useFollowStore } from '@/stores/follow'
import { useFollowSimulation } from '@/composables/follow/useFollow'

const store = useFollowStore()
const { update } = useFollowSimulation()

// 基础状态
const containerWidth = 800
const containerHeight = 600

const horizontalTicks = computed(() => Math.floor(containerWidth / 50))
const verticalTicks = computed(() => Math.floor(containerHeight / 50))

// 拖拽状态
const isDraggingPerson = ref(false)

// 样式计算
const personStyle = computed(() => ({
  left: `${store.person.x}px`,
  top: `${store.person.y}px`,
  cursor: isDraggingPerson.value ? 'grabbing' : 'grab'
}))

const carStyle = computed(() => ({
  left: `${store.car.x}px`,
  top: `${store.car.y}px`,
  transform: `rotate(${store.car.angle}rad)`
}))

// 拖拽功能
const handleMouseDown = (event: MouseEvent) => {
  isDraggingPerson.value = true
  
  const container = document.getElementById('container')
  if (!container) return
  
  const rect = container.getBoundingClientRect()
  
  const handleMouseMove = (e: MouseEvent) => {
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    store.updatePersonPosition({
      x: Math.max(0, Math.min(x, containerWidth - 30)),
      y: Math.max(0, Math.min(y, containerHeight - 30))
    })
  }
  
  const handleMouseUp = () => {
    isDraggingPerson.value = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }
  
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

// 仿真循环
let animationId: number
const animate = () => {
  update(1/60) // 60fps
  animationId = requestAnimationFrame(animate)
}

onMounted(() => {
  if (store.status.isRunning) {
    animate()
  }
})

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
})

// 监听运行状态
import { watch } from 'vue'
watch(() => store.status.isRunning, (isRunning) => {
  if (isRunning) {
    animate()
  } else if (animationId) {
    cancelAnimationFrame(animationId)
  }
})
</script>

<template>
  <div id="container" ref="container">
    <!-- 标尺和视觉元素保持不变 -->
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
    
    <!-- 视野辅助线 -->
    <svg class="vision-lines">
      <path 
        v-if="store.vision.visionPath && store.vision.visionPath !== 'M 0 0 L 0 0'"
        :d="store.vision.visionPath" 
        class="vision-cone"
        fill="rgba(255, 255, 0, 0.1)"
        stroke="rgba(255, 255, 0, 0.8)"
        stroke-width="1"
      />
      
      <line
        v-if="store.vision.visionLines.left"
        :x1="store.vision.visionLines.left.x1"
        :y1="store.vision.visionLines.left.y1"
        :x2="store.vision.visionLines.left.x2"
        :y2="store.vision.visionLines.left.y2"
        stroke="rgba(255, 255, 0, 1)"
        stroke-width="1"
      />
      <line
        v-if="store.vision.visionLines.right"
        :x1="store.vision.visionLines.right.x1"
        :y1="store.vision.visionLines.right.y1"
        :x2="store.vision.visionLines.right.x2"
        :y2="store.vision.visionLines.right.y2"
        stroke="rgba(255, 255, 0, 1)"
        stroke-width="1"
      />
      <line
        v-if="store.vision.visionLines.center"
        :x1="store.vision.visionLines.center.x1"
        :y1="store.vision.visionLines.center.y1"
        :x2="store.vision.visionLines.center.x2"
        :y2="store.vision.visionLines.center.y2"
        stroke="rgba(255, 255, 0, 1)"
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
</template>

<style scoped>
/* 样式保持不变 */
#container {
  position: relative;
  margin: 0 auto;
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

.vision-lines {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 100;
}

.vision-cone {
  filter: drop-shadow(0 0 3px rgba(255, 255, 0, 0.4));
}
</style>