<template>
  <div class="dashboard">
    <ToolBar 
      @positionChange="handleToolbarPositionChange"
      @funcModeChange="handleFuncModeChange"
    />

    <StatusBar @positionChange="handleStatusbarPositionChange" />
    
    <div 
      class="dashboard-content" 
      :class="contentClasses"
      :style="contentStyle"
    >
      <!-- Grid Layout Plus 拖拽布局区域 -->
      <div class="dashboard-grid">
        <grid-layout
          v-model:layout="layoutDraggableList"
          :col-num="12"
          :row-height="60"
          :is-draggable="draggableLayout"
          :is-resizable="resizableLayout"
          :vertical-compact="true"
          :use-css-transforms="true"
          :margin="[10, 10]"
          class="grid-layout"
        >
          <grid-item
            v-for="item in layoutDraggableList"
            :key="item.i"
            :x="item.x"
            :y="item.y"
            :w="item.w"
            :h="item.h"
            :i="item.i"
            :minW="item.minW || 3"
            :minH="item.minH || 3"
            :maxW="item.maxW || 6"
            :maxH="item.maxH || 6"
            @resize="resizeEvent"
            @moved="movedEvent"
          >
            <div class="layout-component" :id="`grid-item-${item.i}`">
              <el-card class="box-card" shadow="always">
                <template #header>
                  <div class="card-header">
                    <span class="title">{{ item.titleName }}</span>
                    <div class="card-actions">
                      <!-- 取消了分离到独立窗口的功能，等待后续完善 -->
                      <el-button 
                        type="text" 
                        v-if="item.componentName.indexOf('Config') !== -1"
                        @click="console.log('detachItem(item)')"
                        class="detach-btn"
                        title="分离到独立窗口"
                      >
                        <el-icon><Share /></el-icon>
                      </el-button>
                      <el-button 
                        v-if="resizableLayout"
                        type="text" 
                        @click="removeItem(item.i)"
                        class="remove-btn"
                        title="移除卡片"
                      >
                        <el-icon><Close /></el-icon>
                      </el-button>
                    </div>
                  </div>
                </template>
                <component :is="item.component" />
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
import { ElButton, ElCard, ElIcon } from 'element-plus'
import { Close, Share } from '@element-plus/icons-vue'
import emitter from '@/hooks/useMitt'
import { useLayoutManager } from '@/composables/useLayoutManager'
import { appConfig, navMode } from '@/types/config'

const {
  layoutDraggableList,
  isEditDraggable,
  draggableLayout,
  resizableLayout,
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
const statusbarSize = ref({ width: 150, height: 60 })

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
  switch (statusbarPosition.value) {
    case 'left':
      marginLeft += statusbarSize.value.width
      break
    case 'right':
      marginRight += statusbarSize.value.width
      break
  }

  // 处理工具栏的位置，考虑与状态栏的边缘限制
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
      if (statusbarPosition.value === 'left') {
        // 如果状态栏在左边，工具栏在状态栏右侧
        marginLeft = statusbarSize.value.width + toolbarSize.value.width
      } else {
        // 如果状态栏在右边或不存在，工具栏在左侧
        marginLeft += toolbarSize.value.width
      }
      break
    case 'right':
      // 当ToolBar在右边时，限制ToolBar左边缘在StatusBar右边缘
      if (statusbarPosition.value === 'right') {
        // 如果状态栏在右边，工具栏在状态栏左侧
        marginRight = statusbarSize.value.width + toolbarSize.value.width
      } else {
        // 如果状态栏在左边或不存在，工具栏在右侧
        marginRight += toolbarSize.value.width
      }
      break
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
  console.log('RESIZE i=' + i + ', H=' + newH + ', W=' + newW + ', H(px)=' + newHPx + ', W(px)=' + newWPx)
}

const movedEvent = (i: string, newX: number, newY: number) => {
  console.log('MOVED i=' + i + ', X=' + newX + ', Y=' + newY)
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

  // module mode
  for (const [_, appCfg] of Object.entries(appConfig)) {
    for (const [_, moduleCfg] of Object.entries((appCfg as any).module)) {
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
    for (const [_, moduleCfg] of Object.entries((appCfg as any).module)) {
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

.box-card {
  height: 100%;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  overflow: auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 15px;
}

.title {
  font-weight: 600;
  font-size: 16px;
}

.card-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.detach-btn,
.remove-btn {
  padding: 0;
  color: #909399;
}

.detach-btn:hover {
  color: #409EFF;
}

.remove-btn:hover {
  color: #F56C6C;
}
</style>
