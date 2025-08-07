<template>
  <div v-if="navMode.funcMode == FuncMode.Follow" class="follow-container">
    <FollowDraw 
      :car-state="carState"
      :person-state="personState"
      :vision-lines="visionLines"
      :vision-path="visionPath"
      :is-dragging-person="isDraggingPerson"
      :handle-mouse-down="handleMouseDown"
    />
  </div>
  <div v-else-if="false">
    <p>其他模块</p>
  </div>
</template>

<script lang="ts" setup>
import { reactive, onMounted, onUnmounted } from 'vue'
import { FuncMode } from '@/types/mode'
import { useFollowMain } from '@/composables/follow/useFollowMain'
import FollowDraw from '@/components/follow/FollowDraw.vue'

// 从useMain获取所有状态和方法
const {
  carState,
  personState,
  visionLines,
  visionPath,
  isDraggingPerson,
  handleMouseDown,
  startAnimation,
  stopAnimation
} = useFollowMain()


// 导航模式
const navMode = reactive({
  funcMode: FuncMode.Follow
})

// 组件生命周期
onMounted(() => {
  startAnimation()
})

onUnmounted(() => {
  stopAnimation()
})
</script>

<style scoped>
.follow-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
