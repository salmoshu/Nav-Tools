import {
  BrowserWindow,
  dialog,
  type OpenDialogOptions,
  type OpenDialogReturnValue,
  type SaveDialogOptions,
  type SaveDialogReturnValue,
} from 'electron'
import path from 'node:path'
import fs from 'node:fs'

/**
 * 文件对话框目录的「按模块记忆」:每个 scope(如 camera-script/data-access-file/
 * terminal-upload)各自记住上次选择所在目录,互不影响。
 */
const dirMemory = new Map<string, string>()

function seedOptions<T extends { defaultPath?: string }>(
  scope: string | undefined,
  options: T,
  asFile: boolean,
): T {
  const dir = scope ? dirMemory.get(scope) : undefined
  if (!dir || options.defaultPath) return options
  if (!asFile) return { ...options, defaultPath: dir }
  const name = path.basename(options.defaultPath ?? '')
  return { ...options, defaultPath: name ? path.join(dir, name) : dir }
}

function remember(scope: string | undefined, picked: string | undefined, asFile: boolean): void {
  if (!scope || !picked) return
  let dir = path.dirname(picked)
  try {
    if (!asFile && fs.statSync(picked).isDirectory()) dir = picked
  } catch {
    /* 文件可能已被移走: 仍按目录记忆 */
  }
  dirMemory.set(scope, dir)
}

export function showScopedOpenDialog(
  target: BrowserWindow | null,
  scope: string | undefined,
  options: OpenDialogOptions,
): Promise<OpenDialogReturnValue> {
  const final = seedOptions(scope, options, false)
  const show = () => (target ? dialog.showOpenDialog(target, final) : dialog.showOpenDialog(final))
  return show().then((result) => {
    if (!result.canceled && result.filePaths.length > 0) {
      remember(scope, result.filePaths[0], false)
    }
    return result
  })
}

export function showScopedSaveDialog(
  target: BrowserWindow | null,
  scope: string | undefined,
  options: SaveDialogOptions,
): Promise<SaveDialogReturnValue> {
  const final = seedOptions(scope, options, true)
  const show = () => (target ? dialog.showSaveDialog(target, final) : dialog.showSaveDialog(final))
  return show().then((result) => {
    if (!result.canceled && result.filePath) remember(scope, result.filePath, true)
    return result
  })
}

/** 通用「选择文件」便捷封装:返回选中路径数组,取消返回 null */
export function chooseOpenFiles(
  target: BrowserWindow | null,
  scope: string,
  options: { filters?: OpenDialogOptions['filters']; multi?: boolean },
): Promise<string[] | null> {
  return showScopedOpenDialog(target, scope, {
    filters: options.filters,
    properties: options.multi ? ['openFile', 'multiSelections'] : ['openFile'],
  }).then((result) => (result.canceled || result.filePaths.length === 0 ? null : result.filePaths))
}
