import { ref, markRaw, defineAsyncComponent } from 'vue'
import { FuncMode, appConfig } from '@/types/config'
import { ElMessage } from 'element-plus'

// 布局项接口
export interface LayoutItem {
  titleName: string
  component: any
  componentName: string
  props?: Record<string, any>
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
const propsCache = new Map<string, any>()

// 路径转换函数 - 将@别名转换为相对路径
const convertPath = (path: string): string => {
  if (path.startsWith('@/')) {
    // 将 @/components/... 转换为 ../components/...
    return path.replace('@/', '../')
  }
  return path
}

// 动态加载组件
// 动态加载组件
const loadComponent = (componentPath: string) => {
  const resolvedPath = convertPath(componentPath)
  
  if (componentCache.has(resolvedPath)) {
    return componentCache.get(resolvedPath)
  }
  
  const component = markRaw(defineAsyncComponent(() => import(/* @vite-ignore */ resolvedPath)))
  componentCache.set(resolvedPath, component)
  return component
}

// 动态加载props
const loadProps = async (moduleName: string) => {
  const propsKey = `${moduleName}Props`
  if (propsCache.has(propsKey)) {
    return propsCache.get(propsKey)
  }

  try {
    // 构建props文件路径 - 使用相对路径
    const propsPath = `../composables/${moduleName.toLowerCase()}/use${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Props.ts`
    const module = await import(/* @vite-ignore */ propsPath)
    
    // 使用useFollowMain等函数
    const useMainFn = module[`use${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Main`]
    if (useMainFn) {
      const props = useMainFn()
      propsCache.set(propsKey, props)
      return props
    }
  } catch (error) {
    console.warn(`Failed to load props for ${moduleName}:`, error)
  }
  
  return {}
}

// 根据FuncMode获取对应的AppMap配置 - 自适应版本
const getAppMapConfig = (mode: FuncMode) => {
  // 自动匹配FuncMode到对应的AppMap模块
  for (const [appName, appCfg] of Object.entries(appConfig)) {
    const modules = appCfg.module as Record<string, any>
    for (const [moduleName, moduleConfig] of Object.entries(modules)) {
      if (moduleConfig.funcMode === mode) {
        return modules
      }
    }
  }
  return appConfig.example.module
}

// 获取当前模式的模块名称 - 自适应版本
const getModuleName = (mode: FuncMode): string => {
  // 自动从AppMap中查找匹配的模块名
  for (const [appName, appCfg] of Object.entries(appConfig)) {
    const modules = appCfg.module as Record<string, any>
    for (const [moduleName, moduleConfig] of Object.entries(modules)) {
      if (moduleConfig.funcMode === mode) {
        return moduleName
      }
    }
  }
  return 'example'
}

// 动态获取组件映射
const getDynamicComponentMap = (mode: FuncMode) => {
  const moduleName = getModuleName(mode)
  const appMapConfig = getAppMapConfig(mode)
  
  if (!(moduleName in appMapConfig)) {
    console.warn(`Module ${moduleName} not found in appConfig`)
    return {}
  }

  const moduleConfig = (appMapConfig as Record<string, any>)[moduleName]
  const componentMap: Record<string, { component: any; title: string; props: Record<string, any> }> = {}

  // 使用AppMap中的template和templateNames
  const templates = moduleConfig.template || []
  const templateNames = moduleConfig.templateNames || []
  
  templates.forEach((templatePath: string, index: number) => {
    const templateName = templateNames[index]
    if (templateName) {
      componentMap[templateName] = {
        component: loadComponent(templatePath),
        title: `${moduleConfig.title} ${templateName.replace(moduleName, '').toLowerCase()}`,
        props: {} // 将在运行时填充
      }
    }
  })

  return componentMap
}

// 动态获取默认布局配置
const getDynamicDefaultLayoutConfig = async (mode: FuncMode) => {
  const moduleName = getModuleName(mode)
  const appMapConfig = getAppMapConfig(mode)
  
  if (!Object.prototype.hasOwnProperty.call(appMapConfig, moduleName)) {
    return []
  }

  const moduleConfig = (appMapConfig as Record<string, any>)[moduleName]
  const templates = moduleConfig.templateNames || []
  const props = await loadProps(moduleName)
  
  // 根据模板数量生成默认布局
  return templates.map((templateName: string, index: number) => {
    const baseName = templateName.toLowerCase()

    return {
      x: (index % 2) * 6,
      y: Math.floor(index / 2) * 4,
      w: 6,
      h: 4,
      i: `${moduleName}-${baseName}-${index + 1}`,
      titleName: `${moduleConfig.title} ${baseName.replace(moduleName, '').toUpperCase()}`,
      componentName: templateName,
      minW: 3,
      minH: 3,
      maxW:  6,
      maxH: 8,
      props
    }
  })
}

// 根据功能模式动态获取组件列表
const getDynamicComponentsByMode = (mode: FuncMode): string[] => {
  const moduleName = getModuleName(mode)
  const appMapConfig = getAppMapConfig(mode)
  
  if (!Object.prototype.hasOwnProperty.call(appMapConfig, moduleName)) {
    return []
  }

  return (appMapConfig as Record<string, any>)[moduleName]?.templateNames || []
}

// 布局管理组合式函数
export function useLayoutManager() {
  const layoutDraggableList = ref<LayoutItem[]>([])
  const currentFuncMode = ref(FuncMode.Follow)
  const isEditDraggable = ref(false)
  const draggableLayout = ref(false)
  const resizableLayout = ref(false)

  // 动态组件映射
  const dynamicComponentMap = ref<Record<string, any>>({})

  // 更新动态组件映射
  const updateDynamicComponentMap = (mode: FuncMode) => {
    const componentMap = getDynamicComponentMap(mode)
    dynamicComponentMap.value = Object.fromEntries(
      Object.entries(componentMap).map(([key, value]) => [
        key,
        { ...value, component: markRaw(value.component) }
      ])
    )
  }

  // 从配置加载布局
  const loadLayoutFromConfig = async (config: any[]) => {
    const moduleName = getModuleName(currentFuncMode.value)
    const props = await loadProps(moduleName)
    
    layoutDraggableList.value = config.map((item: any) => {
      const componentConfig = dynamicComponentMap.value[item.componentName]
      return {
        ...item,
        component: markRaw(componentConfig?.component || null),
        props: item.props || props || {}
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
      componentName: item.componentName,
      minW: item.minW,
      minH: item.minH,
      maxW: item.maxW,
      maxH: item.maxH
    }))
    
    localStorage.setItem(`dashboard-layout-${currentFuncMode.value}`, JSON.stringify(layoutToSave))
  }

  // 创建默认布局
  const createDefaultLayout = async () => {
    try {
      const layoutConfig = await getDynamicDefaultLayoutConfig(currentFuncMode.value)
      const moduleName = getModuleName(currentFuncMode.value)
      const props = await loadProps(moduleName)
      
      layoutDraggableList.value = layoutConfig.map((item: any) => ({
        ...item,
        component: markRaw(dynamicComponentMap.value[item.componentName]?.component || null),
        props: item.props || props || {}
      }))
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
  }

  // 重置布局
  const resetLayout = async () => {
    localStorage.removeItem(`dashboard-layout-${currentFuncMode.value}`)
    await createDefaultLayout()
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
        message: `${dynamicComponentMap.value[componentName]?.title} 已存在`,
        type: 'warning',
        duration: 1000
      })
      return
    }

    const moduleName = getModuleName(currentFuncMode.value)
    const props = await loadProps(moduleName)
    
    const newItem: LayoutItem = {
      x: 0,
      y: 0,
      w: 6,
      h: 4,
      i: `${componentName}-${Date.now()}`,
      titleName: dynamicComponentMap.value[componentName]?.title || componentName,
      componentName,
      component: markRaw(dynamicComponentMap.value[componentName]?.component || null),
      props: props || {},
      minW: 3,
      minH: 3,
      maxW: 6,
      maxH: 6
    }
    
    layoutDraggableList.value.push(newItem)
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
      layoutDraggableList.value.splice(index, 1)
    }
  }

  // 处理功能模式切换
  const handleFuncModeChange = async (mode: FuncMode) => {
    if (currentFuncMode.value === mode) {
      return
    }

    // 保存当前布局
    saveCurrentLayout()
    
    // 切换模式
    currentFuncMode.value = mode
    
    // 重新初始化布局
    await initLayout()
    
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