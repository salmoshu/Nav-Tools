import { initEvent } from './useExample'
import emitter from './useMitt'
import { navMode, AppMode, FuncMode } from '@/types/config'

function openPncView() {
  navMode.appMode = AppMode.Pnc
  if (navMode.funcMode === FuncMode.None || 
      navMode.funcMode > FuncMode.Tree || 
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

if (window.ipcRenderer) {
  window.ipcRenderer.on('main-process-message', (_event, ...args) => {
    initEvent.mainProcessMessage(_event, ...args)
  })

  window.ipcRenderer.on('open-pnc-view', () => {
    if (navMode.appMode !== AppMode.Pnc) {
      emitter.emit('follow')
    }
    openPncView()
  })

  window.ipcRenderer.on('open-gnss-view', () => {
    if (navMode.appMode !== AppMode.Pos) {
      emitter.emit('gnss')
    }
    openPosView()
  })
}
