import { mainProcessMessage } from './example'
import { openPncView, openGnssView } from './menu'

const ipcEvent = {
  // electron init
  'main-process-message': mainProcessMessage,

  // menu bar
  'open-pnc-view': openPncView,
  'open-gnss-view': openGnssView,
}

window.ipcRenderer.on('main-process-message', (_event, ...args) => {
  ipcEvent['main-process-message'](_event, ...args)
})

window.ipcRenderer.on('open-pnc-view', () => {
  ipcEvent['open-pnc-view']()
})

window.ipcRenderer.on('open-gnss-view', () => {
  ipcEvent['open-gnss-view']()
})
