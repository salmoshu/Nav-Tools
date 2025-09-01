import emitter from './useMitt'
import { navMode, AppMode, FuncMode, appConfig } from '@/settings/config'

// 自动从AppMap生成所有映射
const appModeMap = Object.fromEntries(
  Object.entries(AppMode)
    .filter(([key, value]) => isNaN(Number(key)))
    .map(([key, value]) => [key.toLowerCase(), value])
)

function openModuleView(appKey: string, moduleKey: string) {
  const funcModeMap = Object.fromEntries(
    Object.keys(appConfig[appKey as keyof typeof appConfig]?.module).map(moduleKey => {
      const module = appConfig[appKey as keyof typeof appConfig]?.module[moduleKey]
      return [moduleKey, module?.funcMode || FuncMode.None]
    })
  )

  ;(navMode as any).appMode = appModeMap[appKey]
  navMode.funcMode = funcModeMap[moduleKey]
}

if (window.ipcRenderer) {
  window.ipcRenderer.on('main-process-message', (_event, ...args) => {
    console.log(args[0])
  })

  // 动态注册所有Module的事件监听
  Object.keys(appConfig).forEach(appKey => {
    const modules = appConfig[appKey as keyof typeof appConfig]?.module || {}
    Object.keys(modules).forEach(moduleKey => {
      const eventName = `open-${moduleKey}-view`
      window.ipcRenderer.on(eventName, () => {
        emitter.emit(modules[moduleKey].title.toLowerCase())
        openModuleView(appKey, moduleKey)
      })
    })
  })
}
