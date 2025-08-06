import { reactive } from 'vue'

enum AppMode {
  None = 0,
  Pnc  = 1,
  Pos  = 2,
}

enum FuncMode {
  None         = 0,
  Follow       = 10,
  BehaviorTree = 11,
  Gnss         = 20,
  Imu          = 21,
  Vision       = 22,
}

class NavMode {
  private currMode = reactive({
    appMode: AppMode.Pnc as AppMode,
    funcMode: FuncMode.Follow as FuncMode,
  })

  get appMode()  { return this.currMode.appMode }
  set appMode(m: AppMode)  { this.currMode.appMode = m }

  get funcMode() { return this.currMode.funcMode }
  set funcMode(m: FuncMode) { this.currMode.funcMode = m }

  get currentMode() { return this.currMode }
}

export type AppModeType  = AppMode
export type FuncModeType = FuncMode
export const navMode = new NavMode()
export { AppMode, FuncMode }
