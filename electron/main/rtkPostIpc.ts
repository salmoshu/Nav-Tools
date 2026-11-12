import { BrowserWindow, ipcMain } from 'electron'
import type { RtkPostObservationSpans, RtkPostRunRequest } from '../../src/core/gnsslib/RtkPost'
import { showScopedSaveDialog } from './dialogs'
import { RtkPostService } from './services/RtkPostService'
import { gnssSolverTasks } from './services/GnssSolverTasks'
import { readRinexObservationSpan } from './services/RinexObservationSpan'

export function registerRtkPostIpc(service = new RtkPostService()): void {
  const observationReads = new Map<number, AbortController>()
  ipcMain.handle('rtkpost-cancel-observation-read', (event) => {
    observationReads.get(event.sender.id)?.abort()
    observationReads.delete(event.sender.id)
  })
  ipcMain.handle(
    'rtkpost-observation-spans',
    async (
      event,
      request: { roverPath?: unknown; basePath?: unknown },
    ): Promise<RtkPostObservationSpans> => {
      observationReads.get(event.sender.id)?.abort()
      if (!request || typeof request.roverPath !== 'string' || !request.roverPath.trim())
        throw new Error('Rover observation path is required')
      if (request.basePath !== undefined && typeof request.basePath !== 'string')
        throw new Error('Base observation path is invalid')
      const controller = new AbortController()
      observationReads.set(event.sender.id, controller)
      const stop = () => controller.abort()
      event.sender.once('destroyed', stop)
      const read = async (filePath: string, label: string) => {
        try {
          return (await readRinexObservationSpan(filePath, controller.signal)) ?? null
        } catch (error) {
          if (controller.signal.aborted) throw error
          throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      try {
        const [rover, base] = await Promise.all([
          read(request.roverPath.trim(), 'Rover OBS'),
          request.basePath?.trim()
            ? read(request.basePath.trim(), 'Base OBS')
            : Promise.resolve(null),
        ])
        return { rover, base }
      } catch (error) {
        controller.abort()
        throw error
      } finally {
        event.sender.removeListener('destroyed', stop)
        if (observationReads.get(event.sender.id) === controller)
          observationReads.delete(event.sender.id)
      }
    },
  )
  ipcMain.handle('gnss-solver-status', (event) => gnssSolverTasks.status(event.sender.id))
  ipcMain.handle('rtkpost-read-config', async (_event, filePath: unknown) => {
    return service.readConfig(typeof filePath === 'string' ? filePath : '')
  })
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
