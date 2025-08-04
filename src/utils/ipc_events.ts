import { initEvent } from './example'
import { menuEvent } from './menu'

const ipcEvent = {
  // electron init
  'main-process-message': initEvent.mainProcessMessage,

  // menu bar
  'open-pnc-view': menuEvent.openPncView,
  'open-gnss-view': menuEvent.openGnssView,
}

if (window.ipcRenderer) {
  window.ipcRenderer.on('main-process-message', (_event, ...args) => {
    ipcEvent['main-process-message'](_event, ...args)
  })

  window.ipcRenderer.on('open-pnc-view', () => {
    ipcEvent['open-pnc-view']()
  })

  window.ipcRenderer.on('open-gnss-view', () => {
    ipcEvent['open-gnss-view']()
  })
}
