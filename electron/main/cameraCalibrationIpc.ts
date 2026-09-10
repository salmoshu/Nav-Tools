import { BrowserWindow, ipcMain } from 'electron'
import type { CameraCalibrationConfig } from '../../src/core/camera/CameraCalibrationTypes'
import type { CameraCalibrationService } from './services/CameraCalibrationService'
import type {
  CameraMeasurementAccessStore,
} from './services/CameraMeasurementAccessStore'

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`请填写${field}`)
  return value.trim()
}

export function registerCameraCalibrationIpc(
  service: CameraCalibrationService,
  accessStore: CameraMeasurementAccessStore,
): void {
  service.configure((state) => {
    for (const target of BrowserWindow.getAllWindows()) {
      if (!target.isDestroyed() && !target.webContents.isDestroyed()) target.webContents.send('camera-calibration-state', state)
    }
  })
  const owners = new Set<number>()
  ipcMain.handle('camera-calibration-snapshot', () => service.snapshot())
  ipcMain.handle('camera-calibration-access', () => accessStore.load())
  ipcMain.handle('camera-calibration-observe', async (event, request: unknown) => {
    if (!request || typeof request !== 'object') throw new Error('请填写测量通道 SSH 配置')
    const request_ = request as Record<string, unknown>
    const stored = accessStore.load()
    const access = {
      host: requireText(request_.host ?? stored.host, '相机地址'),
      port: Number(request_.port ?? stored.port ?? 22),
      username: requireText(request_.username ?? stored.username, 'SSH 用户名'),
      password: typeof request_.password === 'string' ? request_.password : '',
    }
    if (!Number.isInteger(access.port) || access.port < 1 || access.port > 65535) throw new Error('SSH 端口无效')
    const resolved = accessStore.resolve(access)
    accessStore.save(resolved)
    const state = await service.observe(event.sender.id, resolved)
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
