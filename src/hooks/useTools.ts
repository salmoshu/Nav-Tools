import { navMode, AppMode, FuncMode } from '@/types/mode'

const menuEvent = {
  openPncView,
  openPosView,
}

function openPncView() {
  navMode.appMode = AppMode.Pnc
  if (navMode.funcMode === FuncMode.None || 
      navMode.funcMode > FuncMode.BehaviorTree || 
      navMode.funcMode < FuncMode.Follow) {
    navMode.funcMode = FuncMode.Follow
  }
}

function openPosView() {
  navMode.appMode = AppMode.Pos
  if (navMode.funcMode === FuncMode.None || 
      navMode.funcMode > FuncMode.Vision || 
      navMode.funcMode < FuncMode.Gnss) {
    navMode.funcMode = FuncMode.Gnss
  }
}

export { 
  menuEvent,
}
