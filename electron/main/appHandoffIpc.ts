import { app, ipcMain } from 'electron'
import path from 'node:path'
import { AppHandoffSnapshotService } from './services/AppHandoffSnapshotService'

export function registerAppHandoffIpc(
  service = new AppHandoffSnapshotService(path.join(app.getPath('userData'), 'handoffs')),
): void {
  ipcMain.handle('app-handoff-create-solution-snapshot', (_event, request: unknown) =>
    service.createSolutionSnapshot(request),
  )
  ipcMain.handle('app-handoff-register-artifact', (_event, artifact: unknown) =>
    service.registerArtifact(artifact),
  )
  ipcMain.handle('app-handoff-create-rinex-artifact', (_event, request: unknown) =>
    service.createRinexArtifact(request),
  )
}
