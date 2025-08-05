<template>
  <div class="dashboard">
    <Toolbar @action="handleToolbarAction" />
    
    <div class="dashboard-content">
      <h1>Dashboard</h1>
      <p>拖拽工具栏到任意边缘进行停靠</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import Toolbar from './Toolbar.vue'

const handleToolbarAction = (action: string) => {
  console.log(`执行操作: ${action}`)
  // 这里可以添加具体的工具栏操作
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
  padding: 60px 20px 20px;
  text-align: center;
  color: #2c3e50;
}

.dashboard-content h1 {
  margin-bottom: 20px;
  font-size: 2.5em;
  font-weight: 300;
}

.dashboard-content p {
  font-size: 1.2em;
  color: #7f8c8d;
}
</style>
