<template>
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
    <!-- 在FollowDraw.vue中增强FOV显示 -->
    <svg class="vision-lines" :style="{
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 100
    }">
      <!-- 扇形区域 - 黄色主题，降低透明度 -->
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
        stroke="rgba(255, 255, 0, 1)"
        stroke-width="1"
      />
      <line
        :x1="visionLines.right.x1"
        :y1="visionLines.right.y1"
        :x2="visionLines.right.x2"
        :y2="visionLines.right.y2"
        stroke="rgba(255, 255, 0, 1)"
        stroke-width="1"
      />
      
      <!-- 中心线 - 黄色虚线 -->
      <line
        :x1="visionLines.center.x1"
        :y1="visionLines.center.y1"
        :x2="visionLines.center.x2"
        :y2="visionLines.center.y2"
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

<script lang="ts" setup>
import { computed } from 'vue'

const props = defineProps<{
  carState: any
  personState: any
  visionLines: any
  visionPath: string
  isDraggingPerson: boolean
  handleMouseDown: (event: MouseEvent) => void
}>()

const containerWidth = 600
const containerHeight = 600

const horizontalTicks = computed(() => Math.floor(containerWidth / 50))
const verticalTicks = computed(() => Math.floor(containerHeight / 50))

const personStyle = computed(() => ({
  left: `${props.personState.x}px`,
  top: `${props.personState.y}px`,
  cursor: props.isDraggingPerson ? 'grabbing' : 'grab'
}))

const carStyle = computed(() => ({
  left: `${props.carState.x}px`,
  top: `${props.carState.y}px`,
  transform: `rotate(${props.carState.angle}rad)`
}))
</script>

<style scoped>
#container {
  position: relative;
  margin: 0 auto;
  width: 640px;
  height: 640px;
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
</style>

<style scoped>
/* 原有样式保持不变 */

/* 增强视野线的样式 */
.vision-cone {
  filter: drop-shadow(0 0 3px rgba(255, 255, 0, 0.4));
}
</style>