import { ref, markRaw } from 'vue'
import { defineAsyncComponent } from 'vue'
import { FuncMode, navMode } from '@/types/config'
import { useFollowMain } from '@/composables/follow/useFollowMain'
import { ElMessage } from 'element-plus'

const FollowDraw = defineAsyncComponent(() => import('@/components/follow/FollowDraw.vue'))
const FollowConfig = defineAsyncComponent(() => import('@/components/follow/FollowConfig.vue'))
const GnssDraw = defineAsyncComponent(() => import('@/components/gnss/GnssDraw.vue'))
const GnssData = defineAsyncComponent(() => import('@/components/gnss/GnssData.vue'))
const GnssConfig = defineAsyncComponent(() => import('@/components/gnss/GnssConfig.vue'))
const ImuDraw = defineAsyncComponent(() => import('@/components/imu/ImuDraw.vue'))
const ImuData = defineAsyncComponent(() => import('@/components/imu/ImuData.vue'))
const ImuConfig = defineAsyncComponent(() => import('@/components/imu/ImuConfig.vue'))
const VisionDraw = defineAsyncComponent(() => import('@/components/vision/VisionDraw.vue'))
const VisionData = defineAsyncComponent(() => import('@/components/vision/VisionData.vue'))
const VisionConfig = defineAsyncComponent(() => import('@/components/vision/VisionConfig.vue'))
const TreeDraw = defineAsyncComponent(() => import('@/components/tree/TreeDraw.vue'))
const TreeData = defineAsyncComponent(() => import('@/components/tree/TreeData.vue'))
const TreeConfig = defineAsyncComponent(() => import('@/components/tree/TreeConfig.vue'))

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

// 布局项接口
export interface LayoutItem {
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

// 组件映射配置
export const componentMap = {
  // Follow模块
  'FollowDraw': { component: FollowDraw, title: 'Follow Draw', props: { carState, personState, visionLines, visionPath, isDraggingPerson, handleMouseDown } },
  'FollowConfig': { component: FollowConfig, title: 'Follow Config', props: { config, updateConfig } },
  
  // GNSS模块
  'GnssDraw': { component: GnssDraw, title: 'GNSS Draw', props: {} },
  'GnssData': { component: GnssData, title: 'GNSS Data', props: {} },
  'GnssConfig': { component: GnssConfig, title: 'GNSS Config', props: {} },
  
  // IMU模块
  'ImuDraw': { component: ImuDraw, title: 'IMU Draw', props: {} },
  'ImuData': { component: ImuData, title: 'IMU Data', props: {} },
  'ImuConfig': { component: ImuConfig, title: 'IMU Config', props: {} },
  
  // Vision模块
  'VisionDraw': { component: VisionDraw, title: 'Vision Draw', props: {} },
  'VisionData': { component: VisionData, title: 'Vision Data', props: {} },
  'VisionConfig': { component: VisionConfig, title: 'Vision Config', props: {} },
  
  // Tree模块
  'TreeDraw': { component: TreeDraw, title: 'Tree Draw', props: {} },
  'TreeData': { component: TreeData, title: 'Tree Data', props: {} },
  'TreeConfig': { component: TreeConfig, title: 'Tree Config', props: {} }
}

// 根据功能模式过滤组件
export const getComponentsByMode = (mode: FuncMode): string[] => {
  switch (mode) {
    case FuncMode.Follow:
      return ['FollowDraw', 'FollowConfig']
    case FuncMode.Tree:
      return ['TreeDraw', 'TreeData', 'TreeConfig']
    case FuncMode.Gnss:
      return ['GnssDraw', 'GnssData', 'GnssConfig']
    case FuncMode.Imu:
      return ['ImuDraw', 'ImuData', 'ImuConfig']
    case FuncMode.Vision:
      return ['VisionDraw', 'VisionData', 'VisionConfig']
    default:
      return ['FollowDraw', 'FollowConfig']
  }
}

// 默认布局配置
const getDefaultLayoutConfig = (mode: FuncMode) => {
  const configs = {
    [FuncMode.Follow]: [
      { x: 0, y: 0, w: 6, h: 11, i: 'follow-draw-1', titleName: '跟随仿真', componentName: 'FollowDraw', minW: 4, minH: 4, maxW: 8, maxH: 16 },
      { x: 6, y: 3, w: 4, h: 3, i: 'follow-config-2', titleName: '跟随配置', componentName: 'FollowConfig', minW: 2, minH: 2, maxW: 6, maxH: 8 },
    ],
    [FuncMode.Gnss]: [
      { x: 0, y: 0, w: 6, h: 4, i: 'gnss-draw-1', titleName: 'GNSS绘制', componentName: 'GnssDraw', minW: 3, minH: 3, maxW: 6, maxH: 8 },
      { x: 6, y: 0, w: 6, h: 4, i: 'gnss-data-2', titleName: 'GNSS数据', componentName: 'GnssData', minW: 3, minH: 3, maxW: 6, maxH: 6 },
      { x: 6, y: 4, w: 6, h: 4, i: 'gnss-config-4', titleName: 'GNSS配置', componentName: 'GnssConfig', minW: 3, minH: 3, maxW: 6, maxH: 6 }
    ],
    [FuncMode.Imu]: [
      { x: 0, y: 0, w: 6, h: 4, i: 'imu-draw-1', titleName: 'IMU绘制', componentName: 'ImuDraw', minW: 3, minH: 3, maxW: 6, maxH: 8 },
      { x: 6, y: 0, w: 6, h: 4, i: 'imu-data-2', titleName: 'IMU数据', componentName: 'ImuData', minW: 3, minH: 3, maxW: 6, maxH: 6 },
      { x: 6, y: 4, w: 6, h: 4, i: 'imu-config-4', titleName: 'IMU配置', componentName: 'ImuConfig', minW: 3, minH: 3, maxW: 6, maxH: 6 }
    ],
    [FuncMode.Vision]: [
      { x: 0, y: 0, w: 6, h: 4, i: 'vision-draw-1', titleName: 'Vision绘制', componentName: 'VisionDraw', minW: 3, minH: 3, maxW: 6, maxH: 8 },
      { x: 6, y: 0, w: 6, h: 4, i: 'vision-data-2', titleName: 'Vision数据', componentName: 'VisionData', minW: 3, minH: 3, maxW: 6, maxH: 6 },
      { x: 6, y: 4, w: 6, h: 4, i: 'vision-config-4', titleName: 'Vision配置', componentName: 'VisionConfig', minW: 3, minH: 3, maxW: 6, maxH: 6 }
    ],
    [FuncMode.Tree]: [
      { x: 0, y: 0, w: 6, h: 4, i: 'tree-draw-1', titleName: 'Tree绘制', componentName: 'TreeDraw', minW: 3, minH: 3, maxW: 6, maxH: 8 },
      { x: 6, y: 0, w: 6, h: 4, i: 'tree-data-2', titleName: 'Tree数据', componentName: 'TreeData', minW: 3, minH: 3, maxW: 6, maxH: 6 },
      { x: 6, y: 4, w: 6, h: 4, i: 'tree-config-4', titleName: 'Tree配置', componentName: 'TreeConfig', minW: 3, minH: 3, maxW: 6, maxH: 6 }
    ]
  }
  
  return configs[mode as keyof typeof configs] || configs[FuncMode.Follow as keyof typeof configs]
}

// 布局管理组合式函数
export function useLayoutManager() {
  const layoutDraggableList = ref<LayoutItem[]>([])
  const currentFuncMode = ref(FuncMode.Follow)
  const isEditDraggable = ref(false)
  const draggableLayout = ref(false)
  const resizableLayout = ref(false)

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

  // 保存当前布局
  const saveCurrentLayout = () => {
    const layoutToSave = layoutDraggableList.value.map(item => ({
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      i: item.i,
      titleName: item.titleName,
      componentName: Object.keys(componentMap).find(key => 
        componentMap[key as keyof typeof componentMap].component === item.component
      ),
      minW: item.minW,
      minH: item.minH,
      maxW: item.maxW,
      maxH: item.maxH
    }))
    
    localStorage.setItem(`dashboard-layout-${currentFuncMode.value}`, JSON.stringify(layoutToSave))
  }

  // 初始化布局
  const initLayout = () => {
    const savedLayout = localStorage.getItem(`dashboard-layout-${currentFuncMode.value}`)
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

  // 创建默认布局
  const createDefaultLayout = () => {
    const layoutConfig = getDefaultLayoutConfig(currentFuncMode.value as FuncMode)
    loadLayoutFromConfig(layoutConfig)
  }

  // 重置布局
  const resetLayout = () => {
    localStorage.removeItem(`dashboard-layout-${currentFuncMode.value}`)
    createDefaultLayout()
    isEditDraggable.value = false
    draggableLayout.value = false
    resizableLayout.value = false
  }

  // 保存布局
  const saveLayout = () => {
    isEditDraggable.value = false
    draggableLayout.value = false
    resizableLayout.value = false
    saveCurrentLayout()
    
    ElMessage({
      message: '布局已保存',
      type: 'success',
      duration: 1000
    })
  }

  // 编辑布局
  const editLayout = () => {
    isEditDraggable.value = true
    draggableLayout.value = true
    resizableLayout.value = true
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
      ElMessage({
        message: `${componentConfig.title}已存在`,
        type: 'warning',
        duration: 1000
      })
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
    ElMessage({
      message: `已添加${componentConfig.title}`,
      type: 'success',
      duration: 1000

    })
  }

  // 删除组件
  const removeItem = (i: string) => {
    const index = layoutDraggableList.value.findIndex((item: LayoutItem) => item.i === i)
    if (index !== -1) {
      layoutDraggableList.value.splice(index, 1)
    }
  }

  // 处理功能模式切换
  const handleFuncModeChange = (mode: FuncMode) => {
    if (navMode.funcMode === mode) {
      return
    }

    // 保存当前布局
    saveCurrentLayout()
    
    // 切换模式
    currentFuncMode.value = mode
    
    // 重新初始化布局
    initLayout()
    
    // 重启动画
    stopAnimation()
    startAnimation()

    ElMessage({
      message: `已切换到 ${FuncMode[mode].toUpperCase()} 组件`,
      type: 'success',
      duration: 1000
    })

  }

  return {
    // 状态
    layoutDraggableList,
    isEditDraggable,
    draggableLayout,
    resizableLayout,
    
    // 方法
    initLayout,
    saveCurrentLayout,
    resetLayout,
    saveLayout,
    editLayout,
    addItem,
    removeItem,
    handleFuncModeChange,
    loadLayoutFromConfig
  }
}