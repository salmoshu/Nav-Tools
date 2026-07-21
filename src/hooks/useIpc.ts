import emitter from './useMitt'

if (window.ipcRenderer) {
  window.ipcRenderer.on('main-process-message', (_event, ...args) => {
    console.log(args[0])
  })

  window.ipcRenderer.on('open-application-selector', () => {
    emitter.emit('open-application-selector')
  })
}
