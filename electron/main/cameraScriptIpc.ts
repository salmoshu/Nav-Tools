import { BrowserWindow, ipcMain } from 'electron'
import type { CameraScriptInjector } from './services/CameraScriptInjector'
import type { CameraMeasurementAccessStore } from './services/CameraMeasurementAccessStore'

function broadcast(channel: string, payload: unknown): void {
  for (const target of BrowserWindow.getAllWindows()) {
    if (!target.isDestroyed() && !target.webContents.isDestroyed()) {
      target.webContents.send(channel, payload)
    }
  }
}

export function registerCameraScriptIpc(
  injector: CameraScriptInjector,
  accessStore: CameraMeasurementAccessStore,
): void {
  ipcMain.handle('camera-script-run', async (_event, request: unknown) => {
    if (!request || typeof request !== 'object') throw new Error('脚本注入配置无效')
    const request_ = request as Record<string, unknown>
    const stored = accessStore.load()
    const host = typeof request_.host === 'string' && request_.host.trim() ? request_.host.trim() : stored.host
    const port = Number(request_.port ?? stored.port ?? 22)
    const username =
      typeof request_.username === 'string' && request_.username.trim()
        ? request_.username.trim()
        : stored.username
    const password = typeof request_.password === 'string' ? request_.password : ''
    if (!host || !username) throw new Error('请填写相机地址与 SSH 用户名')
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SSH 端口无效')
    const timeoutS = Math.floor(Number(request_.timeoutS ?? 120))
    if (!Number.isFinite(timeoutS) || timeoutS < 1 || timeoutS > 600) throw new Error('运行时限须为 1~600 秒')
    if (typeof request_.localPath !== 'string' || !request_.localPath.trim()) {
      throw new Error('请先选择脚本文件')
    }

    const access = accessStore.resolve({ host, port, username, password })
    accessStore.save(access)
    // 异步执行：进度与输出经 camera-script-event 推送，本调用在结束时返回
    await injector.run(
      {
        host: access.host,
        port: access.port,
        username: access.username,
        password: access.password,
        localPath: request_.localPath,
        timeoutS,
      },
      (scriptEvent) => broadcast('camera-script-event', scriptEvent),
    )
    return { ok: true }
  })
  ipcMain.handle('camera-script-stop', () => injector.stop())
}
