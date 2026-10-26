import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  chooseOpenDirectory,
  chooseOpenFiles,
  configureDialogDirectoryMemory,
  showScopedSaveDialog,
} from '../../electron/main/dialogs'

const dialogHarness = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: {
    showOpenDialog: dialogHarness.open,
    showSaveDialog: dialogHarness.save,
  },
}))

let userDataDir = ''

beforeEach(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'navtools-dialog-scopes-'))
  dialogHarness.open.mockReset()
  dialogHarness.save.mockReset()
  dialogHarness.open.mockResolvedValue({ canceled: true, filePaths: [] })
  dialogHarness.save.mockResolvedValue({ canceled: true })
  configureDialogDirectoryMemory(userDataDir)
})

afterEach(async () => {
  await fs.rm(userDataDir, { recursive: true, force: true })
})

async function pickFile(scope: string, localPath: string): Promise<void> {
  dialogHarness.open.mockResolvedValueOnce({ canceled: false, filePaths: [localPath] })
  await chooseOpenFiles(null, scope, {})
}

function lastOpenOptions(): { defaultPath?: string } {
  return dialogHarness.open.mock.calls.at(-1)?.[0] ?? {}
}

function lastSaveOptions(): { defaultPath?: string } {
  return dialogHarness.save.mock.calls.at(-1)?.[0] ?? {}
}

describe('文件对话框按模块持久化目录', () => {
  it('IAP、数据接入、相机脚本与终端下载各自记忆，并在重启后保留', async () => {
    const scopes = {
      'iap-firmware': path.join(userDataDir, 'firmware'),
      'data-access-file': path.join(userDataDir, 'logs'),
      'camera-script': path.join(userDataDir, 'scripts'),
      'terminal-download': path.join(userDataDir, 'downloads'),
    }
    for (const [scope, directory] of Object.entries(scopes)) {
      await pickFile(scope, path.join(directory, 'selected.bin'))
    }

    for (const [scope, directory] of Object.entries(scopes)) {
      await chooseOpenFiles(null, scope, {})
      expect(lastOpenOptions().defaultPath).toBe(directory)
    }

    configureDialogDirectoryMemory(userDataDir)
    for (const [scope, directory] of Object.entries(scopes)) {
      await chooseOpenFiles(null, scope, {})
      expect(lastOpenOptions().defaultPath).toBe(directory)
    }
  })

  it('保存对话框沿用模块目录但保留建议文件名', async () => {
    const downloadDir = path.join(userDataDir, 'downloads')
    dialogHarness.save.mockResolvedValueOnce({
      canceled: false,
      filePath: path.join(downloadDir, 'first.bin'),
    })
    await showScopedSaveDialog(null, 'terminal-download', { defaultPath: 'first.bin' })

    await showScopedSaveDialog(null, 'terminal-download', { defaultPath: 'second.bin' })
    expect(lastSaveOptions().defaultPath).toBe(path.join(downloadDir, 'second.bin'))

    configureDialogDirectoryMemory(userDataDir)
    await showScopedSaveDialog(null, 'terminal-download', { defaultPath: 'third.bin' })
    expect(lastSaveOptions().defaultPath).toBe(path.join(downloadDir, 'third.bin'))
  })

  it('目录选择记忆目录本身，取消选择不会覆盖记忆', async () => {
    const target = path.join(userDataDir, 'chosen-directory')
    await fs.mkdir(target)
    dialogHarness.open.mockResolvedValueOnce({ canceled: false, filePaths: [target] })

    await expect(chooseOpenDirectory(null, 'terminal-download')).resolves.toBe(target)
    await expect(chooseOpenDirectory(null, 'terminal-download')).resolves.toBeNull()
    expect(lastOpenOptions().defaultPath).toBe(target)
  })

  it('损坏的持久化文件不会阻断对话框或写入后续记忆', async () => {
    await fs.writeFile(path.join(userDataDir, 'file-dialog-directories.json'), '{broken')
    expect(() => configureDialogDirectoryMemory(userDataDir)).not.toThrow()

    await chooseOpenFiles(null, 'camera-script', {})
    expect(lastOpenOptions().defaultPath).toBeUndefined()

    const directory = path.join(userDataDir, 'new-scripts')
    await pickFile('camera-script', path.join(directory, 'check.sh'))
    configureDialogDirectoryMemory(userDataDir)
    await chooseOpenFiles(null, 'camera-script', {})
    expect(lastOpenOptions().defaultPath).toBe(directory)
  })

  it('持久化写入失败也不会让本次文件选择失败', async () => {
    await fs.mkdir(path.join(userDataDir, 'file-dialog-directories.json'))
    configureDialogDirectoryMemory(userDataDir)
    const selected = path.join(userDataDir, 'readonly', 'check.sh')

    await expect(pickFile('camera-script', selected)).resolves.toBeUndefined()
  })

  it('应用启动时初始化存储，日志录制使用独立作用域', () => {
    const source = readFileSync('electron/main/index.ts', 'utf8')
    expect(source).toContain("configureDialogDirectoryMemory(app.getPath('userData'))")
    expect(source).toContain("showScopedSaveDialog(targetWindow, 'data-access-log-recording'")
  })
})
