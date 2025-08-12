import emitter from './useMitt'
import { navMode, AppMode, FuncMode, appConfig } from '@/types/config'

// 自动从AppMap生成所有映射
const appModeMap = Object.fromEntries(
  Object.entries(AppMode)
    .filter(([key, value]) => isNaN(Number(key)))
    .map(([key, value]) => [key.toLowerCase(), value])
)

// 自动从AppMap生成默认功能模式映射
const defaultFuncModeMap = Object.fromEntries(
  Object.keys(appConfig).map(appKey => {
    const modules = appConfig[appKey as keyof typeof appConfig]?.module || {}
    const firstModule = Object.values(modules)[0] as unknown as { funcMode?: unknown } | undefined
    return [appKey, firstModule?.funcMode || appConfig[appKey as keyof typeof appConfig].currMode || FuncMode.None]
  })
)

// 自动从AppMap生成事件名称映射
const eventNameMap = Object.fromEntries(
  Object.keys(appConfig).map(appKey => {
    const modules = appConfig[appKey as keyof typeof appConfig]?.module || {}
    const firstModuleKey = Object.keys(modules)[0] || appKey
    return [appKey, firstModuleKey.toLowerCase()]
  })
)

// 动态打开视图函数
function openDynamicView(appKey: string) {
  const appMode = appModeMap[appKey]
  const defaultFuncMode = defaultFuncModeMap[appKey]
  
  if (!appMode) return
  
  if (typeof appMode !== 'string') {
    navMode.appMode = appMode
  }
  
  // 获取当前app的所有功能模式范围
  const modules = appConfig[appKey as keyof typeof appConfig]?.module || {}
  const funcModes = Object.values(modules).map(m => (m as unknown as { funcMode?: unknown }).funcMode).filter(Boolean)

  // 检查当前功能模式是否在该app范围内
  const isValidMode = funcModes.includes(navMode.funcMode)
  if (!isValidMode || navMode.funcMode === FuncMode.None) {
    navMode.funcMode = defaultFuncMode
  }
}

if (window.ipcRenderer) {
  window.ipcRenderer.on('main-process-message', (_event, ...args) => {
    console.log(args[0])
  })

  // 动态注册所有AppMap的事件监听
  Object.keys(appConfig).forEach(appKey => {
    const eventName = `open-${appKey}-view`
    window.ipcRenderer.on(eventName, () => {
      const emitterEvent = eventNameMap[appKey]
      if (navMode.appMode !== appModeMap[appKey]) {
        emitter.emit(emitterEvent)
      }
      openDynamicView(appKey)
    })
  })
}
