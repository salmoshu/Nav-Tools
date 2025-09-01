import emitter from './useMitt'
import { navMode, appConfig } from '@/settings/config'

// 自动从appConfig生成所有映射
const appModeArr = Object.keys(appConfig) as Array<keyof typeof appConfig>
const appModeMap = Object.fromEntries(appModeArr.map(appKey => [appKey, appKey]))
function openModuleView(appKey: string, moduleKey: string) {
  const funcModeMap = Object.fromEntries(
    Object.keys(appConfig[appKey as keyof typeof appConfig]).map(moduleKey => {
      const module = appConfig[appKey as keyof typeof appConfig][moduleKey]
      return [moduleKey, module?.funcMode || 'none']
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
    const modules = appConfig[appKey as keyof typeof appConfig] || {}
    Object.keys(modules).forEach(moduleKey => {
      const eventName = `open-${moduleKey}-view`
      window.ipcRenderer.on(eventName, () => {
        emitter.emit(modules[moduleKey].title.toLowerCase())
        openModuleView(appKey, moduleKey)
      })
    })
  })
}
