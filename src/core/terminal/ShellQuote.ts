/**
 * 按目标 shell 语义拼接/转义命令片段(纯函数,可单测)。
 *
 * 文件树的「在终端打开」与预设命令都会把用户可控文本(路径、参数)写进
 * 会话输入,必须按 shell 家族转义,否则一个带空格或引号的路径就能截断命令。
 * 转义在「写入会话前」统一做,不散落在 UI 层。
 *
 * 家族划分:
 * - posix:bash / zsh / git-bash / WSL / SSH 远端(默认 POSIX shell)
 * - powershell:单引号字符串,内嵌单引号翻倍
 * - cmd:双引号包裹;cmd 没有真正的转义机制,带引号的路径属于病态输入
 */

import type { LocalShellKind, TerminalSessionKind } from './TerminalTypes'

export type ShellFamily = 'posix' | 'powershell' | 'cmd'

export function shellFamilyFor(
  sessionKind: TerminalSessionKind,
  localShell?: LocalShellKind,
): ShellFamily {
  if (sessionKind === 'ssh' || sessionKind === 'wsl') return 'posix'
  if (localShell === 'cmd') return 'cmd'
  if (localShell === 'git-bash') return 'posix'
  // powershell 与 system(跟随系统默认,Windows 上即 PowerShell)同族
  return 'powershell'
}

/** 把一个参数转义成目标 shell 里的安全单词 */
export function quoteShellArg(text: string, family: ShellFamily): string {
  if (family === 'cmd') return `"${text.replace(/"/g, '')}"`
  if (family === 'posix') return `'${text.replace(/'/g, `'\\''`)}'`
  return `'${text.replace(/'/g, "''")}'`
}

/** 生成进入目录的命令;cmd 需要跨盘符所以要 /d */
export function buildShellCdCommand(dir: string, family: ShellFamily): string {
  if (family === 'cmd') return `cd /d ${quoteShellArg(dir, family)}`
  return `cd ${quoteShellArg(dir, family)}`
}

/** 用家族语义连接多条命令:POSIX/PowerShell 用 `;`,cmd 用 `&&` */
export function joinShellCommands(commands: string[], family: ShellFamily): string {
  const separator = family === 'cmd' ? ' && ' : '; '
  return commands.filter(Boolean).join(separator)
}

/** 组装「先 cd 再执行」的完整命令行;preset.cwd 为空时只返回命令本身 */
export function buildShellCommand(
  command: string,
  cwd: string | undefined,
  family: ShellFamily,
): string {
  const trimmed = command.trim()
  if (!trimmed) return ''
  if (!cwd?.trim()) return trimmed
  return joinShellCommands([buildShellCdCommand(cwd.trim(), family), trimmed], family)
}
