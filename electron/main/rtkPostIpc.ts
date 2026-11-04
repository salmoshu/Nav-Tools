import { BrowserWindow, ipcMain } from 'electron'
import type { RtkPostRunRequest } from '../../src/core/gnsslib/RtkPost'
import { showScopedSaveDialog } from './dialogs'
import { RtkPostService } from './services/RtkPostService'

export function registerRtkPostIpc(service = new RtkPostService()): void {
  ipcMain.handle('rtkpost-run', async (event, request: RtkPostRunRequest) => {
    return service.run(event.sender, request)
  })
  ipcMain.handle('rtkpost-cancel', (event, runId: unknown) => {
    return typeof runId === 'string' ? service.cancel(event.sender.id, runId) : false
  })
  ipcMain.handle(
    'rtkpost-choose-output',
    async (event, request: { defaultPath?: unknown; outputFormat?: unknown }) => {
      const target = BrowserWindow.fromWebContents(event.sender)
      const nmea = request?.outputFormat === 'nmea'
      const result = await showScopedSaveDialog(target, 'gnssraw-rtkpost-output', {
        title: '保存 GNSS 解决方案',
        defaultPath: typeof request?.defaultPath === 'string' ? request.defaultPath : undefined,
        filters: [
          nmea
            ? { name: 'NMEA 解决方案', extensions: ['nmea'] }
            : { name: 'RTKLIB 解决方案', extensions: ['pos'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      })
      return result.canceled || !result.filePath ? null : result.filePath
    },
  )
}
