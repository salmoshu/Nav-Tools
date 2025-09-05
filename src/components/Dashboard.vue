<template>
  <div class="dashboard">
    <ToolBar 
      @positionChange="handleToolbarPositionChange"
      @funcModeChange="handleFuncModeChange"
    />

    <StatusBar @positionChange="handleStatusbarPositionChange" />

    <el-dialog
      title="输入"
      v-model="showInputDialog"
      width="30%"
    >
      <el-tabs v-model="activeTab">
        <el-tab-pane label="串口连接" name="serial">
          <div class="input-group">
            <span class="input-label">端口:</span>
            <el-select
              v-model="serialPort"
              placeholder="请选择串口"
              style="flex: 1;"
              @change="searchSerialPorts"
            >
              <el-option v-for="port in serialPorts" :key="port" :label="port" :value="port" />
            </el-select>
          </div>
          <div class="input-group">
            <span class="input-label">波特率:</span>
            <el-select
              v-model="serialBaudRate"
              placeholder="请选择或输入波特率"
              filterable
              allow-create
              style="flex: 1;"
            >
              <el-option v-for="rate in baudRates" :key="rate" :label="rate" :value="rate" />
            </el-select>
          </div>
          <div class="input-group" v-if="serialAdvanced">
            <span class="input-label">数据位:</span>
            <el-select v-model="serialDataBits" placeholder="请选择数据位" style="flex: 1;">
              <!-- 默认为8 -->
              <el-option v-for="bit in dataBits" :key="bit" :label="bit" :value="bit" />
            </el-select>
          </div>
          <div class="input-group" v-if="serialAdvanced">
            <span class="input-label">停止位:</span>
            <el-select v-model="serialStopBits" placeholder="请选择停止位" style="flex: 1;">
              <el-option v-for="bit in stopBits" :key="bit" :label="bit" :value="bit" />
            </el-select>
          </div>
          <div class="input-group" v-if="serialAdvanced">
            <span class="input-label">校验位:</span>
            <el-select v-model="serialParity" placeholder="请选择校验位" style="flex: 1;">
              <el-option v-for="parity in parities" :key="parity.value" :label="parity.label" :value="parity.value" />
            </el-select>
          </div>
          <div class="input-group">
            <span class="input-label">高级选项:</span>
            <el-checkbox v-model="serialAdvanced" ></el-checkbox>
          </div>
        </el-tab-pane>
        <el-tab-pane label="网络连接" name="network">
          <div class="input-group">
            <span class="input-label">网络地址:</span>
            <el-input v-model="networkIp" placeholder="请输入网络连接指令" />
          </div>
          <div class="input-group">
            <span class="input-label">网络端口:</span>
            <el-input v-model="networkPort" placeholder="请输入网络端口" />
          </div>
        </el-tab-pane>
        <el-tab-pane label="文件输入" name="file">
          <div class="input-group">
            <span class="input-label">文件路径:</span>
            <el-input v-model="fileInput" placeholder="推荐使用浏览器端的FileReader" style="flex: 1;" />
            <el-button type="primary" @click="openFileDialog" style="margin-left: 10px;">
              ...
            </el-button>
          </div>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button type="primary" @click="handleInputSubmit">确定</el-button>
      </template>
    </el-dialog>
    
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
            :maxH="item.maxH || 10"
            @resize="resizeEvent"
            @moved="movedEvent"
          >
            <div class="layout-component" :id="`grid-item-${item.i}`">
              <el-card class="box-card" shadow="always">
                <template #header>
                  <div class="card-header">
                    <span class="title">{{ item.titleName }}</span>
                    <div class="card-actions">
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
import { ref, computed, onMounted, onUnmounted, provide, watch } from 'vue'
import { GridLayout, GridItem } from 'grid-layout-plus'
import { ElButton, ElCard, ElDialog, ElIcon } from 'element-plus'
import { Close, Share } from '@element-plus/icons-vue'
import emitter from '@/hooks/useMitt'
import { useLayoutManager } from '@/composables/useLayoutManager'
import { useDevice } from '@/hooks/useDevice'
import { appConfig, navMode } from '@/settings/config'

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

const {
  showInputDialog,
  activeTab,
  serialPort,
  serialBaudRate,
  serialDataBits,
  serialStopBits,
  serialParity,
  serialAdvanced,
  networkIp,
  networkPort,
  fileInput,
  serialPorts,
  baudRates,
  dataBits,
  stopBits,
  parities,
  searchSerialPorts,
  handleInputSubmit,
  inputDialog,
  openFileDialog  // 引入新增的方法
} = useDevice()

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
  searchSerialPorts()
  
  emitter.on('edit', editLayout)
  emitter.on('save', saveLayout)
  emitter.on('auto', autoLayout)
  emitter.on('reset', resetLayout)
  emitter.on('input-event', inputDialog)

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
}

/* 确保 el-card 的内容区域正确计算高度 - 使用更精确的选择器 */
.box-card :deep(.el-card__body) {
  flex: 1;
  min-height: 0; /* 防止flex子项溢出 */
  padding: 0;
  box-sizing: border-box;
}

/* 删除或替换原有的 .card-content 样式 */
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

/* 确保卡片内部布局正确 */
.box-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 3px solid rgb(210, 210, 210);
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

/* 确保 el-card 的内容区域正确计算高度 - 使用更精确的选择器 */
.box-card :deep(.el-card__body) {
  flex: 1;
  min-height: 0; /* 防止flex子项溢出 */
  padding: 0;
  box-sizing: border-box;
}

/* 删除或替换原有的 .card-content 样式 */
.card-content {
  height: 100%;
  width: 100%;
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

.input-group {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.input-label {
  min-width: 80px;
  text-align: right;
  margin-right: 12px;
  font-size: 14px;
  color: #606266;
}

.el-input {
  flex: 1;
}

.dialog-footer {
  text-align: right;
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
</style>
