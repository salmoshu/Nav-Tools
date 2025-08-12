import { NavMode, appConfig } from '@/types/config'

type AppName   = keyof typeof appConfig

function createButtonList(appName: string, funcModeName: string) {
  const appCfg = appConfig[appName as AppName]
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
