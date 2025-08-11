import { NavMode, AppMap } from '@/types/config'

type AppName   = keyof typeof AppMap

function createButtonList(appName: string, funcModeName: string) {
  const appCfg = AppMap[appName as AppName]
  if (!appCfg) return []

  const moduleCfg = (appCfg.module as any)[funcModeName]
  if (!moduleCfg) return []

  // 直接使用AppMap中的actionButtons
  return moduleCfg.actionButtons || []
}

const getButtonList = (navMode: NavMode) => {
  return createButtonList(navMode.appModeStr, navMode.funcModeStr)
}

export {
    getButtonList,
}
