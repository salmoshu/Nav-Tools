<template>
  <div class="dashboard">
    <Toolbar 
      @action="handleToolbarAction" 
      @positionChange="handleToolbarPositionChange"
    />
    
    <div 
      class="dashboard-content" 
      :class="{ 
        'toolbar-top': toolbarPosition === 'top',
        'toolbar-bottom': toolbarPosition === 'bottom',
        'toolbar-left': toolbarPosition === 'left',
        'toolbar-right': toolbarPosition === 'right'
      }"
      :style="contentStyle"
    >
      <!-- <div v-if="currentMode === 'follow'" class="simulation-wrapper">
        <PidFollowSimulation />
      </div> -->
      <div class="default-content">
        <h1>Dashboard</h1>
        <p>拖拽工具栏到任意边缘进行停靠</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import Toolbar from './Toolbar.vue'
import { currMode, AppMode, FuncMode } from '@/hooks/useTools'
// import PidFollowSimulation from './pnc/PidFollowSimulation.vue'

const currentMode = ref<'default' | 'follow'>('default')
const toolbarPosition = ref<'top' | 'right' | 'bottom' | 'left'>('top')

const handleToolbarAction = (action: string) => {
  console.log(`执行操作: ${action}`)
  
  switch (action) {
    /* PNC */
    case 'follow':
      currentMode.value = 'follow'
      currMode.funcMode = FuncMode.Follow
      break
    case 'tree':
      currentMode.value = 'default'
      currMode.funcMode = FuncMode.BehaviorTree
      break
    /* POS */
    case 'gnss':
      currentMode.value = 'default'
      currMode.funcMode = FuncMode.Gnss
      break
    case 'imu':
      currentMode.value = 'default'
      currMode.funcMode = FuncMode.Imu
      break
    case 'vision':
      currentMode.value = 'default'
      currMode.funcMode = FuncMode.Vision
      break
    default:
      currMode.funcMode = FuncMode.None
      console.log(`未知操作: ${action}`)
  }
}

const handleToolbarPositionChange = (position: 'top' | 'right' | 'bottom' | 'left') => {
  toolbarPosition.value = position
}

const toolbarSize = ref({
  width: 40,  // 工具栏宽度
  height: 40  // 工具栏高度
})

const contentStyle = computed(() => {
  const size = toolbarSize.value
  switch (toolbarPosition.value) {
    case 'top':
      return {
        height: `calc(100vh - ${size.height}px)`,
        marginTop: `${size.height}px`
      }
    case 'bottom':
      return {
        height: `calc(100vh - ${size.height}px)`,
        marginBottom: `${size.height}px`
      }
    case 'left':
      return {
        width: `calc(100vw - ${size.width}px)`,
        marginLeft: `${size.width}px`
      }
    case 'right':
      return {
        width: `calc(100vw - ${size.width}px)`,
        marginRight: `${size.width}px`
      }
    default:
      return {}
  }
})
</script>

<style scoped>
.dashboard {
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  background-color: #F0F0F0;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.dashboard-content {
  width: 100%;
  height: 100%;
  transition: all 0.3s ease;
  position: relative;
  box-sizing: border-box;
  border: 5px solid #E0E0E0;
}

.simulation-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.default-content {
  text-align: center;
  color: #2c3e50;
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.default-content h1 {
  margin-bottom: 20px;
  font-size: 2.5em;
  font-weight: 300;
}

.default-content p {
  font-size: 1.2em;
  color: #7f8c8d;
  margin: 10px 0;
}

/* 响应式调整 */
@media screen and (max-width: 768px) {
  .dashboard-content.toolbar-top,
  .dashboard-content.toolbar-bottom {
    padding-top: 40px;
    padding-bottom: 40px;
  }
  
  .dashboard-content.toolbar-left,
  .dashboard-content.toolbar-right {
    padding-left: 40px;
    padding-right: 40px;
  }
}
</style>
