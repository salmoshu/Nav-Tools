import { BrowserWindow, dialog, ipcMain } from 'electron'
import * as path from 'node:path'
import type {
  RtkPostObservationSpans,
  RtkPostRunRequest,
  RtkPostSaveConfigRequest,
} from '../../src/core/gnsslib/RtkPost'
import { parseStarRtkConfig } from '../../src/core/gnsslib/StarRtkConfig'
import { chooseOpenDirectory, showScopedSaveDialog } from './dialogs'
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
  ipcMain.handle('starrtk-read-config', async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || !filePath.trim())
      throw new Error('请选择 StarRTK YAML 文件')
    const config = parseStarRtkConfig(await service.readConfig(filePath))
    const directory = path.dirname(path.resolve(filePath))
    const resolveFile = (value: string) => (value ? path.resolve(directory, value) : '')
    config.processing.trace_directory = resolveFile(config.processing.trace_directory)
    if (config.post) {
      for (const key of [
        'base_observations',
        'rover_observations',
        'navigation',
        'solution_file',
      ] as const) {
        const value = config.post[key]
        if (value !== undefined) config.post[key] = resolveFile(value)
      }
    }
    if (config.realtime) {
      if (config.realtime.solution_file !== undefined) {
        config.realtime.solution_file = resolveFile(config.realtime.solution_file)
      }
      for (const stream of [config.realtime.rover, config.realtime.base]) {
        if (stream?.type !== 'file') continue
        const [file, ...flags] = stream.path.split('::')
        stream.path = [resolveFile(file), ...flags].join('::')
      }
    }
    return config
  })
  ipcMain.handle('starrtk-choose-trace-directory', async (event) => {
    const target = BrowserWindow.fromWebContents(event.sender)
    return chooseOpenDirectory(target, 'starrtk-trace-directory')
  })
  ipcMain.handle('rtkpost-save-config', async (event, request: RtkPostSaveConfigRequest) => {
    if (!request || typeof request.content !== 'string' || !Array.isArray(request.protectedPaths)) {
      throw new Error('配置文件保存请求无效')
    }
    const target = BrowserWindow.fromWebContents(event.sender)
    const yaml = request.format === 'yaml'
    if (yaml) parseStarRtkConfig(request.content)
    const result = await showScopedSaveDialog(
      target,
      yaml ? 'starrtk-config' : 'gnssraw-rtkpost-config',
      {
        title: yaml ? '保存 StarRTK 配置文件' : '保存后处理配置文件',
        defaultPath:
          typeof request.defaultPath === 'string'
            ? request.defaultPath
            : yaml
              ? 'starrtk.yaml'
              : 'rtkpost.conf',
        filters: [
          yaml
            ? { name: 'StarRTK YAML', extensions: ['yaml', 'yml'] }
            : { name: 'RTKLIB 配置文件', extensions: ['conf'] },
        ],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      },
    )
    if (result.canceled || !result.filePath) return null
    const exists = await service.inspectConfigTarget(result.filePath, request.protectedPaths)
    if (exists) {
      const options = {
        type: 'warning' as const,
        title: '覆盖配置文件',
        message: '所选配置文件已存在，是否覆盖？',
        detail: result.filePath,
        buttons: ['取消', '覆盖'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      }
      const confirmation = target
        ? await dialog.showMessageBox(target, options)
        : await dialog.showMessageBox(options)
      if (confirmation.response !== 1) return null
    }
    await service.writeConfig(result.filePath, request.content, request.protectedPaths, exists)
    return result.filePath
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
