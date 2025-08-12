// src/hooks/usePinia.ts (增强版)
import { createPinia, defineStore } from 'pinia'
import { reactive, computed, ref, type Ref } from 'vue'
import { appConfig } from '@/types/config'

// Pinia实例
export const pinia = createPinia()

// Store缓存
const storeCache = new Map<string, any>()

// 模块Store映射
const moduleStoreMap = new Map<string, any>()

// 动态Store创建器
class DynamicStoreFactory {
  private static async loadModuleStore(moduleName: string, propsPath: string) {
    try {
      // 从templatePropsPaths提取实际路径
      const actualPath = propsPath.replace('@/', 'src/').replace('.vue', '.ts')
      const module = await import(/* @vite-ignore */ `/${actualPath}`)
      
      // 获取useXxxProps函数
      const usePropsFnName = `use${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Props`
      const usePropsFn = module[usePropsFnName]
      
      if (usePropsFn) {
        return usePropsFn()
      }
      
      // 如果找不到特定函数，创建默认store
      return this.createDefaultModuleStore(moduleName)
    } catch (error) {
      console.warn(`Failed to load store for ${moduleName} from ${propsPath}:`, error)
      return this.createDefaultModuleStore(moduleName)
    }
  }

  private static createDefaultModuleStore(moduleName: string) {
    return {
      config: reactive({}),
      data: reactive({}),
      status: reactive({}),
      actions: reactive({}),
      
      updateConfig: (newConfig: any) => Object.assign(this.config, newConfig),
      reset: () => {
        Object.keys(this.config).forEach(key => delete this.config[key])
        Object.keys(this.data).forEach(key => delete this.data[key])
      },
      
      // 默认状态计算
      get isReady() { return computed(() => true) }
    }
  }

  static async createStoreFromConfig(moduleName: string) {
    // 从appConfig获取props路径
    let propsPath = ''
    
    // 查找对应的module配置
    for (const [appKey, appConfigItem] of Object.entries(appConfig)) {
      const modules = appConfigItem.module as Record<string, any>
      if (modules[moduleName]) {
        propsPath = modules[moduleName].templatePropsPaths
        break
      }
    }
    
    if (!propsPath) {
      console.warn(`No templatePropsPaths found for ${moduleName}`)
      return this.createDefaultModuleStore(moduleName)
    }

    return await this.loadModuleStore(moduleName, propsPath)
  }
}

// 自动Store生成器
export function createAutoStore(moduleName: string) {
  const storeId = `auto-${moduleName}`
  
  if (storeCache.has(storeId)) {
    return storeCache.get(storeId)
  }

  const store = defineStore(storeId, () => {
    // 基础状态容器
    const state = reactive({
      config: {},
      data: {},
      status: {},
      meta: {
        moduleName,
        initialized: false,
        loading: false,
        error: null as string | null
      }
    })

    // 模块特定状态
    let moduleState: any = null
    
    // 初始化函数
    const initialize = async () => {
      state.meta.loading = true
      state.meta.error = null
      
      try {
        moduleState = await DynamicStoreFactory.createStoreFromConfig(moduleName)
        
        // 同步状态
        if (moduleState) {
          Object.assign(state.config, moduleState.config || {})
          Object.assign(state.data, moduleState.data || {})
          Object.assign(state.status, moduleState.status || {})
          
          // 添加模块特定的方法和属性
          Object.keys(moduleState).forEach(key => {
            if (!['config', 'data', 'status'].includes(key)) {
              (state as any)[key] = moduleState[key]
            }
          })
        }
        
        state.meta.initialized = true
      } catch (error) {
        state.meta.error = error instanceof Error ? error.message : 'Initialization failed'
      } finally {
        state.meta.loading = false
      }
    }

    // 通用方法
    const updateConfig = (newConfig: any) => {
      if (moduleState?.updateConfig) {
        moduleState.updateConfig(newConfig)
      } else {
        Object.assign(state.config, newConfig)
      }
    }

    const reset = () => {
      if (moduleState?.reset) {
        moduleState.reset()
      } else {
        Object.keys(state.config).forEach(key => delete state.config[key])
        Object.keys(state.data).forEach(key => delete state.data[key])
      }
    }

    const refresh = () => initialize()

    // 计算属性
    const isReady = computed(() => state.meta.initialized && !state.meta.loading)
    const hasError = computed(() => !!state.meta.error)

    // 自动初始化
    initialize()

    return {
      // 状态
      ...state,
      
      // 计算属性
      isReady,
      hasError,
      
      // 方法
      updateConfig,
      reset,
      refresh,
      initialize,
      
      // 模块特定的方法和计算属性
      ...(moduleState || {})
    }
  })

  storeCache.set(storeId, store)
  return store
}

// src/hooks/usePinia.ts (继续添加)

// 基于appConfig自动生成所有store映射
export const autoStores = (() => {
  const stores: Record<string, any> = {}
  
  // 遍历appConfig创建store
  Object.entries(appConfig).forEach(([appName, appConfig]) => {
    Object.entries(appConfig.module).forEach(([moduleName]) => {
      const storeKey = `${appName}${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Store`
      stores[storeKey] = createAutoStore(moduleName)
    })
  })
  
  return stores
})()

// 快捷访问函数
export const useAutoStore = {
  // 直接访问特定模块的store
  follow: () => createAutoStore('follow')(),
  tree: () => createAutoStore('tree')(),
  gnss: () => createAutoStore('gnss')(),
  imu: () => createAutoStore('imu')(),
  vision: () => createAutoStore('vision')(),
  demo1: () => createAutoStore('demo1')(),
  demo2: () => createAutoStore('demo2')(),
  
  // 动态获取store
  byModule: (moduleName: string) => createAutoStore(moduleName)(),
  byAppAndModule: (appName: string, moduleName: string) => createAutoStore(moduleName)()
}

// 全局store注册器
export function registerAllStores() {
  const registeredStores: Record<string, any> = {}
  
  Object.entries(appConfig).forEach(([appName, appConfig]) => {
    Object.entries(appConfig.module).forEach(([moduleName, moduleConfig]) => {
      const storeName = `${appName}${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Store`
      const store = createAutoStore(moduleName)
      registeredStores[storeName] = store
    })
  })
  
  return registeredStores
}
