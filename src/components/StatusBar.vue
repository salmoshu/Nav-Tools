<template>
  <div 
    class="statusbar"
    :class="[`statusbar-${position}`, { 'statusbar-dragging': isDragging }]"
    :style="statusbarStyle"
    @mousedown="startDrag"
  >
    <div class="statusbar-handle">
      <span>Status View</span>
    </div>
    <div class="statusbar-content">
      <div v-for="(statusValue, statusName) in getMonitorStatus()" :key="statusName" class="status-item">
        <div class="status-item-row">
          <span class="status-label">{{ statusName }}</span>
          <span class="status-indicator" :style="getStatusStyle(statusValue)">{{ getStatusValue(statusValue) }}</span>
        </div>
      </div>
    </div>
    <div class="statusbar-dock-zones" v-if="isDragging && activeDockZone">
      <div 
        :class="['dock-zone', `dock-zone-${activeDockZone}`]" 
        :style="getDockZoneStyle(activeDockZone)"
      >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject, watch, type Ref } from 'vue'
import { getMonitorStatus } from '@/composables/useStatusManager'
import { navMode } from '@/settings/config'

const commonStyle = {
  trueStyle: 'color: #00b894; background: rgba(0, 184, 148, 0.1); font-weight: 700;',
  falseStyle: 'color: #ff6b6b; background: rgba(255, 107, 107, 0.1); font-weight: 700;'
}

const getStatusStyle = (status: any) => {
  if (typeof status === 'boolean') {
    return status ? commonStyle.trueStyle : commonStyle.falseStyle
  }
  return ''
}

const getStatusValue = (status: any) => {
  if (typeof status === 'boolean') {
    return status ? 'True' : 'False'
  }
  if (typeof status === 'number') {
    return status.toFixed(2)
  }
  return status
}

const dockWidth = 150
const position = ref<'left' | 'right'>('right')
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const statusbarRect = ref({ x: 0, y: 0 })
const activeDockZone = ref<'left' | 'right' | null>(null)

const emit = defineEmits<{
  positionChange: [position: 'left' | 'right']
}>()

const originalState = ref({
  x: 0,
  y: 0,
  position: 'right' as const
})

const statusbarStyle = computed(() => {
  return {
    left: `${statusbarRect.value.x}px`,
    top: `${statusbarRect.value.y}px`
  }
})

const getDockZoneStyle = (zone: 'left' | 'right') => {
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  const toolbarWidth = toolbarSize?.value?.width || 40
  
  switch (zone) {
    case 'left':
      // 当toolbar也在左边时，dock-zone应该从toolbar右侧开始
      const leftOffset = toolbarPosition?.value === 'left' ? toolbarWidth : 0
      return {
        top: '0px',
        left: `${leftOffset}px`,
        width: `${dockWidth}px`,
        height: `${windowHeight}px`
      }
    case 'right':
      // 当toolbar也在右边时，dock-zone应该从toolbar左侧开始
      const rightOffset = toolbarPosition?.value === 'right' ? toolbarWidth : 0
      return {
        top: '0px',
        left: `${windowWidth - dockWidth - rightOffset}px`,
        width: `${dockWidth}px`,
        height: `${windowHeight}px`
      }
    default:
      return {}
  }
}

const startDrag = (event: MouseEvent) => {
  const handle = (event.target as HTMLElement).closest('.statusbar-handle')
  if (!handle) return

  isDragging.value = true
  activeDockZone.value = null

  originalState.value = {
    x: statusbarRect.value.x,
    y: statusbarRect.value.y,
    position: position.value as typeof originalState.value.position
  }

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  dragOffset.value = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  }

  document.addEventListener('mousemove', handleDrag)
  document.addEventListener('mouseup', stopDrag)
}

const stopDrag = () => {
  if (!isDragging.value) return

  isDragging.value = false
  
  const threshold = 50
  const windowWidth = window.innerWidth
  const x = statusbarRect.value.x

  let shouldSnap = false
  let finalPosition = position.value

  // 只考虑左右两侧的吸附
  const distances = [
    { zone: 'left' as const, distance: x },
    { zone: 'right' as const, distance: windowWidth - x - dockWidth }
  ]

  let minDistance = Infinity
  distances.forEach(({ zone, distance }) => {
    if (distance < threshold && distance < minDistance) {
      minDistance = distance
      finalPosition = zone
      shouldSnap = true
    }
  })

  if (shouldSnap) {
    position.value = finalPosition
    emit('positionChange', finalPosition)
    snapToEdge()
  } else {
    statusbarRect.value = { 
      x: originalState.value.x, 
      y: originalState.value.y 
    }
    position.value = originalState.value.position
    emit('positionChange', originalState.value.position)
  }

  activeDockZone.value = null
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', stopDrag)
}

const handleDrag = (event: MouseEvent) => {
  if (!isDragging.value) return

  const x = event.clientX - dragOffset.value.x
  const y = event.clientY - dragOffset.value.y

  statusbarRect.value = { x, y }

  // 只检测左右两侧的吸附区域
  const threshold = 50
  const windowWidth = window.innerWidth

  let nearestZone: 'left' | 'right' | null = null
  let minDistance = Infinity

  const distances = [
    { zone: 'left', distance: x },
    { zone: 'right', distance: windowWidth - x - dockWidth }
  ]

  distances.forEach(({ zone, distance }) => {
    if (distance < threshold && distance < minDistance) {
      minDistance = distance
      nearestZone = zone as 'left' | 'right'
    }
  })

  activeDockZone.value = nearestZone
}

// 注入工具栏位置信息
const toolbarPosition = inject<Ref<'top' | 'right' | 'bottom' | 'left'>>('toolbarPosition')
const toolbarSize = inject<Ref<{width: number, height: number}>>('toolbarSize')

const snapToEdge = () => {
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  const toolbarHeight = toolbarSize?.value?.height || 40
  const toolbarWidth = toolbarSize?.value?.width || 40

  switch (position.value) {
    case 'left':
      // 当状态栏在左边时，考虑工具栏的位置
      if (toolbarPosition?.value === 'left') {
        // 如果工具栏也在左边，状态栏在工具栏右侧（toolbar宽度40px）
        statusbarRect.value = { x: toolbarWidth, y: 0 }
      } else if (toolbarPosition?.value === 'top') {
        // 如果工具栏在上边，状态栏从顶部偏移
        statusbarRect.value = { x: 0, y: toolbarHeight }
      } else {
        statusbarRect.value = { x: 0, y: 0 }
      }
      break
    case 'right':
      // 当状态栏在右边时，考虑工具栏的位置
      if (toolbarPosition?.value === 'right') {
        // 如果工具栏也在右边，状态栏在工具栏左侧（toolbar宽度40px）
        statusbarRect.value = { x: windowWidth - dockWidth - toolbarWidth, y: 0 }
      } else if (toolbarPosition?.value === 'top') {
        // 如果工具栏在上边，状态栏从顶部偏移
        statusbarRect.value = { x: windowWidth - dockWidth, y: toolbarHeight }
      } else {
        statusbarRect.value = { x: windowWidth - dockWidth, y: 0 }
      }
      break
  }
  
  emit('positionChange', position.value)
}

onMounted(() => {
  snapToEdge()
  window.addEventListener('resize', snapToEdge)
  // updateStatus(navMode.funcMode)

  watch(() => navMode.funcMode, () => {
    // updateStatus(navMode.funcMode)
  })
  
  // 监听工具栏位置变化
  watch([toolbarPosition, toolbarSize], () => {
    snapToEdge()
  }, { immediate: true })
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', stopDrag)
  window.removeEventListener('resize', snapToEdge)
})
</script>

<style scoped>
.statusbar {
  position: fixed;
  background-color: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 999;
  border: 3px solid rgb(210, 210, 210);
  border-top: 2px solid rgb(210, 210, 210);
  border-radius: 0;
  padding: 0;
  margin: 0;
  width: 150px;
  height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  overflow: auto;
  user-select: none;        /* 现代浏览器 */
  -webkit-user-select: none;/* Safari */
  -moz-user-select: none;   /* Firefox */
  -ms-user-select: none;    /* IE11/Edge 旧版 */
}

.statusbar:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.statusbar-left {
  left: 0;
  top: 0;
  border-radius: 0;
}

.statusbar-right {
  right: 0;
  top: 0;
  border-radius: 0;
}

.statusbar-handle {
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  font-weight: 600;
  color: #333;
  cursor: grab;
  padding: 12px 8px;
  margin: 0 auto;
  text-align: center;
  background-color: #f8f9fa;
  border-bottom: 2px solid #dee2e6;
  width: 100%;
  height: 40px;
  box-sizing: border-box;
  border-radius: 0;
}

.statusbar-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  padding: 10px;
  width: 100%;
  box-sizing: border-box;
}

.statusbar-content h3 {
  margin: 0;
  padding: 4px 0;
  font-size: 12px;
  text-align: center;
  border-bottom: 1px solid #34495e;
  margin-bottom: 4px;
}

.status-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px;
  /* background: #fbfcfc; */
  /* border: 1px solid #e9ecef; */
  /* border-radius: 8px; */
  /* box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); */
  transition: all 0.3s ease;
  margin: 4px 0;
}

.status-item:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  background: rgba(233, 236, 239, 0.8);
  transform: translateY(-2px);
  /* border-radius: 6px; */
}

.status-label {
  color: #6c757d;
  font-weight: 600;
  font-size: 12px;
  line-height: 1.5;
  box-sizing: border-box;
  text-align: left;
  min-width: 60px; /* 确保标签有足够宽度 */
}

.status-indicator {
  color: #2c3e50;
  font-weight: 600;
  font-size: 14px;
  padding: 4px 8px;
  /* border-radius: 6px; */
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  box-sizing: border-box;
  text-align: right;
  flex-grow: 1; /* 让指示器占据剩余空间 */
}

.statusbar-dock-zones {
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

.statusbar-dragging .statusbar-dock-zones {
  opacity: 1;
  pointer-events: auto;
}

.status-item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.dock-zone {
  position: fixed;
  background: rgba(52, 152, 219, 0.2);
  border: 2px dashed #3498db;
  /* border-radius: 8px; */
  display: flex;
  align-items: center;
  justify-content: center;
  color: #3498db;
  font-size: 12px;
  font-weight: bold;
  z-index: 999;
  transition: all 0.3s;
  box-sizing: border-box;
}

.dock-zone:hover {
  background: rgba(52, 152, 219, 0.4);
}
</style>
