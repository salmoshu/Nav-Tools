import { reactive } from 'vue'

enum AppMode {
  None = 0,
  Pnc,
  Pos,
}

enum FuncMode {
  None = 0,
  // Pnc
  Follow = 10,
  BehaviorTree,
  // Pos
  Gnss = 20,
  Imu,
  Vision,
}

const currMode = reactive({
  appMode: AppMode.Pnc,
  funcMode: FuncMode.Follow,
})

const menuEvent = {
  openPncView,
  openGnssView,
}

function openPncView() {
  currMode.appMode = AppMode.Pnc
  if (currMode.funcMode === FuncMode.None || 
      currMode.funcMode > FuncMode.BehaviorTree || 
      currMode.funcMode < FuncMode.Follow) {
    currMode.funcMode = FuncMode.Follow
  }
}

function openGnssView() {
  currMode.appMode = AppMode.Pos
  if (currMode.funcMode === FuncMode.None || 
      currMode.funcMode > FuncMode.Vision || 
      currMode.funcMode < FuncMode.Gnss) {
    currMode.funcMode = FuncMode.Gnss
  }
}

export { 
  AppMode,
  FuncMode,
  currMode,
  menuEvent,
}
