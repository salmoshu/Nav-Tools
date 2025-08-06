<template>
  <div class="dashboard">
    <Toolbar 
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
            <div class="layout-component">
              <el-card class="box-card" shadow="always">
                <template #header>
                  <div class="card-header">
                    <span class="title">{{ item.titleName }}</span>
                    <div class="card-actions">
                      <el-button 
                        type="text" 
                        @click="removeItem(item.i)"
                        class="remove-btn"
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
import { ref, computed, defineAsyncComponent, markRaw, watch, nextTick } from 'vue'
import { GridLayout, GridItem } from 'grid-layout-plus'
import { ElButton, ElCard, ElIcon, ElMessage } from 'element-plus'
import { Close } from '@element-plus/icons-vue'
import Toolbar from './Toolbar.vue'
import emitter from '@/hooks/useMitt'

// 使用handle目录下的组件
const ConfigPanel = defineAsyncComponent(() => import('./handle/Config.vue'))
const DataPanel = defineAsyncComponent(() => import('./handle/Data.vue'))
const DrawPanel = defineAsyncComponent(() => import('./handle/Draw.vue'))
const StatusPanel = defineAsyncComponent(() => import('./handle/Status.vue'))

interface LayoutItem {
  x: number
  y: number
  w: number
  h: number
  i: string
  titleName: string
  component: any
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
}

// 拖拽布局相关状态
const isEditDraggable = ref(false)
const draggableLayout = ref(false)
const resizableLayout = ref(false)
const layoutDraggableList = ref<LayoutItem[]>([])

// 组件映射
const componentMap = {
  'DrawPanel': DrawPanel,
  'DataPanel': DataPanel,
  'StatusPanel': StatusPanel,
  'ConfigPanel': ConfigPanel,
}

// 初始化布局
const initLayout = () => {
  const savedLayout = localStorage.getItem('dashboard-layout')
  if (savedLayout) {
    try {
      const parsed = JSON.parse(savedLayout)
      layoutDraggableList.value = parsed.map((item: any) => ({
        ...item,
        component: markRaw(componentMap[item.componentName as keyof typeof componentMap])
      }))
    } catch (error) {
      console.error('Failed to load saved layout:', error)
      createDefaultLayout()
    }
  } else {
    createDefaultLayout()
  }
}

// 创建默认布局
const createDefaultLayout = () => {
  layoutDraggableList.value = [
    {
      x: 0,
      y: 0,
      w: 6,
      h: 4,
      i: 'draw-1',
      titleName: '绘图面板',
      component: markRaw(DrawPanel),
      minW: 3,
      minH: 3,
      maxW: 8,
      maxH: 8
    },
    {
      x: 6,
      y: 0,
      w: 6,
      h: 4,
      i: 'data-2',
      titleName: '数据面板',
      component: markRaw(DataPanel),
      minW: 3,
      minH: 3,
      maxW: 6,
      maxH: 6
    },
    {
      x: 0,
      y: 4,
      w: 6,
      h: 4,
      i: 'status-3',
      titleName: '状态面板',
      component: markRaw(StatusPanel),
      minW: 3,
      minH: 3,
      maxW: 6,
      maxH: 6
    },
    {
      x: 6,
      y: 4,
      w: 6,
      h: 4,
      i: 'config-4',
      titleName: '配置面板',
      component: markRaw(ConfigPanel),
      minW: 3,
      minH: 3,
      maxW: 6,
      maxH: 6
    },
  ]
}

// 编辑布局
const editDragDataHome = () => {
  isEditDraggable.value = true
  draggableLayout.value = true
  resizableLayout.value = true
}

// 保存布局
const saveDragDataHome = () => {
  isEditDraggable.value = false
  draggableLayout.value = false
  resizableLayout.value = false
  
  const layoutToSave = layoutDraggableList.value.map(item => ({
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    i: item.i,
    titleName: item.titleName,
    componentName: Object.keys(componentMap).find(key => componentMap[key as keyof typeof componentMap] === item.component),
    minW: item.minW,
    minH: item.minH,
    maxW: item.maxW,
    maxH: item.maxH
  }))
  
  localStorage.setItem('dashboard-layout', JSON.stringify(layoutToSave))
  ElMessage({
    message: '布局已保存',
    type: 'success',
    duration: 2000
  })
}

// 重置布局
const resetLayout = () => {
  localStorage.removeItem('dashboard-layout')
  createDefaultLayout()
  isEditDraggable.value = false
  draggableLayout.value = false
  resizableLayout.value = false
}

// 添加组件
const addItem = () => {
  const components = [
    { title: '绘图面板', componentName: 'DrawPanel', component: DrawPanel, minW: 3, minH: 3, maxW: 8, maxH: 8 },
    { title: '数据面板', componentName: 'DataPanel', component: DataPanel, minW: 3, minH: 3, maxW: 6, maxH: 6 },
    { title: '状态面板', componentName: 'StatusPanel', component: StatusPanel, minW: 3, minH: 3, maxW: 6, maxH: 6 },
    { title: '配置面板', componentName: 'ConfigPanel', component: ConfigPanel, minW: 3, minH: 3, maxW: 6, maxH: 6 },
  ]
  
  const available = components.filter(c => 
    !layoutDraggableList.value.some(item => item.component === c.component)
  )
  
  if (available.length === 0) {
    ElMessage.warning('所有组件已添加')
    return
  }
  
  const random = available[Math.floor(Math.random() * available.length)]
  const newItem: LayoutItem = {
    x: 0,
    y: 0,
    w: 6,
    h: 4,
    i: `${random.componentName}-${Date.now()}`,
    titleName: random.title,
    component: markRaw(random.component),
    minW: random.minW || 3,
    minH: random.minH || 3,
    maxW: random.maxW || 6,
    maxH: random.maxH || 6
  }
  
  layoutDraggableList.value.push(newItem)
}

// 删除组件
const removeItem = (i: string) => {
  const index = layoutDraggableList.value.findIndex(item => item.i === i)
  if (index !== -1) {
    layoutDraggableList.value.splice(index, 1)
  }
}

emitter.on('save', () => {
  saveDragDataHome()
})

emitter.on('reset', () => {
  resetLayout()
})

emitter.on('edit', () => {
  editDragDataHome()
})

// 事件处理
const resizeEvent = (i: string, newH: number, newW: number, newHPx: number, newWPx: number) => {
  console.log('RESIZE i=' + i + ', H=' + newH + ', W=' + newW + ', H(px)=' + newHPx + ', W(px)=' + newWPx)
}

const movedEvent = (i: string, newX: number, newY: number) => {
  console.log('MOVED i=' + i + ', X=' + newX + ', Y=' + newY)
}

// 其他状态
const toolbarPosition = ref<'top' | 'right' | 'bottom' | 'left'>('top')

const handleLayoutButtonAction = (action: string) => {
  console.log(`执行布局操作: ${action}`)
}

const handleToolbarPositionChange = (position: 'top' | 'right' | 'bottom' | 'left') => {
  toolbarPosition.value = position
}

const toolbarSize = ref({
  width: 40,
  height: 40
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

// 初始化
initLayout()
</script>

<style scoped>
.dashboard {
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  background-color: #F0F0F0;
}

.dashboard-content {
  width: 100%;
  height: 100%;
  transition: all 0.3s ease;
  position: relative;
  /* box-sizing: border-box; */
  border: 5px solid #E0E0E0;
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

.remove-btn {
  padding: 0;
  color: #909399;
}

.remove-btn:hover {
  color: #F56C6C;
}

.layout-controls {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 1000;
  display: flex;
  gap: 10px;
}

:deep(.vue-grid-item.vue-grid-placeholder) {
  background: #409EFF;
  opacity: 0.2;
  transition-duration: 100ms;
  z-index: 2;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  -o-user-select: none;
  user-select: none;
}

:deep(.vue-grid-item) {
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: box-shadow 0.3s ease;
}

:deep(.vue-grid-item:hover) {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

:deep(.vue-grid-item .vue-resizable-handle) {
  opacity: 0.5;
}

:deep(.vue-grid-item:hover .vue-resizable-handle) {
  opacity: 1;
}

@media screen and (max-width: 768px) {
  .dashboard-grid {
    padding: 10px;
  }
  
  .grid-layout {
    min-height: calc(100vh - 200px);
  }
  
  .layout-controls {
    flex-direction: column;
    gap: 5px;
  }
  
  .layout-controls .el-button {
    padding: 8px 12px;
    font-size: 12px;
  }
}
</style>
