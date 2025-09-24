<template>
  <div 
    class="dashboard" 
    @dragover="device.handleDragOver"
    @dragenter="device.handleDragEnter"
    @dragleave="device.handleDragLeave"
    @drop="device.handleDrop"
  >
    <!-- 拖拽提示遮罩层 -->
    <div 
      v-if="device.isDragOver.value"
      class="drag-overlay"
    >
    </div>
    
    <!-- 原有内容 -->
    <ToolBar 
      @positionChange="handleToolbarPositionChange"
      @funcModeChange="handleFuncModeChange"
    />

    <StatusBar @positionChange="handleStatusbarPositionChange" v-if="showStatusBar && !fullScreenItem" />

    <div 
      class="dashboard-content" 
      :class="contentClasses"
      :style="contentStyle"
    >
      <!-- Grid Layout Plus 拖拽布局区域 -->
      <div class="dashboard-grid">
        <!-- use-css-transforms 需设置为 false，也即禁用 CSS 变换，否则会导致内层字体模糊 -->
        <grid-layout
          v-model:layout="layoutDraggableList"
          :col-num="12"
          :row-height="60"
          :is-draggable="true"
          :is-resizable="true"
          :vertical-compact="true"
          :use-css-transforms="false"
          :margin="[10, 10]"
          class="grid-layout"
        >
          <grid-item
            v-for="item in layoutDraggableList"
            :drag-allow-from="'.card-header'"
            :key="item.i"
            :x="item.x"
            :y="item.y"
            :w="item.w"
            :h="item.h"
            :i="item.i"
            :minW="item.minW || 4"
            :minH="item.minH || 5"
            :maxW="item.maxW || 12"
            :maxH="item.maxH || 12"
            @resize="resizeEvent"
            @moved="movedEvent"
          >
            <div class="layout-component" :id="`grid-item-${item.i}`">
              <el-card class="box-card" shadow="always" :class="{ 'full-screen-card': fullScreenItem === item.i }">
                <template #header>
                  <div class="card-header" v-if="fullScreenItem !== item.i">
                    <span class="title">{{ item.titleName }}</span>
                    <div class="card-actions">
                      <el-button 
                        type="text" 
                        v-if="item.componentName.indexOf('Config') !== -1"
                        @click=""
                        class="detach-btn"
                        title="分离到独立窗口"
                      >
                        <el-icon><Share /></el-icon>
                      </el-button>
                      <el-button 
                        type="text" 
                        @click="toggleCardFullScreen(item.i)"
                        class="fullscreen-btn"
                        title="全屏展示"
                      >
                        <el-icon><Expand /></el-icon>
                      </el-button>
                      <el-button 
                        type="text" 
                        @click="removeItem(item.i)"
                        class="remove-btn"
                        title="移除卡片"
                      >
                        <el-icon><Close /></el-icon>
                      </el-button>
                    </div>
                  </div>
                  <div v-else class="full-screen-header">
                    <span class="full-screen-title">{{ item.titleName }}</span>
                    <el-button 
                      type="text" 
                      @click="toggleCardFullScreen(null)"
                      class="exit-fullscreen-btn"
                      title="退出全屏"
                    >
                      <el-icon><FullScreen /></el-icon>
                    </el-button>
                  </div>
                </template>
                <div class="card-content">
                  <component :is="item.component" />
                </div>
              </el-card>
            </div>
          </grid-item>
        </grid-layout>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ToolBar from './ToolBar.vue'
import StatusBar from './StatusBar.vue'
import { ref, computed, onMounted, onUnmounted, provide } from 'vue'
import { GridLayout, GridItem } from 'grid-layout-plus'
import { ElButton, ElCard, ElIcon, ElMessage } from 'element-plus'
import { Close, Share, Expand, FullScreen } from '@element-plus/icons-vue'
import emitter from '@/hooks/useMitt'
import { useLayoutManager } from '@/composables/useLayoutManager'
import { showStatusBar } from '@/composables/useStatusManager'
import { appConfig, navMode } from '@/settings/config'
import { useDevice } from '@/hooks/useDevice'

// 初始化设备管理和文件拖放功能 - 移到这里！
const device = useDevice()

const { 
  layoutDraggableList, 
  initLayout, 
  saveLayout, 
  autoLayout, 
  resetLayout, 
  editLayout, 
  addItem, 
  removeItem, 
  handleFuncModeChange 
} = useLayoutManager()

// 工具栏和状态栏位置状态
const toolbarPosition = ref<'top' | 'right' | 'bottom' | 'left'>('top')
const statusbarPosition = ref<'left' | 'right'>('right')
const toolbarSize = ref({ width: 40, height: 40 })
const statusbarSize = ref({ width: 200, height: 60 })

// 全屏相关状态
const fullScreenItem = ref<string | null>(null)

// 提供工具栏和状态栏位置的响应式引用
provide('toolbarPosition', toolbarPosition)
provide('statusbarPosition', statusbarPosition)
provide('toolbarSize', toolbarSize)
provide('statusbarSize', statusbarSize)

// 位置处理函数
const handleToolbarPositionChange = (position: 'top' | 'right' | 'bottom' | 'left') => {
  toolbarPosition.value = position
}

const handleStatusbarPositionChange = (position: 'left' | 'right') => {
  statusbarPosition.value = position
}

// 切换卡片全屏状态
const toggleCardFullScreen = (itemId: string | null) => {
  if (fullScreenItem.value === null) {
    // 进入全屏
    fullScreenItem.value = itemId
    ElMessage({
      message: '按Esc键或点击按钮退出全屏',
      type: 'success',
      duration: 1000,
      placement: 'bottom-right',
      offset: 50,
    })
  } else {
    // 退出全屏
    fullScreenItem.value = null
  }
}

// 处理键盘事件
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && fullScreenItem.value !== null) {
    toggleCardFullScreen(null)
  }
}

// 计算内容区域的类
const contentClasses = computed(() => {
  return {
    'toolbar-top': toolbarPosition.value === 'top',
    'toolbar-bottom': toolbarPosition.value === 'bottom',
    'toolbar-left': toolbarPosition.value === 'left',
    'toolbar-right': toolbarPosition.value === 'right',
    'statusbar-left': statusbarPosition.value === 'left',
    'statusbar-right': statusbarPosition.value === 'right'
  }
})

// 计算内容区域的样式
const contentStyle = computed(() => {
  let marginTop = 0
  let marginBottom = 0
  let marginLeft = 0
  let marginRight = 0

  // 先计算状态栏的位置（只在左右两侧）
  // 只有当showStatusBar为true时才计算状态栏的占位
  if (showStatusBar.value && !fullScreenItem.value) {
    switch (statusbarPosition.value) {
      case 'left':
        marginLeft += statusbarSize.value.width
        break
      case 'right':
        marginRight += statusbarSize.value.width
        break
    }
  }

  // 处理工具栏的位置，考虑与状态栏的边缘限制
  if (!fullScreenItem.value) {
    switch (toolbarPosition.value) {
      case 'top':
        // 当ToolBar在上边时，限制ToolBar下边缘在StatusBar上边缘
        marginTop += toolbarSize.value.height
        break
      case 'bottom':
        // 当ToolBar在下边时，限制ToolBar上边缘在StatusBar下边缘
        marginBottom += toolbarSize.value.height
        break
      case 'left':
        // 当ToolBar在左边时，限制ToolBar右边缘在StatusBar左边缘
        if (showStatusBar.value && statusbarPosition.value === 'left') {
          // 如果状态栏在左边，工具栏在状态栏右侧
          marginLeft = statusbarSize.value.width + toolbarSize.value.width
        } else {
          // 如果状态栏在右边或不存在，工具栏在左侧
          marginLeft += toolbarSize.value.width
        }
        break
      case 'right':
        // 当ToolBar在右边时，限制ToolBar左边缘在StatusBar右边缘
        if (showStatusBar.value && statusbarPosition.value === 'right') {
          // 如果状态栏在右边，工具栏在状态栏左侧
          marginRight = statusbarSize.value.width + toolbarSize.value.width
        } else {
          // 如果状态栏在左边或不存在，工具栏在右侧
          marginRight += toolbarSize.value.width
        }
        break
    }
  }

  return {
    marginTop: `${marginTop}px`,
    marginBottom: `${marginBottom}px`,
    marginLeft: `${marginLeft}px`,
    marginRight: `${marginRight}px`,
    height: `calc(100vh - ${marginTop + marginBottom}px)`,
    width: `calc(100vw - ${marginLeft + marginRight}px)`
  }
})

// 事件处理函数
const resizeEvent = (i: string, newH: number, newW: number, newHPx: number, newWPx: number) => {
  // 强制触发重绘，确保内容区域正确计算高度
  setTimeout(() => {
    const gridItem = document.getElementById(`grid-item-${i}`)
    if (gridItem) {
      const cardBody = gridItem.querySelector('.el-card__body') as HTMLElement
      if (cardBody) {
        // 触发重排
        cardBody.style.height = 'auto'
        setTimeout(() => {
          cardBody.style.height = `calc(100% - 40px)`
        }, 0)
      }
    }
  }, 0)
}

const movedEvent = (i: string, newX: number, newY: number) => {
  // console.log('MOVED i=' + i + ', X=' + newX + ', Y=' + newY)
}

// 分离卡片到独立窗口
const detachItem = (item: any) => {
  if (window.ipcRenderer && item.componentName) {
    console.log('Detaching item:', item)
    console.log('Props:', item.props)
    
    const element = document.getElementById(`grid-item-${item.i}`)
    const width = element ? element.clientWidth : 800
    const height = element ? element.clientHeight : 600
    
    const cardData = {
      componentName: item.componentName,
      title: item.titleName,
      props: item.props,
      width,
      height
    }
    
    console.log('cardData to send:', cardData)
    
    try {
      const serializedData = JSON.stringify(cardData)
      console.log('Serialized data:', serializedData)
      window.ipcRenderer.invoke('open-card-window', serializedData)
    } catch (error) {
      console.error('Error invoking open-card-window:', error)
    }
    
    // 从主窗口中移除该卡片
    removeItem(item.i)
  }
}

// 生命周期
onMounted(() => {
  initLayout()

  emitter.on('edit', editLayout)
  emitter.on('save', saveLayout)
  emitter.on('auto', autoLayout)
  emitter.on('reset', resetLayout)
  
  // 添加键盘事件监听
  window.addEventListener('keydown', handleKeyDown)
  
  // module mode
  for (const [_, appCfg] of Object.entries(appConfig)) {
    for (const [_, moduleCfg] of Object.entries((appCfg as any))) {
      const moduleMsg = (moduleCfg as any).title.toLocaleLowerCase()
      emitter.on(moduleMsg, () => {
        if (navMode.funcMode !== (moduleCfg as any).funcMode) {
          handleFuncModeChange((moduleCfg as any).funcMode)
        }
      })
    }
  }

  // module action
  for (const [_, appCfg] of Object.entries(appConfig)) {
    for (const [_, moduleCfg] of Object.entries((appCfg as any))) {
      const actionNames = (moduleCfg as any).templateNames
      const actionButtons = (moduleCfg as any).actionButtons
      for (const [name, button] of Array.from({ length: Math.min(actionNames.length, actionButtons.length) }, (_, i) => [actionNames[i], actionButtons[i]])) {
        emitter.on(button.msg, () => {
          addItem(name)
        })
      }
    }
  }
})

onUnmounted(() => {
  emitter.all.clear()
  // 移除键盘事件监听
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.dashboard {
  width: 100vw;
  height: 100vh;
  position: relative;
  background-color: #F0F0F0;
  overflow: hidden;
}

.dashboard-content {
  width: 100%;
  height: 100%;
  transition: all 0.3s ease;
  position: relative;
  overflow: auto;
}

.dashboard-grid {
  padding: 10px;
  height: calc(100% - 60px);
}

.grid-layout {
  border-radius: 8px;
  min-height: 100%;
}

.layout-component {
  height: 100%;
  width: 100%;
}

/* 确保卡片内部布局正确 */
.box-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 3px solid rgb(210, 210, 210);
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  overflow: hidden;
  transition: all 0.3s ease;
}

/* 全屏卡片样式增强 */
.full-screen-card {
  position: fixed;
  z-index: 999; /* 降低z-index，使其低于Toolbar的1000 */
  margin: 0;
  border: none;
  border-radius: 0;
  box-shadow: none;
  /* 确保全屏卡片不受父元素影响 */
  opacity: 1 !important;
  visibility: visible !important;
  pointer-events: auto !important;
  background-color: #ffffff;
  overflow: hidden;
}

/* 全屏模式下，根据Toolbar位置调整全屏卡片的位置和大小 */
.toolbar-top .full-screen-card {
  top: 40px; /* Toolbar的高度 */
  left: 0;
  right: 0;
  bottom: 0;
  height: calc(100vh - 40px);
}

.toolbar-bottom .full-screen-card {
  top: 0;
  left: 0;
  right: 0;
  bottom: 40px; /* Toolbar的高度 */
  height: calc(100vh - 40px);
}

.toolbar-left .full-screen-card {
  top: 0;
  left: 40px; /* Toolbar的宽度 */
  right: 0;
  bottom: 0;
  width: calc(100vw - 40px);
}

.toolbar-right .full-screen-card {
  top: 0;
  left: 0;
  right: 40px; /* Toolbar的宽度 */
  bottom: 0;
  width: calc(100vw - 40px);
}

/* 全屏模式下，同时有上下或左右Toolbar的情况 */
.toolbar-top.toolbar-bottom .full-screen-card {
  top: 40px;
  bottom: 40px;
  height: calc(100vh - 80px);
}

.toolbar-left.toolbar-right .full-screen-card {
  left: 40px;
  right: 40px;
  width: calc(100vw - 80px);
}

/* 全屏头部样式 */
.full-screen-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #409EFF;
  color: white;
  height: 45px;
  padding: 0 20px;
  box-sizing: border-box;
  user-select: none;
}

.full-screen-title {
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-size: 18px;
  font-weight: 600;
}

.exit-fullscreen-btn {
  color: white;
}

.exit-fullscreen-btn:hover {
  color: #f0f0f0;
}

/* 确保 el-card 的内容区域正确计算高度 - 使用更精确的选择器 */
.box-card :deep(.el-card__body) {
  flex: 1;
  min-height: 0; /* 防止flex子项溢出 */
  padding: 0;
  box-sizing: border-box;
}

/* 全屏模式下的内容区域 */
.full-screen-card :deep(.el-card__body) {
  height: calc(100% - 60px);
  overflow: auto;
}

/* 确保其他样式保持不变 */
.card-content {
  height: 100%;
  width: 100%;
  box-sizing: border-box;
}

/* 确保 el-card 的内容区域正确计算高度 */
:deep(.el-card__body) {
  height: calc(100% - 40px); /* 减去header的40px高度 */
  padding: 0;
  box-sizing: border-box;
}

/* 提高优先级，确保覆盖 Element Plus 默认样式 */
:deep(.el-card__header) {
  padding: 0 !important; /* 移除默认内边距 */
  box-sizing: border-box;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid rgb(210, 210, 210);
  height: 40px; /* 固定高度，与设计保持一致 */
  margin: 0;
  padding: 0 20px; /* 水平内边距，垂直内边距为 0 */
  box-sizing: border-box;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.title {
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.card-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.detach-btn,
.remove-btn,
.fullscreen-btn {
  padding: 0;
  color: #909399;
}

.detach-btn:hover {
  color: #409EFF;
}

.remove-btn:hover {
  color: #F56C6C;
}

.fullscreen-btn:hover {
  color: #67C23A;
}

/* 调整 resizer 位置 */
:deep(.vgl-item__resizer) {
  position: absolute;
  right: -2px; /* 移到 el-card 边框外部 */
  bottom: -8px; /* 移到 el-card 边框外部 */
  width: 15px; /* 增大锚点尺寸，便于点击 */
  height: 15px;
  border-radius: 50%; /* 圆形锚点 */
  cursor: se-resize;
  z-index: 20; /* 确保锚点在卡片上层 */
  box-sizing: border-box;
}

/* 确保 grid-item 无内边距或边框干扰 */
:deep(.vue-grid-item) {
  padding: 0;
  margin: 0;
  border: none;
}

/* 拖拽相关样式 */
.drag-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(64, 158, 255, 0.3);
  border: 2px dashed #409EFF;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  pointer-events: none;
}
</style>
