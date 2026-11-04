import { app, BrowserWindow, ipcMain } from 'electron'
import * as path from 'node:path'
import type { RtkNaviStartRequest } from '../../src/core/gnsslib/RtkNavi'
import { showScopedSaveDialog } from './dialogs'
import { RtkNaviService } from './services/RtkNaviService'

export function registerRtkNaviIpc(
  service = new RtkNaviService(path.join(app.getPath('userData'), 'gnsslib', 'rtknavi')),
): void {
  ipcMain.handle('rtknavi-start', (event, request: RtkNaviStartRequest) => {
    return service.start(event.sender, request)
  })
  ipcMain.handle('rtknavi-stop', (event, runId: unknown) => {
    return service.stop(event.sender.id, typeof runId === 'string' ? runId : undefined)
  })
  ipcMain.handle('rtknavi-status', (event) => service.status(event.sender.id))
  ipcMain.handle('rtknavi-choose-output', async (event, defaultPath: unknown) => {
    const target = BrowserWindow.fromWebContents(event.sender)
    const result = await showScopedSaveDialog(target, 'gnsslib-rtknavi-output', {
      title: '保存实时 GNSS 解决方案',
      defaultPath: typeof defaultPath === 'string' && defaultPath ? defaultPath : 'rtknavi.pos',
      filters: [
        { name: 'RTKLIB 解决方案', extensions: ['pos'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    })
    return result.canceled || !result.filePath ? null : result.filePath
  })
}
