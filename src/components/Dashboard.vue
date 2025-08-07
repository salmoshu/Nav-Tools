<template>
  <div class="dashboard">
    <Toolbar 
      @positionChange="handleToolbarPositionChange"
      @funcModeChange="handleFuncModeChange"
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
                <component :is="item.component" v-bind="item.props" />
              </el-card>
            </div>
          </grid-item>
        </grid-layout>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, markRaw, onMounted, onUnmounted } from 'vue'
import { GridLayout, GridItem } from 'grid-layout-plus'
import { ElButton, ElCard, ElIcon, ElMessage } from 'element-plus'
import { Close } from '@element-plus/icons-vue'
import Toolbar from './Toolbar.vue'
import emitter from '@/hooks/useMitt'
import { useFollowMain } from '@/composables/follow/useFollowMain'


// 使用useMain管理功能模块状态
const {
  carState,
  personState,
  distance,
  targetAngle,
  isInFOV,
  visionLines,
  visionPath,
  handleMouseDown,
  isDraggingPerson,
  startAnimation,
  stopAnimation,
  updateConfig,
  config
} = useFollowMain()


// 动态组件导入
const ConfigPanel = defineAsyncComponent(() => import('./Config.vue'))
const DataPanel = defineAsyncComponent(() => import('./Data.vue'))
const DrawPanel = defineAsyncComponent(() => import('./Draw.vue'))
const StatusPanel = defineAsyncComponent(() => import('./Status.vue'))
const FollowDraw = defineAsyncComponent(() => import('./follow/FollowDraw.vue'))
const FollowConfig = defineAsyncComponent(() => import('./follow/FollowConfig.vue'))
const FollowStatus = defineAsyncComponent(() => import('./follow/FollowStatus.vue'))

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
  props?: Record<string, any>
  funcMode?: string
}

// 功能模式枚举
const FuncMode = {
  Follow: 'follow',
  Gnss: 'gnss',
  Imu: 'imu',
  Vision: 'vision',
  Tree: 'tree'
}

// 状态管理
const currentFuncMode = ref('follow')
const isEditDraggable = ref(false)
const draggableLayout = ref(false)
const resizableLayout = ref(false)
const layoutDraggableList = ref<LayoutItem[]>([])
const toolbarPosition = ref<'top' | 'right' | 'bottom' | 'left'>('top')

// 组件映射配置
const componentMap = {
  'DrawPanel': { component: DrawPanel, title: 'Draw Panel' },
  'DataPanel': { component: DataPanel, title: 'Data Panel' },
  'StatusPanel': { component: StatusPanel, title: 'Status Panel' },
  'ConfigPanel': { component: ConfigPanel, title: 'Config Panel' },
  'FollowDraw': { component: FollowDraw, title: 'Follow Draw', props: { carState, personState, visionLines, visionPath, isDraggingPerson, handleMouseDown } },
  'FollowConfig': { component: FollowConfig, title: 'Follow Config', props: { config, updateConfig } },
  'FollowStatus': { component: FollowStatus, title: 'Follow Status', props: { carState, distance, targetAngle, isInFOV } }
}

// 根据功能模式过滤组件
const getComponentsByMode = (mode: string) => {
  switch (mode) {
    case FuncMode.Follow:
      return ['FollowDraw', 'FollowConfig', 'FollowStatus']
    case FuncMode.Gnss:
      return ['DrawPanel', 'DataPanel', 'StatusPanel', 'ConfigPanel']
    case FuncMode.Imu:
      return ['DrawPanel', 'DataPanel', 'StatusPanel', 'ConfigPanel']
    case FuncMode.Vision:
      return ['DrawPanel', 'DataPanel', 'StatusPanel', 'ConfigPanel']
    case FuncMode.Tree:
      return ['DrawPanel', 'DataPanel', 'StatusPanel', 'ConfigPanel']
    default:
      return ['DrawPanel', 'DataPanel', 'StatusPanel', 'ConfigPanel']
  }
}

// 初始化布局
const initLayout = () => {
  // 先不使用本地存储
  // const savedLayout = localStorage.getItem(`dashboard-layout-${currentFuncMode.value}`)
  const savedLayout = null
  if (savedLayout) {
    try {
      const parsed = JSON.parse(savedLayout)
      loadLayoutFromConfig(parsed)
    } catch (error) {
      console.error('Failed to load saved layout:', error)
      createDefaultLayout()
    }
  } else {
    createDefaultLayout()
  }
}

// 从配置加载布局
const loadLayoutFromConfig = (config: any[]) => {
  layoutDraggableList.value = config.map((item: any) => {
    const componentConfig = componentMap[item.componentName as keyof typeof componentMap]
    return {
      ...item,
      component: markRaw(componentConfig.component),
      props: (componentConfig as { props?: Record<string, any> }).props || {}
    }
  })
}

// 创建默认布局
const createDefaultLayout = () => {
  const components = getComponentsByMode(currentFuncMode.value)
  
  const defaultLayouts = {
    [FuncMode.Follow]: [
      { x: 0, y: 0, w: 6, h: 6, i: 'follow-draw-1', titleName: '跟随仿真', componentName: 'FollowDraw', minW: 4, minH: 4, maxW: 8, maxH: 16 },
      { x: 8, y: 0, w: 4, h: 3, i: 'follow-config-2', titleName: '跟随配置', componentName: 'FollowConfig', minW: 3, minH: 3, maxW: 6, maxH: 8 },
      { x: 8, y: 3, w: 4, h: 3, i: 'follow-status-3', titleName: '跟随状态', componentName: 'FollowStatus', minW: 3, minH: 3, maxW: 6, maxH: 8 }
    ],
    [FuncMode.Gnss]: [
      { x: 0, y: 0, w: 6, h: 4, i: 'draw-1', titleName: 'GNSS绘制', componentName: 'DrawPanel', minW: 3, minH: 3, maxW: 6, maxH: 8 },
      { x: 6, y: 0, w: 6, h: 4, i: 'data-2', titleName: 'GNSS数据', componentName: 'DataPanel', minW: 3, minH: 3, maxW: 6, maxH: 6 },
      { x: 0, y: 4, w: 6, h: 4, i: 'status-3', titleName: 'GNSS状态', componentName: 'StatusPanel', minW: 3, minH: 3, maxW: 6, maxH: 6 },
      { x: 6, y: 4, w: 6, h: 4, i: 'config-4', titleName: 'GNSS配置', componentName: 'ConfigPanel', minW: 3, minH: 3, maxW: 6, maxH: 6 }
    ]
  }

  const layoutConfig = defaultLayouts[currentFuncMode.value as keyof typeof defaultLayouts] || defaultLayouts[FuncMode.Follow]
  loadLayoutFromConfig(layoutConfig)
}

// 功能模式切换处理
const handleFuncModeChange = (mode: string) => {
  // 保存当前布局
  saveCurrentLayout()
  
  // 切换模式
  currentFuncMode.value = mode
  
  // 重新初始化布局
  initLayout()
  
  // 重启动画
  stopAnimation()
  startAnimation()
  
  ElMessage.success(`已切换到${mode}模式`)
}

// 保存当前布局
const saveCurrentLayout = () => {
  const layoutToSave = layoutDraggableList.value.map(item => ({
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    i: item.i,
    titleName: item.titleName,
    componentName: Object.keys(componentMap).find(key => componentMap[key as keyof typeof componentMap].component === item.component),
    minW: item.minW,
    minH: item.minH,
    maxW: item.maxW,
    maxH: item.maxH
  }))
  
  localStorage.setItem(`dashboard-layout-${currentFuncMode.value}`, JSON.stringify(layoutToSave))
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
  saveCurrentLayout()
  
  ElMessage({
    message: '布局已保存',
    type: 'success',
    duration: 2000
  })
}

// 重置布局
const resetLayout = () => {
  localStorage.removeItem(`dashboard-layout-${currentFuncMode.value}`)
  createDefaultLayout()
  isEditDraggable.value = false
  draggableLayout.value = false
  resizableLayout.value = false
}

// 添加组件
const addItem = (componentName: string) => {
  const componentConfig = componentMap[componentName as keyof typeof componentMap]
  if (!componentConfig) return
  
  const exists = layoutDraggableList.value.some(item => 
    Object.keys(componentMap).find(key => 
      componentMap[key as keyof typeof componentMap].component === item.component
    ) === componentName
  )
  
  if (exists) {
    ElMessage.warning(`${componentConfig.title}已存在`)
    return
  }
  
  const newItem: LayoutItem = {
    x: 0,
    y: 0,
    w: 6,
    h: 4,
    i: `${componentName}-${Date.now()}`,
    titleName: componentConfig.title,
    component: markRaw(componentConfig.component),
    props: (componentConfig as { props?: Record<string, any> }).props || {},
    minW: 3,
    minH: 3,
    maxW: 6,
    maxH: 6
  }
  
  layoutDraggableList.value.push(newItem)
  ElMessage.success(`已添加${componentConfig.title}`)
}

// 删除组件
const removeItem = (i: string) => {
  const index = layoutDraggableList.value.findIndex((item: LayoutItem) => item.i === i)
  if (index !== -1) {
    layoutDraggableList.value.splice(index, 1)
  }
}

// 事件处理
const resizeEvent = (i: string, newH: number, newW: number, newHPx: number, newWPx: number) => {
  console.log('RESIZE i=' + i + ', H=' + newH + ', W=' + newW + ', H(px)=' + newHPx + ', W(px)=' + newWPx)
}

const movedEvent = (i: string, newX: number, newY: number) => {
  console.log('MOVED i=' + i + ', X=' + newX + ', Y=' + newY)
}

// 工具栏位置处理
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

// 事件监听
emitter.on('save', saveDragDataHome)
emitter.on('reset', resetLayout)
emitter.on('edit', editDragDataHome)
emitter.on('funcModeChange', (event: unknown) => {
  if (typeof event === 'string') {
    handleFuncModeChange(event);
  }
});

// 初始化
initLayout()

// 生命周期
onMounted(() => {
  startAnimation()
})

onUnmounted(() => {
  stopAnimation()
  saveCurrentLayout()
})
</script>

<!-- 样式保持不变 -->
<style scoped>
/* 原有样式保持不变 */
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

.remove-btn {
  padding: 0;
  color: #909399;
}

.remove-btn:hover {
  color: #F56C6C;
}
</style>
