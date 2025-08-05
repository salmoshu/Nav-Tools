<template>
  <div class="dashboard">
    <Toolbar 
      @action="handleToolbarAction" 
      @positionChange="handleToolbarPositionChange"
    />
    
    <div 
      class="dashboard-content" 
      :class="{ 
        'simulation-mode': currentMode === 'follow',
        'toolbar-top': toolbarPosition === 'top',
        'toolbar-bottom': toolbarPosition === 'bottom',
        'toolbar-left': toolbarPosition === 'left',
        'toolbar-right': toolbarPosition === 'right'
      }"
    >
      <div v-if="currentMode === 'follow'" class="simulation-wrapper">
        <PidFollowSimulation />
      </div>
      <div v-else class="default-content">
        <h1>Dashboard</h1>
        <p>拖拽工具栏到任意边缘进行停靠</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Toolbar from './Toolbar.vue'
import PidFollowSimulation from './pnc/PidFollowSimulation.vue'

const currentMode = ref<'default' | 'follow'>('default')
const toolbarPosition = ref<'top' | 'right' | 'bottom' | 'left'>('top')

const handleToolbarAction = (action: string) => {
  console.log(`执行操作: ${action}`)
  
  switch (action) {
    case 'follow':
      currentMode.value = 'follow'
      break
    case 'tree':
      currentMode.value = 'default'
      break
    default:
      console.log(`未知操作: ${action}`)
  }
}

const handleToolbarPositionChange = (position: 'top' | 'right' | 'bottom' | 'left') => {
  toolbarPosition.value = position
}
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
  
  /* 默认状态 - 为顶部工具栏预留空间 */
  padding-top: 40px;
  padding-right: 0;
  padding-bottom: 0;
  padding-left: 0;
}

/* 动态布局类 */
.dashboard-content.toolbar-top {
  padding-top: 40px;
  padding-right: 0;
  padding-bottom: 0;
  padding-left: 0;
}

.dashboard-content.toolbar-bottom {
  padding-top: 0;
  padding-right: 0;
  padding-bottom: 40px;
  padding-left: 0;
}

.dashboard-content.toolbar-left {
  padding-top: 0;
  padding-right: 0;
  padding-bottom: 0;
  padding-left: 40px;
}

.dashboard-content.toolbar-right {
  padding-top: 0;
  padding-right: 40px;
  padding-bottom: 0;
  padding-left: 0;
}

.simulation-mode {
  background: #f5f5f5;
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
