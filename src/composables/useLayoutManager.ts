import { ref, watch, computed, markRaw, defineAsyncComponent } from 'vue'
import type { DefineComponent } from 'vue'
import { appConfig } from '@/settings/config'
import { ElMessage } from 'element-plus'
import emitter from '@/hooks/useMitt'

export interface LayoutItem {
  titleName: string
  component: any
  componentName: string
  funcMode?: string
  x: number
  y: number
  w: number
  h: number
  i: string
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
}

// 全局组件缓存
const componentCache = new Map<string, any>()

// 路径转换函数 - 将@别名转换为相对路径
const convertPath = (path: string): string => {
  if (path.startsWith('@/')) {
    // 将 @/components/... 转换为 ../components/...
    return path.replace('@/', '../')
  }
  return path
}

// 问题：
// 在 开发时，../components/... 是存在的，
// 但在 构建后，路径被打包成了哈希文件名
//
// 解决：
// Vite 提供了 import.meta.glob 来预扫描并打包动态路径
// 这样 Vite 会在构建时把所有匹配的 .vue 文件打包进去，
// 并生成一个 modules 映射表，运行时通过路径查找即可，从而避免了路径问题
const modules = import.meta.glob<DefineComponent>('../components/**/*.vue')
const loadComponent = (componentPath: string) => {
  // 把 @/components/xxx.vue 转成 ../components/xxx.vue
  const resolvedPath = convertPath(componentPath)

  if (componentCache.has(resolvedPath)) return componentCache.get(resolvedPath)

  const loader = modules[resolvedPath]
  if (!loader) {
    console.error(`[loadComponent] 未找到组件: ${resolvedPath}`)
    return null
  }

  const component = markRaw(defineAsyncComponent(loader))
  componentCache.set(resolvedPath, component)
  return component
}

const getAppMapConfig = (mode: string) => {
  for (const [_, config] of Object.entries(appConfig)) {
    const modules = (config as any) as Record<string, any>
    for (const [_, moduleConfig] of Object.entries(modules)) {
      if (moduleConfig.funcMode === mode) {
        return modules
      }
    }
  }
  return appConfig.example
}

const getModuleName = (mode: string): string => {
  // 自动从AppMap中查找匹配的模块名
  for (const [_, config] of Object.entries(appConfig)) {
    const modules = (config as any) as Record<string, any>
    for (const [moduleName, moduleConfig] of Object.entries(modules)) {
      if (moduleConfig.funcMode === mode) {
        return moduleName
      }
    }
  }
  return 'example'
}

const getDynamicComponentMap = (mode: string) => {
  const moduleName = getModuleName(mode)
  const appMapConfig = getAppMapConfig(mode)
  
  if (!(moduleName in appMapConfig)) {
    console.warn(`Module ${moduleName} not found in appConfig`)
    return {}
  }

  const moduleConfig = (appMapConfig as Record<string, any>)[moduleName]
  const componentMap: Record<string, { component: any; title: string; }> = {}

  // 使用AppMap中的template和templateNames
  const templates = moduleConfig.template || []
  const templateNames = moduleConfig.templateNames || []
  
  templates.forEach((templatePath: string, index: number) => {
    const templateName = templateNames[index]
    const actionName = moduleConfig.action[index]
    if (templateName) {
      componentMap[templateName] = {
        component: loadComponent(templatePath),
        title: `${moduleConfig.title} ${actionName.charAt(0).toUpperCase() + actionName.slice(1)}`,
      }
    }
  })

  return componentMap
}

// 动态获取默认布局配置
const getDynamicDefaultLayoutConfig = async (mode: string) => {
  const moduleName = getModuleName(mode)
  const appMapConfig = getAppMapConfig(mode)
  
  if (!Object.prototype.hasOwnProperty.call(appMapConfig, moduleName)) {
    return []
  }

  const moduleConfig = (appMapConfig as Record<string, any>)[moduleName]
  const templates = moduleConfig.templateNames || []
  
  // 根据模板数量生成默认布局
  return templates.map((templateName: string, index: number) => {
    const baseName = templateName.toLowerCase()
    const actionName = moduleConfig.action[index]
    
    return {
      x: (index % 2) * 6,
      y: Math.floor(index / 2) * 4,
      w: 6,
      h: 6,
      i: `${moduleName}-${baseName}-${index + 1}`,
      titleName: `${moduleConfig.title} ${actionName.charAt(0).toUpperCase() + actionName.slice(1)}`,
      componentName: templateName,
      minW: 4,
      minH: 5,
      maxW: 12,
      maxH: 10,
    }
  })
}

// 根据功能模式动态获取组件列表
const getDynamicComponentsByMode = (mode: string): string[] => {
  const moduleName = getModuleName(mode)
  const appMapConfig = getAppMapConfig(mode)
  
  if (!Object.prototype.hasOwnProperty.call(appMapConfig, moduleName)) {
    return []
  }

  return (appMapConfig as Record<string, any>)[moduleName]?.templateNames || []
}

// 布局管理组合式函数
export function useLayoutManager() {
  const appKeys = Object.keys(appConfig) as Array<keyof typeof appConfig>
  const firstAppKey = appKeys[0]
  const firstApp = appConfig[firstAppKey]
  const moudleKeys = Object.keys(firstApp) as Array<keyof typeof firstApp>
  const firstModuleKey = moudleKeys[0]
  const firstModule = firstApp[firstModuleKey]
  const currentFuncMode = ref(firstModule.funcMode)

  const layoutDraggableList = ref<LayoutItem[]>([])

  // 动态组件映射
  const dynamicComponentMap = ref<Record<string, any>>({})

  // 添加原始布局备份，用于检测更改
  const originalLayout = ref<LayoutItem[]>([])
  
  // 检测布局是否有更改
  const hasLayoutChanged = computed(() => {
    if (layoutDraggableList.value.length !== originalLayout.value.length) {
      return true
    }
    
    return layoutDraggableList.value.some((item, index) => {
      const original = originalLayout.value[index]
      return !original || 
        item.x !== original.x || 
        item.y !== original.y || 
        item.w !== original.w || 
        item.h !== original.h
    })
  })
  
  // 监听布局更改
  watch(hasLayoutChanged, (changed) => {
    if (changed) {
      emitter.emit('layout-changed')
    }
  })

  // 更新动态组件映射
  const updateDynamicComponentMap = (mode: string) => {
    const componentMap = getDynamicComponentMap(mode)
    dynamicComponentMap.value = Object.fromEntries(
      Object.entries(componentMap).map(([key, value]) => [
        key,
        { ...value, component: markRaw(value.component) }
      ])
    )
  }

  const backupCurrentLayout = () => {
    originalLayout.value = layoutDraggableList.value.map(item => ({
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      i: item.i,
      titleName: item.titleName,
      component: item.component,
      componentName: item.componentName,
      minW: item.minW,
      minH: item.minH,
      maxW: item.maxW,
      maxH: item.maxH,
    }))
  }

  // 从配置加载布局
  const loadLayoutFromConfig = async (config: any[]) => {
    layoutDraggableList.value = config.map((item: any) => {
      const componentConfig = dynamicComponentMap.value[item.componentName]
      return {
        ...item,
        component: markRaw(componentConfig?.component || null),
      }
    })
    // 加载完成后备份布局
    backupCurrentLayout()
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
      componentName: item.componentName,
      minW: item.minW,
      minH: item.minH,
      maxW: item.maxW,
      maxH: item.maxH,
    }))
    
    localStorage.setItem(`dashboard-layout-${currentFuncMode.value}`, JSON.stringify(layoutToSave))
  }

  // 创建最佳布局 = 组件数量 * 组件最佳宽度
  const createBestLayout = async () => {
    const componentCount = layoutDraggableList.value.length
    let columnCount = 2
    if (componentCount > 4) {
      columnCount = 3
    } else if (componentCount > 9) {
      columnCount = 4
    } else {
      columnCount = 2
    }

    const cellWidth = 12 / columnCount
    const cellHeight = 6 // 每个单元格的高度

    layoutDraggableList.value = layoutDraggableList.value.map((item, index) => ({
      ...item,
      x: (index % columnCount) * cellWidth, // 根据索引计算 x 坐标
      y: Math.floor(index / columnCount) * cellHeight, // 根据索引计算 y 坐标
      w: cellWidth,
      h: cellHeight,
    }))
    // 更新备份
    backupCurrentLayout()
  }

  // 创建默认布局
  const createDefaultLayout = async () => {
    try {
      const layoutConfig = await getDynamicDefaultLayoutConfig(currentFuncMode.value)
      
      layoutDraggableList.value = layoutConfig.map((item: any) => ({
        ...item,
        component: markRaw(dynamicComponentMap.value[item.componentName]?.component || null),
      }))
      // 更新备份
      backupCurrentLayout()
    } catch (error) {
      console.error('Failed to create default layout:', error)
    }
  }

  // 初始化布局
  const initLayout = async () => {
    updateDynamicComponentMap(currentFuncMode.value)

    const savedLayout = localStorage.getItem(`dashboard-layout-${currentFuncMode.value}`)
    
    if (savedLayout) {
      try {
        const parsed = JSON.parse(savedLayout)
        await loadLayoutFromConfig(parsed)
      } catch (error) {
        console.error('Failed to load saved layout:', error)
        await createDefaultLayout()
      }
    } else {
      await createDefaultLayout()
    }
    // 初始化时备份布局
    backupCurrentLayout()
  }

  // 自适应布局
  const autoLayout = async () => {
    localStorage.removeItem(`dashboard-layout-${currentFuncMode.value}`)
    await createBestLayout()
    backupCurrentLayout()
  }

  // 重置布局
  const resetLayout = async () => {
    localStorage.removeItem(`dashboard-layout-${currentFuncMode.value}`)
    await createDefaultLayout()
    backupCurrentLayout()
  }

  // 保存布局
  const saveLayout = () => {
    saveCurrentLayout()
    ElMessage({
      message: '布局已保存',
      type: 'success',
      duration: 1000
    })
    backupCurrentLayout()
  }

  // 编辑布局 - 保持为空，因为一直处于编辑状态
  const editLayout = () => {
    // 无需操作，因为已经设置为始终可编辑
  }

  // 添加组件
  const addItem = async (componentName: string) => {
    if (!dynamicComponentMap.value[componentName]) {
      ElMessage({
        message: `组件 ${componentName} 不存在`,
        type: 'warning',
        duration: 1000
      })
      return
    }

    const exists = layoutDraggableList.value.some(item => item.componentName === componentName)
    
    if (exists) {
      ElMessage({
        message: `${componentName} 已存在`,
        type: 'warning',
        duration: 1000
      })
      return
    }

    const newItem: LayoutItem = {
      x: 0,
      y: 0,
      w: 6,
      h: 6,
      i: `${componentName}-${Date.now()}`,
      titleName: dynamicComponentMap.value[componentName]?.title,
      componentName,
      component: markRaw(dynamicComponentMap.value[componentName]?.component || null),
      minW: 4,
      minH: 5,
      maxW: 12,
      maxH: 10,
    }

    layoutDraggableList.value.unshift(newItem)
    // 添加组件后更新备份
    backupCurrentLayout()
    
    ElMessage({
      message: `已添加 ${newItem.titleName}`,
      type: 'success',
      duration: 1000
    })
  }

  // 删除组件
  const removeItem = (i: string) => {
    const index = layoutDraggableList.value.findIndex((item: LayoutItem) => item.i === i)
    if (index !== -1) {
      backupCurrentLayout()
      layoutDraggableList.value.splice(index, 1)
    }
  }

  // 处理功能模式切换
  const handleFuncModeChange = async (mode: string) => {
    if (currentFuncMode.value === mode) {
      return
    }

    // 保存当前布局
    saveCurrentLayout()
    emitter.emit('save')
    
    // 切换模式
    currentFuncMode.value = mode
    
    // 重新初始化布局
    await initLayout()
  }

  const isCardVisible = true // to be defined

  return {
    // 状态
    layoutDraggableList,
    isCardVisible,
    hasLayoutChanged,  // 导出布局更改状态
    
    // 方法
    initLayout,
    saveCurrentLayout,
    autoLayout,
    resetLayout,
    saveLayout,
    editLayout,
    addItem,
    removeItem,
    handleFuncModeChange,
    loadLayoutFromConfig
  }
}