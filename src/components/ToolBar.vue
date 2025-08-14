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
      <!-- Modules: Follow/Tree/GNSS... -->
      <button 
        v-for="item in currentButtonList" 
        :key="item.msg"
        class="toolbar-btn" 
        @click="handleModule(item.msg)" 
        :title="item.title"
        v-html="item.icon+getButtonText(item.title, position)"
      >
      </button>

      <span v-if="upAndDown(position)" class="divider">|</span>
      <span v-else class="divider">一</span>
      
      <!-- Actions:Draw/Data/Config... -->
      <button 
        v-for="item in handleList" 
        :key="item.msg"
        class="toolbar-btn" 
        @click="handleAction(item.msg)" 
        :title="item.title"
        v-html="item.icon+getButtonText(item.title, position)"
      >
      </button>

      <span v-if="upAndDown(position)" class="divider">|</span>
      <span v-else class="divider">一</span>

      <!-- Layout: Edit/Save/Reset -->
      <button 
        v-if="!isEditing"
        class="toolbar-btn"
        @click="handleLayout('edit')"
        :title="layoutList[0].title"
        v-html="layoutList[0].icon+getButtonText(layoutList[0].title, position)"
      >
      </button>
      <button
        v-else
        class="toolbar-btn"
        @click="handleLayout('save')"
        :title="layoutList[1].title"
        v-html="layoutList[1].icon+getButtonText(layoutList[1].title, position)"
      >
      </button>
      <button
        class="toolbar-btn"
        @click="handleLayout('auto')"
        :title="layoutList[2].title"
        v-html="layoutList[2].icon+getButtonText(layoutList[2].title, position)"
      >
      </button>
      <button
        class="toolbar-btn"
        @click="handleLayout('reset')"
        :title="layoutList[3].title"
        v-html="layoutList[3].icon+getButtonText(layoutList[3].title, position)"
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
import { ref, reactive, computed, onMounted, onUnmounted, watch, inject, type Ref } from 'vue'
import { navMode, AppMode, FuncMode, ButtonItem, appConfig } from '@/types/config'
import { getButtonList, upAndDown, getButtonText, getLayoutList } from '@/composables/useToolsManager'
import emitter from '@/hooks/useMitt'

const ipcRenderer = window.ipcRenderer
const position = ref<'top' | 'right' | 'bottom' | 'left'>('bottom')
const isEditing = ref(false)

const handleList: ButtonItem[] = reactive(
  getButtonList(navMode) || []
)

// 使用computed属性替代原来的reactive数组
const layoutList = computed(() => getLayoutList(position.value))

watch(() => navMode.funcMode, () => {
  const buttonList = getButtonList(navMode)

  ipcRenderer.send('console-to-node', ['watch:funcMode', AppMode[navMode.appMode], FuncMode[navMode.funcMode]])

  if (buttonList) {
    handleList.splice(0, handleList.length, ...buttonList)
  } else {
    handleList.splice(0, handleList.length)
  }
})

const currentButtonList = computed(() => {
  const appKey = navMode.appModeStr
  if (!appKey || !appConfig[appKey as keyof typeof appConfig]) {
    return []
  }
  
  const app = appConfig[appKey as keyof typeof appConfig]
  return Object.values(app.module).map(module => ({
    title: (module as any).title,
    msg: (module as any).title.toLowerCase(),
    template: '',
    icon: (module as any).icon,
    text: getButtonText((module as any).title, position.value)
  } as ButtonItem))
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
  const statusbarWidth = statusbarSize?.value?.width || 60
  
  switch (zone) {
    case 'top':
      return {
        top: '0px',
        left: '0px',
        width: `${windowWidth}px`,
        height: `${dockHeight}px`
      }
    case 'right':
      // 当statusbar在右边时，dock-zone应该避开statusbar
      const rightOffset = statusbarPosition?.value === 'right' ? statusbarWidth : 0
      return {
        top: '0px',
        left: `${windowWidth - dockWidth - rightOffset}px`,
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
      // 当statusbar在左边时，dock-zone应该避开statusbar
      const leftOffset = statusbarPosition?.value === 'left' ? statusbarWidth : 0
      return {
        top: '0px',
        left: `${leftOffset}px`,
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

  // event.preventDefault()
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

  // event.preventDefault()
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

const handleModule = (action: string) => {
  emitter.emit(action)

  // 根据AppMap自动匹配模块对应的FuncMode
  const appKey = navMode.appModeStr
  if (!appKey || !appConfig[appKey as keyof typeof appConfig]) return
  
  const app = appConfig[appKey as keyof typeof appConfig]
  const module = Object.values(app.module).find(m => (m as any).title.toLowerCase() === action)
  
  if (module) {
    navMode.funcMode = (module as any).funcMode
  }
}

const handleAction = (action: string) => {
  emitter.emit(action)
}

const handleLayout = (action: string) => {
  switch (action) {
    case 'edit':
      isEditing.value = true
      emitter.emit('edit')
      break
    case 'save':
      isEditing.value = false
      emitter.emit('save')
      break
    case 'auto':
      emitter.emit('auto')
      break
    case 'reset':
      emitter.emit('reset')
      break
  }
}

// 注入状态栏位置信息
const statusbarPosition = inject<Ref<'left' | 'right'>>('statusbarPosition')
const statusbarSize = inject<Ref<{width: number, height: number}>>('statusbarSize')

const snapToEdge = () => {
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  const statusbarWidth = statusbarSize?.value?.width || 60

  switch (position.value) {
    case 'top':
      toolbarRect.value = { x: 0, y: 0 }
      break
    case 'right':
      // 当ToolBar在右边时，紧贴屏幕右边缘
      toolbarRect.value = { x: windowWidth - 40, y: 0 }
      break
    case 'bottom':
      toolbarRect.value = { x: 0, y: windowHeight - 40 }
      break
    case 'left':
      // 当ToolBar在左边时，紧贴屏幕左边缘
      toolbarRect.value = { x: 0, y: 0 }
      break
  }
  
  emit('positionChange', position.value)
}

onMounted(() => {
  snapToEdge()
  window.addEventListener('resize', snapToEdge)
  
  // 监听状态栏位置变化
  watch([statusbarPosition, statusbarSize], () => {
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
  user-select: none;        /* 现代浏览器 */
  -webkit-user-select: none;/* Safari */
  -moz-user-select: none;   /* Firefox */
  -ms-user-select: none;    /* IE11/Edge 旧版 */
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

.toolbar-handle {
  color: #ecf0f1;
  cursor: grab;
  padding: 4px;
  margin: 8px 4px;
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
