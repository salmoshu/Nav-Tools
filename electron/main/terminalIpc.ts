import path from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type {
  PortForwardRule,
  SshConnectionProfile,
  SshConnectionSecrets,
  TerminalCreateRequest,
} from '../../src/core/terminal/TerminalTypes'
import type { TerminalCredentialService } from './services/TerminalCredentialService'
import type { TerminalService } from './services/TerminalService'

export function registerTerminalIpc(
  service: TerminalService,
  credentials: TerminalCredentialService,
): void {
  ipcMain.handle('terminal-capabilities', () => service.getCapabilities())
  ipcMain.handle('terminal-session-list', () => service.listSessions())
  ipcMain.handle('terminal-session-attach', (_event, sessionId: string) =>
    service.attach(sessionId),
  )
  ipcMain.handle('terminal-session-create', (_event, request: TerminalCreateRequest) =>
    service.create(request),
  )
  ipcMain.handle('terminal-session-create-cancel', (_event, requestId: string) =>
    service.cancelCreate(requestId),
  )
  ipcMain.handle(
    'terminal-session-clone',
    (_event, request: { sessionId: string; cols: number; rows: number }) =>
      service.clone(request.sessionId, request.cols, request.rows),
  )
  ipcMain.handle('terminal-session-write', (_event, request: { sessionId: string; data: string }) =>
    service.write(request.sessionId, request.data),
  )
  ipcMain.handle(
    'terminal-session-resize',
    (_event, request: { sessionId: string; cols: number; rows: number }) =>
      service.resize(request.sessionId, request.cols, request.rows),
  )
  ipcMain.handle('terminal-session-close', (_event, sessionId: string) => service.close(sessionId))
  ipcMain.handle('terminal-session-close-all', () => service.closeAll())
  ipcMain.handle(
    'terminal-host-key-response',
    (_event, request: { requestId: string; accepted: boolean }) =>
      service.respondToHostKey(request.requestId, request.accepted),
  )
  ipcMain.handle('terminal-ssh-config-list', () => service.listSshConfigProfiles())
  ipcMain.handle('terminal-credential-load', (_event, profileId: string) =>
    credentials.load(profileId),
  )
  ipcMain.handle(
    'terminal-credential-save',
    (_event, request: { profileId: string; secrets: SshConnectionSecrets }) =>
      credentials.save(request.profileId, request.secrets),
  )
  ipcMain.handle('terminal-credential-remove', (_event, profileId: string) =>
    credentials.remove(profileId),
  )

  ipcMain.handle('terminal-sftp-list', (_event, request: { sessionId: string; path: string }) =>
    service.listSftp(request.sessionId, request.path),
  )
  ipcMain.handle('terminal-sftp-stat', (_event, request: { sessionId: string; path: string }) =>
    service.sftpStat(request.sessionId, request.path),
  )
  ipcMain.handle('terminal-sftp-mkdir', (_event, request: { sessionId: string; path: string }) =>
    service.sftpMkdir(request.sessionId, request.path),
  )
  ipcMain.handle(
    'terminal-sftp-rename',
    (_event, request: { sessionId: string; oldPath: string; newPath: string }) =>
      service.sftpRename(request.sessionId, request.oldPath, request.newPath),
  )
  ipcMain.handle('terminal-sftp-remove', (_event, request: { sessionId: string; path: string }) =>
    service.sftpRemove(request.sessionId, request.path),
  )
  ipcMain.handle('terminal-sftp-choose-upload', async (event) => {
    const target = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(target ?? undefined, {
      properties: ['openFile', 'multiSelections'],
    })
    return result.canceled ? [] : result.filePaths
  })
  ipcMain.handle(
    'terminal-sftp-upload',
    (_event, request: { sessionId: string; localPaths: string[]; remoteDirectory: string }) =>
      service.sftpUpload(request.sessionId, request.localPaths, request.remoteDirectory),
  )
  ipcMain.handle(
    'terminal-sftp-choose-download',
    async (event, request: { name: string; directory: boolean }) => {
      const target = BrowserWindow.fromWebContents(event.sender)
      if (request.directory) {
        const result = await dialog.showOpenDialog(target ?? undefined, {
          properties: ['openDirectory'],
        })
        return result.canceled || !result.filePaths[0]
          ? null
          : path.join(result.filePaths[0], request.name)
      }
      const result = await dialog.showSaveDialog(target ?? undefined, { defaultPath: request.name })
      return result.canceled ? null : result.filePath
    },
  )
  ipcMain.handle(
    'terminal-sftp-download',
    (_event, request: { sessionId: string; remotePath: string; localPath: string }) =>
      service.sftpDownload(request.sessionId, request.remotePath, request.localPath),
  )

  ipcMain.handle(
    'terminal-forward-start',
    (_event, request: { sessionId: string; rule: PortForwardRule }) =>
      service.startForward(request.sessionId, request.rule),
  )
  ipcMain.handle(
    'terminal-forward-stop',
    (_event, request: { sessionId: string; ruleId: string }) =>
      service.stopForward(request.sessionId, request.ruleId),
  )

  ipcMain.handle('terminal-private-key-select', async (event) => {
    const target = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(target ?? undefined, {
      properties: ['openFile'],
      filters: [{ name: 'SSH Private Key', extensions: ['pem', 'key', 'ppk', '*'] }],
    })
    return result.canceled ? null : result.filePaths[0]
  })
}

// Compile-time assertion that renderer and main share the same profile shape.
void ({} as SshConnectionProfile)
