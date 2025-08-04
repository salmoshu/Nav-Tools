<template>
  <div class="dashboard">
    <div 
      class="toolbar"
      :class="[`toolbar-${position}`, { 'toolbar-dragging': isDragging }]"
      :style="toolbarStyle"
      @mousedown="startDrag"
    >
      <div class="toolbar-handle">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
        </svg>
      </div>
      <div class="toolbar-content">
        <button class="toolbar-btn" @click="handleAction('save')" title="Follow">
          <svg class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" style="height: 16px; width: 16px;">
            <path d="M610.8 138.8v104.7c-34.7-11-71.5-16.9-109.8-16.9s-75.1 5.9-109.8 16.9V138.8C391.2 78.4 440.6 29 501 29c30.2 0 57.6 12.3 77.5 32.3 20 19.8 32.3 47.3 32.3 77.5zM745.9 322l52.5-52.5c32.8-32.8 86.4-32.8 119.2 0 16.4 16.4 24.6 38.1 24.6 59.6 0 21.6-8.2 43.3-24.6 59.6l-76.1 76.1" fill="#F4C9C6"></path><path d="M917.6 269.5c-5.8-5.8-12.3-10.6-19.2-14.3 6.8 12.6 10.3 26.5 10.3 40.4 0 21.6-8.2 43.3-24.6 59.6l-69.4 69.4 26.9 40.1 76.1-76.1c16.4-16.4 24.6-38 24.6-59.6-0.1-21.4-8.3-43.1-24.7-59.5z" fill="#DDADAC"></path><path d="M166.7 449l-60.3-60.3c-16.4-16.4-24.6-38-24.6-59.6 0-21.5 8.2-43.3 24.6-59.6 32.8-32.8 86.4-32.8 119.2 0l42.2 42.2" fill="#F4C9C6"></path><path d="M142.9 306c32.8-32.8 86.4-32.8 119.2 0l-36.5-36.5c-32.8-32.8-86.4-32.8-119.2 0-16.4 16.4-24.6 38.1-24.6 59.6 0 21.6 8.2 43.3 24.6 59.6l36.5 36.5c-16.4-16.4-24.6-38-24.6-59.6 0-21.5 8.3-43.2 24.6-59.6z" fill="#F9E5E5"></path><path d="M942.2 910.8c0 21.6-8.2 43.1-24.6 59.6-32.8 32.8-86.4 32.8-119.2 0L715 887c-1.1-1.1-2.2-2.2-3.1-3.4 45.7-32.8 83.4-76 109.8-126 4.4 2.9 8.7 6.3 12.5 10.2l83.4 83.4c16.4 16.5 24.6 38 24.6 59.6z" fill="#F4C9C6"></path><path d="M917.6 909.8c-32.8 32.8-86.4 32.8-119.2 0l-53.3-53.3c-10.5 9.6-21.6 18.7-33.2 27 0.9 1.2 2 2.3 3.1 3.4l83.4 83.4c32.8 32.8 86.4 32.8 119.2 0 16.4-16.5 24.6-38 24.6-59.6 0-10.3-1.9-20.6-5.7-30.3-4 10.8-10.3 20.8-18.9 29.4z" fill="#DDADAC"></path><path d="M187.4 770.2l-81 81c-16.4 16.5-24.6 38-24.6 59.6s8.2 43.1 24.6 59.6c32.8 32.8 86.4 32.8 119.2 0l77.8-77.8" fill="#F4C9C6"></path><path d="M187.4 770.2l-1.2 1.2 72.1 76-77.8 77.8C155.7 950 119 956 88.4 943.3c4.1 9.8 10.1 19 18 27 32.8 32.8 86.4 32.8 119.2 0l77.8-77.8-116-122.3z" fill="#D8ACAB"></path><path d="M821.7 757.6c26.6-50.4 41.6-107.8 41.6-168.7 0-43.6-7.7-85.4-21.7-124-20.1-55.1-53.2-104-95.6-142.8-38.3-35.3-84.3-62.4-135.1-78.5-34.7-11-71.5-16.9-109.8-16.9s-75.1 5.9-109.8 16.9c-35.6 11.3-68.8 28-98.8 49-8.5 6.1-16.8 12.5-24.7 19.2-43.8 36.7-78.6 83.7-101.1 137.2-17.9 43-27.9 90.2-27.9 139.9 0 66.1 17.7 128 48.6 181.3 28.5 49.3 68.4 91.3 116 122.4 56.9 37 124.6 58.5 197.6 58.5 78.7 0 151.5-25 210.9-67.5" fill="#58A558"></path><path d="M841.5 464.8c-20.1-55.1-53.2-104-95.6-142.8-10.2-9.4-20.9-18.1-32.1-26.3 56.8 64 91.4 148.2 91.4 240.5 0 200.1-162.2 362.3-362.3 362.3-79.4 0-152.8-25.6-212.5-69 21.4 24.1 45.9 45.5 73 63.1 56.9 37 124.6 58.5 197.6 58.5 78.7 0 151.5-25 210.9-67.5l109.8-126c26.6-50.4 41.6-107.8 41.6-168.7 0-43.7-7.7-85.5-21.8-124.1z" fill="#418741"></path><path d="M247.9 830.7c-31-53.4-48.6-115.3-48.6-181.3 0-49.6 10-96.8 27.9-139.9 22.5-53.5 57.3-100.4 101.1-137.3 7.9-6.7 16.2-13.1 24.7-19.2 30-21 63.2-37.7 98.8-49 34.7-11 71.5-16.9 109.8-16.9s75.1 5.9 109.8 16.9c41.9 13.3 80.4 34.1 114.2 60.8-12.1-15.3-25.3-29.7-39.6-42.8-38.3-35.3-84.3-62.4-135.1-78.5-34.7-11-71.5-16.9-109.8-16.9s-75.1 5.9-109.8 16.9c-35.6 11.3-68.8 28-98.8 49-8.5 6.1-16.8 12.5-24.7 19.2-43.8 36.8-78.6 83.8-101.1 137.3-17.9 43-27.9 90.2-27.9 139.9 0 66.1 17.7 128 48.6 181.3 23.1 39.9 53.7 74.9 89.8 103.4-10.7-13.6-20.6-27.9-29.3-42.9z" fill="#72CE72"></path><path d="M501 980.1c-76 0-149.8-21.9-213.4-63.2-51.3-33.4-94.6-79.1-125.3-132.2-34.4-59.2-52.5-127-52.5-195.9 0-52.1 10.1-102.9 30.1-151 24.1-57.2 61.8-108.5 109.2-148.4 7.6-6.4 16-13 26.3-20.5 33.3-23.3 69.2-41.1 107.1-53.1 76.6-24.3 160.5-24.2 237.1 0 54 17.1 104.5 46.5 146 84.8 46.1 42.3 81.9 95.7 103.2 154.2 15.6 42.9 23.5 87.9 23.5 134 0 63.4-15.5 126.5-44.9 182.2-7.5 14.2-25 19.6-39.2 12.1-14.2-7.5-19.6-25-12.1-39.2 25-47.5 38.3-101.1 38.3-155.2 0-39.3-6.7-77.7-20-114.1-18.2-49.8-48.6-95.2-88-131.4C691 310.5 648 285.6 602.1 271c-65.2-20.6-136.8-20.6-202 0-32.2 10.2-62.8 25.4-90.9 45.1-8.7 6.4-16 12-22.6 17.6-40.4 34.1-72.6 77.8-93.1 126.5-17 40.8-25.6 84.1-25.6 128.6 0 58.7 15.5 116.4 44.7 166.8 26.2 45.2 63.1 84.2 106.8 112.7 54.1 35.2 117 53.8 181.8 53.8 70.1 0 137.2-21.5 194-62.1 13-9.3 31.1-6.3 40.4 6.7 9.3 13 6.3 31.1-6.7 40.4-66.8 47.7-145.6 73-227.9 73z" fill="#383F51"></path><path d="M610.8 482.6H413.2c-4.8 0-9.2-2.3-11.9-6.3L280.5 300.6c-4.5-6.6-2.9-15.6 3.7-20.1 6.6-4.5 15.6-2.9 20.1 3.7l116.4 169.4h182.4l105.4-150c4.6-6.5 13.6-8.1 20.2-3.5 6.5 4.6 8.1 13.6 3.5 20.2L622.6 476.4c-2.7 3.9-7.1 6.2-11.8 6.2z" fill="#383F51"></path><path d="M347.3 636.3H171.7c-8 0-14.5-6.5-14.5-14.5s6.5-14.5 14.5-14.5h165.4l51.5-144.1c2.7-7.5 11-11.5 18.5-8.8 7.5 2.7 11.5 11 8.8 18.5L361 626.6c-2.1 5.8-7.5 9.7-13.7 9.7z" fill="#383F51"></path><path d="M325.4 899.7c-2.2 0-4.4-0.5-6.5-1.5-7.2-3.6-10.1-12.3-6.5-19.4L386 731.5l-51.6-103.3c-3.6-7.2-0.7-15.9 6.5-19.4 7.2-3.6 15.9-0.7 19.4 6.5l54.9 109.8c2 4.1 2 8.9 0 13l-76.8 153.7c-2.6 5-7.7 7.9-13 7.9z" fill="#383F51"></path><path d="M742.5 866.8c-3.7 0-7.4-1.4-10.2-4.2L615.8 746H402.2c-8 0-14.5-6.5-14.5-14.5s6.5-14.5 14.5-14.5h219.5c3.8 0 7.5 1.5 10.2 4.2L752.8 842c5.7 5.7 5.7 14.8 0 20.5-2.9 2.9-6.6 4.3-10.3 4.3z" fill="#383F51"></path><path d="M621.8 746c-1.9 0-3.7-0.4-5.6-1.1-7.4-3.1-10.9-11.6-7.8-19l52.3-125.6-62.9-125.8c-3.6-7.2-0.7-15.9 6.5-19.4 7.2-3.6 15.9-0.7 19.4 6.5l65.9 131.7c1.9 3.8 2 8.2 0.4 12.1l-54.9 131.7c-2.3 5.6-7.7 8.9-13.3 8.9z" fill="#383F51"></path><path d="M841.3 614.3H676.7c-8 0-14.5-6.5-14.5-14.5s6.5-14.5 14.5-14.5h164.7c8 0 14.5 6.5 14.5 14.5s-6.6 14.5-14.6 14.5z" fill="#383F51"></path><path d="M427.7 175.2c0-60.4 49.4-109.8 109.8-109.8 20.9 0 40.4 6 57.1 16.2-4.6-7.4-9.9-14.3-16-20.4C558.7 41.3 531.2 29 501 29c-60.4 0-109.8 49.4-109.8 109.8v104.7c11.9-3.8 24.1-6.7 36.5-9.2v-59.1z" fill="#FFEBEB"></path><path d="M610.8 272.5c-2.9 0-5.9-0.4-8.7-1.4-65.2-20.6-136.8-20.6-202.1 0-8.8 2.8-18.4 1.2-25.9-4.3s-11.9-14.1-11.9-23.4V138.8C362.3 62.2 424.5 0 501 0c37 0 71.9 14.5 98 40.8 26.2 26.1 40.7 60.9 40.7 97.9v104.7c0 9.2-4.4 17.9-11.9 23.4-4.9 3.7-10.9 5.7-17 5.7zM501 58c-44.5 0-80.8 36.2-80.8 80.8V206c53-11.1 108.6-11.1 161.6 0v-67.2c0-21.5-8.4-41.7-23.7-57C542.8 66.4 522.5 58 501 58zM841.5 493.8c-7.4 0-14.8-2.8-20.5-8.5-11.3-11.3-11.3-29.7 0-41l76.1-76.1c10.4-10.4 16.1-24.3 16.1-39.1 0-14.6-5.9-28.9-16.1-39.1-21.6-21.6-56.7-21.6-78.2 0l-52.5 52.5c-11.3 11.3-29.7 11.3-41 0s-11.3-29.7 0-41l52.5-52.5c44.2-44.2 116-44.2 160.2 0 21 21 33.1 50.2 33.1 80.1 0 30.3-11.7 58.8-33.1 80.1L862 485.3c-5.6 5.6-13 8.5-20.5 8.5zM166.7 478c-7.4 0-14.8-2.8-20.5-8.5l-60.3-60.3c-21.3-21.3-33.1-49.8-33.1-80.1 0-29.9 12.1-59.1 33.1-80.1 44.2-44.2 116-44.2 160.2 0l42.2 42.2c11.3 11.3 11.3 29.7 0 41s-29.7 11.3-41 0L205.1 290c-21.6-21.6-56.7-21.6-78.2 0-10.2 10.2-16.1 24.5-16.1 39.1 0 14.8 5.7 28.7 16.1 39.1l60.3 60.3c11.3 11.3 11.3 29.7 0 41-5.7 5.6-13.1 8.5-20.5 8.5zM858 1024c-30.3 0-58.8-11.8-80.1-33.1l-83.4-83.4c-1.6-1.5-3.8-3.8-6-6.9-4.5-6.2-6.4-14-5.2-21.6 1.2-7.6 5.4-14.4 11.7-18.9 42.1-30.3 77-70.4 101-116 3.8-7.2 10.4-12.5 18.3-14.5 7.9-2.1 16.3-0.7 23.1 3.7 6.5 4.2 12.4 9 17.5 14.3l83.1 83.1c21.4 21.5 33.1 49.9 33.1 80.1 0 30.2-11.7 58.6-33 80S888.3 1024 858 1024zM755.3 886.3l63.6 63.6c10.4 10.4 24.3 16.1 39.1 16.1s28.7-5.7 39.1-16.1c10.4-10.4 16.1-24.3 16.1-39.1s-5.7-28.7-16.2-39.2L828.5 803c-20.3 31-45.1 59.1-73.2 83.3zM166 1024c-30.3 0-58.8-11.8-80.1-33.1-21.3-21.5-33.1-49.9-33.1-80.1 0-30.2 11.7-58.6 33-80l81.1-81.1c11.3-11.3 29.7-11.3 41 0s11.3 29.7 0 41l-81 81c-10.4 10.4-16.1 24.3-16.1 39.1s5.7 28.7 16.2 39.2c10.3 10.3 24.2 16.1 39.1 16.1 14.8 0 28.7-5.7 39.1-16.1l77.8-77.8c11.3-11.3 29.7-11.3 41 0s11.3 29.7 0 41L246.2 991c-21.5 21.2-49.9 33-80.2 33z" fill="#383F51"></path><path d="M435.2 138.8m-22 0a22 22 0 1 0 44 0 22 22 0 1 0-44 0Z" fill="#383F51"></path><path d="M566.9 138.8m-22 0a22 22 0 1 0 44 0 22 22 0 1 0-44 0Z" fill="#383F51"></path>
          </svg>
        </button>
        <button class="toolbar-btn" @click="handleAction('refresh')" title="BehaviorTree">
          <svg class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" fill="#fff" style="height: 16px; width: 16px;">
            <path d="M869.24 681.55H837.1V546.07c0-42.74-34.81-77.52-77.59-77.52H544.62v-126.9h32.93c30.97 0 56.17-25.18 56.17-56.12V153.67c0-30.95-25.2-56.13-56.17-56.13H445.59c-30.97 0-56.17 25.18-56.17 56.13v131.85c0 30.95 25.2 56.13 56.17 56.13h29.53v126.91H263.64c-42.79 0-77.59 34.78-77.59 77.52V681.5h-32.16c-30.96 0.07-56.14 25.26-56.14 56.18v131.85c0 30.95 25.2 56.12 56.17 56.12h132c30.97 0 56.17-25.17 56.17-56.12V737.68c0-30.95-25.2-56.13-56.17-56.13h-30.33V546.07c0-4.42 3.62-8.03 8.05-8.03h211.44V681.5H445.6c-30.97 0-56.16 25.18-56.16 56.13v131.85c0 30.95 25.2 56.12 56.16 56.12h132c30.97 0 56.17-25.17 56.17-56.12V737.63c0-30.95-25.2-56.13-56.17-56.13h-32.93V538.09h214.89c4.44 0 8.05 3.61 8.05 8.03v135.42h-30.33c-30.97 0-56.17 25.18-56.17 56.13v131.86c0 30.94 25.2 56.12 56.17 56.12h132.01c30.97 0 56.17-25.17 56.17-56.12V737.65c-0.07-30.93-25.29-56.1-56.22-56.1z m0 0"></path>
          </svg>
        </button>
      </div>
      <div class="toolbar-dock-zones">
        <div class="dock-zone dock-zone-top" @mouseenter="setDockPosition('top')">
          <span>顶部</span>
        </div>
        <div class="dock-zone dock-zone-right" @mouseenter="setDockPosition('right')">
          <span>右侧</span>
        </div>
        <div class="dock-zone dock-zone-bottom" @mouseenter="setDockPosition('bottom')">
          <span>底部</span>
        </div>
        <div class="dock-zone dock-zone-left" @mouseenter="setDockPosition('left')">
          <span>左侧</span>
        </div>
      </div>
    </div>

    <div class="dashboard-content">
      <h1>Dashboard</h1>
      <p>拖拽工具栏到任意边缘进行停靠</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const position = ref<'top' | 'right' | 'bottom' | 'left'>('top')
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const toolbarRect = ref({ x: 0, y: 0 })

const toolbarStyle = computed(() => {
  return {}
})

const startDrag = (event: MouseEvent) => {
  const handle = (event.target as HTMLElement).closest('.toolbar-handle')
  if (!handle) return
  
  event.preventDefault()
  isDragging.value = true
  
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  dragOffset.value = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  }
  
  document.addEventListener('mousemove', handleDrag)
  document.addEventListener('mouseup', stopDrag)
}

const handleDrag = (event: MouseEvent) => {
  if (!isDragging.value) return
  
  event.preventDefault()
  const x = event.clientX - dragOffset.value.x
  const y = event.clientY - dragOffset.value.y
  
  toolbarRect.value = { x, y }
  
  // 检测是否接近边缘
  const threshold = 50
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  
  if (y < threshold) {
    position.value = 'top'
  } else if (y > windowHeight - threshold - 50) {
    position.value = 'bottom'
  } else if (x < threshold) {
    position.value = 'left'
  } else if (x > windowWidth - threshold - 50) {
    position.value = 'right'
  }
}

const stopDrag = () => {
  isDragging.value = false
  
  // 自动吸附到边缘
  snapToEdge()
  
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', stopDrag)
}

const snapToEdge = () => {
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  
  switch (position.value) {
    case 'top':
      toolbarRect.value = { x: 0, y: 0 }
      break
    case 'right':
      toolbarRect.value = { x: windowWidth - 40, y: 0 }
      break
    case 'bottom':
      toolbarRect.value = { x: 0, y: windowHeight - 40 }
      break
    case 'left':
      toolbarRect.value = { x: 0, y: 0 }
      break
  }
}

const setDockPosition = (newPosition: 'top' | 'right' | 'bottom' | 'left') => {
  position.value = newPosition
  snapToEdge()
}

const handleAction = (action: string) => {
  console.log(`执行操作: ${action}`)
  // 这里可以添加具体的工具栏操作
}

onMounted(() => {
  snapToEdge()
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', stopDrag)
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

.toolbar-top {
  top: 0;
  left: 0;
  width: 100%;
  height: 40px;
  transform: none;
  border-radius: 0;
  flex-direction: row;
  padding: 0;
  margin: 0;
}

.toolbar-bottom {
  bottom: 0;
  left: 0;
  width: 100%;
  height: 40px;
  transform: none;
  border-radius: 0;
  flex-direction: row;
  padding: 0;
  margin: 0;
}

.toolbar-left {
  top: 0;
  left: 0;
  width: 40px;
  height: 100%;
  transform: none;
  border-radius: 0;
  flex-direction: column;
  padding: 0;
  margin: 0;
}

.toolbar-right {
  top: 0;
  right: 0;
  width: 40px;
  height: 100%;
  transform: none;
  border-radius: 0;
  flex-direction: column;
  padding: 0;
  margin: 0;
}

.toolbar {
  position: fixed;
  background: #2c3e50;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  transition: none;
  padding: 0;
  margin: 0;
  border: none;
}

.toolbar-handle {
  color: #ecf0f1;
  cursor: grab;
  padding: 4px;
  margin-right: 8px;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.toolbar-handle:hover {
  opacity: 1;
}

.toolbar-left .toolbar-handle,
.toolbar-right .toolbar-handle {
  margin-right: 0;
  margin-bottom: 8px;
  transform: rotate(90deg);
}

.toolbar-content {
  display: flex;
  gap: 4px;
}

.toolbar-left .toolbar-content,
.toolbar-right .toolbar-content {
  flex-direction: column;
}

.toolbar-btn {
  background: #34495e;
  border: none;
  border-radius: 4px;
  color: #ecf0f1;
  padding: 6px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toolbar-left .toolbar-btn,
.toolbar-right .toolbar-btn {
  padding: 12px 6px;
  font-size: 12px;
  flex: none;
}

.toolbar-btn:hover {
  background: #3498db;
  transform: scale(1.1);
}

.toolbar-dock-zones {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
  z-index: 998;
}

.toolbar-dragging .toolbar-dock-zones {
  opacity: 1;
  pointer-events: auto;
}

.dock-zone {
  position: fixed;
  background: rgba(52, 152, 219, 0.2);
  border: 2px dashed #3498db;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #3498db;
  font-size: 12px;
  font-weight: bold;
  z-index: 999;
  transition: all 0.3s;
}

.dock-zone:hover {
  background: rgba(52, 152, 219, 0.4);
}

.dock-zone-top {
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 200px;
  height: 40px;
}

.dock-zone-right {
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  width: 40px;
  height: 200px;
}

.dock-zone-bottom {
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 200px;
  height: 40px;
}

.dock-zone-left {
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  width: 40px;
  height: 200px;
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

/* 响应式设计 */
@media (max-width: 768px) {
  .toolbar {
    transform: scale(0.8);
  }
  
  .toolbar-top,
  .toolbar-bottom {
    min-width: 150px;
  }
  
  .toolbar-left,
  .toolbar-right {
    min-height: 150px;
  }
}
</style>
