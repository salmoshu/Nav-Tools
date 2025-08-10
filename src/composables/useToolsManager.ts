import { NavMode, Buttons, AppMap } from '@/types/config'

type AppName   = keyof typeof AppMap
type ActionKey = keyof typeof Buttons

function createButtonList(appName: string, funcModeName: string) {
  const appCfg = AppMap[appName as AppName]
  if (!appCfg) return []

  const moduleCfg: { action: readonly string[] } = (appCfg.module as any)[funcModeName]
  if (!moduleCfg) return []

  // 过滤掉可能的非法 action
  return moduleCfg.action
    .filter((a): a is ActionKey => a in Buttons)
    .map(a => Buttons[a])
}

const getButtonList = (navMode: NavMode) => {
  return createButtonList(navMode.appModeStr, navMode.funcModeStr)
}

export {
    getButtonList,
}
