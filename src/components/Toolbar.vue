<template>
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
      <!-- 动态渲染按钮列表 -->
      <button 
        v-for="item in currentButtonList" 
        :key="item.msg"
        class="toolbar-btn" 
        @click="handleAction(item.msg)" 
        :title="item.title"
        v-html="item.icon+item.text"
      >
      </button>
      <span v-if="upAndDown(position)" class="divider">|</span>
      <span v-else class="divider">一</span>

      
      <button 
        v-for="item in handleList" 
        :key="item.msg"
        class="toolbar-btn" 
        @click="handleAction(item.msg)" 
        :title="item.title"
        v-html="item.icon+item.text"
      >
      </button>
    </div>
    <div class="toolbar-dock-zones" v-if="isDragging && activeDockZone">
      <div 
        :class="['dock-zone', `dock-zone-${activeDockZone}`]" 
        :style="getDockZoneStyle(activeDockZone)"
      >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { currMode, AppMode, FuncMode } from '@/hooks/useTools'
import { toolBarIcon } from '@/hooks/useIcon'

const position = ref<'top' | 'right' | 'bottom' | 'left'>('top')

function upAndDown(position: string): boolean {
  if (position === 'top' || position === 'bottom') {
    return true
  } else {
    return false
  }
}

// 定义按钮数据结构
interface ButtonItem {
  title: string
  msg: string
  icon: any
  text: string
}

// PNC 模式按钮列表
const pncList: ButtonItem[] = reactive([
  {
    title: 'Follow',
    msg: 'follow',
    icon: toolBarIcon.follow,
    text: upAndDown(position.value) ? '&nbsp;PID' : '',
  },
  {
    title: 'BehaviorTree',
    msg: 'tree',
    icon: toolBarIcon.tree,
    text: upAndDown(position.value) ? '&nbsp;Tree' : '',
  }
])

// POS 模式按钮列表
const posList: ButtonItem[] = reactive([
  {
    title: 'GNSS',
    msg: 'gnss',
    icon: toolBarIcon.gnss,
    text: upAndDown(position.value) ? '&nbsp;GNSS' : '',
  },
  {
    title: 'IMU',
    msg: 'imu',
    icon: toolBarIcon.imu,
    text: upAndDown(position.value) ? '&nbsp;IMU' : '',
  },
  {
    title: 'Vision',
    msg: 'vision',
    icon: toolBarIcon.vision,
    text: upAndDown(position.value) ? '&nbsp;Vision' : '',
  }
])

const handleList: ButtonItem[] = reactive([
  {
    title: 'Draw',
    msg: 'draw',
    icon: toolBarIcon.draw,
    text: upAndDown(position.value) ? '&nbsp;Draw' : '',

  },
  {
    title: 'Data',
    msg: 'data',
    icon: toolBarIcon.data,
    text: upAndDown(position.value) ? '&nbsp;Data' : '',
  },
  {
    title: 'Status',
    msg: 'status',
    icon: toolBarIcon.status,
    text: upAndDown(position.value) ? '&nbsp;Status' : '',
  },
  {
    title: 'Config',
    msg: 'config',
    icon: toolBarIcon.config,
    text: upAndDown(position.value) ? '&nbsp;Config' : '',
  },
])


watch(position, (newPosition) => {
  pncList.forEach(item => {
    item.text = upAndDown(newPosition) ? '&nbsp;'+item.title : ''
  })
  posList.forEach(item => {
    item.text = upAndDown(newPosition) ? '&nbsp;'+item.title : ''
  })
  handleList.forEach(item => {
    item.text = upAndDown(newPosition) ? '&nbsp;'+item.title : ''
  })

})

// 计算属性：根据当前模式返回对应的按钮列表
const currentButtonList = computed(() => {
  switch (currMode.appMode) {
    case AppMode.Pnc:
      return pncList
    case AppMode.Pos:
      return posList
    case AppMode.None:
    default:
      return [] // 不显示任何按钮
  }
})

// 扩展事件定义
const emit = defineEmits<{
  action: [action: string]
  positionChange: [position: 'top' | 'right' | 'bottom' | 'left']
}>()


const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const toolbarRect = ref({ x: 0, y: 0 })
const activeDockZone = ref<'top' | 'right' | 'bottom' | 'left' | null>(null)

const toolbarStyle = computed(() => {
  return {
    left: `${toolbarRect.value.x}px`,
    top: `${toolbarRect.value.y}px`
  }
})

// 新增：根据dock-zone类型返回样式
const getDockZoneStyle = (zone: 'top' | 'right' | 'bottom' | 'left') => {
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  const dockHeight = 40
  const dockWidth = 40
  
  switch (zone) {
    case 'top':
      return {
        top: '0px',
        left: '0px',
        width: `${windowWidth}px`,
        height: `${dockHeight}px`
      }
    case 'right':
      return {
        top: '0px',
        left: `${windowWidth - dockWidth}px`,
        width: `${dockWidth}px`,
        height: `${windowHeight}px`
      }
    case 'bottom':
      return {
        top: `${windowHeight - dockHeight}px`,
        left: '0px',
        width: `${windowWidth}px`,
        height: `${dockHeight}px`
      }
    case 'left':
      return {
        top: '0px',
        left: '0px',
        width: `${dockWidth}px`,
        height: `${windowHeight}px`
      }
    default:
      return {}
  }
}

// 在变量声明区域添加
const originalState = ref({
  x: 0,
  y: 0,
  position: 'top' as const
})

// 修改startDrag函数
const startDrag = (event: MouseEvent) => {
  const handle = (event.target as HTMLElement).closest('.toolbar-handle')
  if (!handle) return

  event.preventDefault()
  isDragging.value = true
  activeDockZone.value = null

  // 保存拖动前的状态
  originalState.value = {
    x: toolbarRect.value.x,
    y: toolbarRect.value.y,
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

// 修改stopDrag函数
const stopDrag = () => {
  if (!isDragging.value) return

  isDragging.value = false
  
  const threshold = 50
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  const x = toolbarRect.value.x
  const y = toolbarRect.value.y

  let shouldSnap = false
  let finalPosition = position.value

  // 计算最近的边缘
  const distances = [
    { zone: 'top' as const, distance: y },
    { zone: 'bottom' as const, distance: windowHeight - y - 50 },
    { zone: 'left' as const, distance: x },
    { zone: 'right' as const, distance: windowWidth - x - 50 }
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
    // 吸附到边缘
    position.value = finalPosition
    emit('positionChange', finalPosition)
    snapToEdge()
  } else {
    // 恢复到拖动前的状态
    toolbarRect.value = { 
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

  event.preventDefault()
  const x = event.clientX - dragOffset.value.x
  const y = event.clientY - dragOffset.value.y

  // 只更新临时位置，不改变实际位置
  toolbarRect.value = { x, y }

  // 简化的边缘检测，只用于高亮显示
  const threshold = 50
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight

  let nearestZone: 'top' | 'right' | 'bottom' | 'left' | null = null
  let minDistance = Infinity

  const distances = [
    { zone: 'top', distance: y },
    { zone: 'bottom', distance: windowHeight - y - 50 },
    { zone: 'left', distance: x },
    { zone: 'right', distance: windowWidth - x - 50 }
  ]

  distances.forEach(({ zone, distance }) => {
    if (distance < threshold && distance < minDistance) {
      minDistance = distance
      nearestZone = zone as 'top' | 'right' | 'bottom' | 'left'
    }
  })

  activeDockZone.value = nearestZone
  // 注意：这里不再调用emit('positionChange')和实时更新position
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
  
  emit('positionChange', position.value)
}

const handleAction = (action: string) => {
  emit('action', action)
}

onMounted(() => {
  snapToEdge()
  window.addEventListener('resize', snapToEdge)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', stopDrag)
  window.removeEventListener('resize', snapToEdge)
})
</script>

<style scoped>
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
  font-size: 12px;
  font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif
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

.divider {
  border: none;
  border-radius: 4px;
  color: #ecf0f1;
  padding: 6px;
  cursor: pointer;
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
  box-sizing: border-box;
}

.dock-zone:hover {
  background: rgba(52, 152, 219, 0.4);
}
</style>
