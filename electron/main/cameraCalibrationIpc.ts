import { BrowserWindow, ipcMain } from 'electron'
import type { CameraCalibrationConfig } from '../../src/core/camera/CameraCalibrationTypes'
import type { CameraCalibrationService } from './services/CameraCalibrationService'
import type { TerminalService } from './services/TerminalService'

export function registerCameraCalibrationIpc(service: CameraCalibrationService, terminal: TerminalService): void {
  service.configure((sessionId) => terminal.getSshHost(sessionId), (state) => {
    for (const target of BrowserWindow.getAllWindows()) {
      if (!target.isDestroyed() && !target.webContents.isDestroyed()) target.webContents.send('camera-calibration-state', state)
    }
  })
  const owners = new Set<number>()
  ipcMain.handle('camera-calibration-snapshot', () => service.snapshot())
  ipcMain.handle('camera-calibration-observe', (event, request: { sessionId: string }) => {
    if (!request || typeof request.sessionId !== 'string') throw new Error('请选择 SSH 会话')
    const state = service.observe(event.sender.id, request.sessionId)
    if (!owners.has(event.sender.id)) {
      owners.add(event.sender.id)
      event.sender.once('destroyed', () => { service.close(event.sender.id); owners.delete(event.sender.id) })
    }
    return state
  })
  ipcMain.handle('camera-calibration-start', (event, config: CameraCalibrationConfig) => {
    if (!config || typeof config !== 'object') throw new Error('标定配置无效')
    return service.start(event.sender.id, config)
  })
  ipcMain.handle('camera-calibration-stop', () => service.stop())
  ipcMain.handle('camera-calibration-close', (event) => service.close(event.sender.id))
  ipcMain.handle('camera-calibration-restore', (event) => service.restore(event.sender.id))
  const timer = setInterval(() => service.tick(), 250)
  timer.unref()
}
