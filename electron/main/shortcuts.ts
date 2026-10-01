import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getPanelById } from '../../src/core/panels/registry'

/** 桌面快捷方式的启动参数格式: --open-component=<面板目录 id> */
const OPEN_COMPONENT_PREFIX = '--open-component='

/** 从进程参数(含可执行文件路径与 Electron 开关)中解析目标组件 id */
export function parseOpenComponentArg(argv: readonly string[]): string | undefined {
  for (const arg of argv) {
    if (arg.startsWith(OPEN_COMPONENT_PREFIX)) {
      const value = arg.slice(OPEN_COMPONENT_PREFIX.length)
      if (value && getPanelById(value)) return value
    }
  }
  return undefined
}

/** 为桌面快捷方式生成 exe 启动参数 */
export function buildOpenComponentArg(windowId: string): string {
  return `${OPEN_COMPONENT_PREFIX}${windowId}`
}

/** 把 PNG data URL 封装成单帧 PNG-compressed ICO(Vista+ 支持)并落盘 */
export async function writeIcoFromPngDataUrl(dataUrl: string, icoPath: string): Promise<void> {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const png = Buffer.from(base64, 'base64')
  if (png.length === 0) throw new Error('图标数据为空')

  // ICONDIR: reserved(0) + type(1=icon) + count(1)
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  // ICONDIRENTRY: 256 用 0 表示;数据从 22 字节处开始
  const entry = Buffer.alloc(16)
  entry.writeUInt8(0, 0)
  entry.writeUInt8(0, 1)
  entry.writeUInt8(0, 2)
  entry.writeUInt8(0, 3)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(22, 12)

  await fs.mkdir(path.dirname(icoPath), { recursive: true })
  await fs.writeFile(icoPath, Buffer.concat([header, entry, png]))
}

interface ShortcutRequest {
  windowId: string
  name: string
  iconDataUrl: string
}

export interface ShortcutResult {
  ok: boolean
  shortcutPath?: string
  error?: string
}

/**
 * 在桌面创建组件快捷方式:.lnk 指向当前可执行文件,带 --open-component 启动参数,
 * 图标用渲染端合成的「主图标 + 组件角标」ICO(存 userData,同名覆盖)。
 */
export async function createDesktopShortcut(
  request: ShortcutRequest,
  options: { desktopPath: string; execPath: string; userDataPath: string },
): Promise<ShortcutResult> {
  const panel = getPanelById(request.windowId)
  if (!panel) return { ok: false, error: '未知的组件' }
  const safeName = (request.name || panel.id).replace(/[\\/:*?"<>|]/g, ' ').trim() || panel.id
  const shortcutPath = path.join(options.desktopPath, `Nav-Tools ${safeName}.lnk`)

  try {
    const icoPath = path.join(options.userDataPath, 'shortcuts', `${panel.id}.ico`)
    await writeIcoFromPngDataUrl(request.iconDataUrl, icoPath)

    // PowerShell 的 WScript.Shell COM 是 Windows 建快捷方式的标准途径;
    // 路径可能含空格与中文,用单引号包裹并把内部单引号翻倍转义
    const ps = [
      "$ws = New-Object -ComObject WScript.Shell",
      `$s = $ws.CreateShortcut('${psEscape(shortcutPath)}')`,
      `$s.TargetPath = '${psEscape(options.execPath)}'`,
      `$s.Arguments = '${psEscape(buildOpenComponentArg(panel.id))}'`,
      `$s.WorkingDirectory = '${psEscape(path.dirname(options.execPath))}'`,
      `$s.IconLocation = '${psEscape(icoPath)}'`,
      '$s.Save()',
    ].join('\n')
    await runPowerShell(ps)
    return { ok: true, shortcutPath }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function psEscape(value: string): string {
  return value.replace(/'/g, "''")
}

function runPowerShell(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 15_000 },
      (error, _stdout, stderr) => {
        if (error) reject(new Error(stderr || error.message))
        else resolve()
      },
    )
  })
}
