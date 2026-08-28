export type TerminalSessionKind = 'local' | 'wsl' | 'ssh'
export type LocalShellKind = 'powershell' | 'cmd' | 'git-bash' | 'system'
export type SshAuthMethod = 'password' | 'private-key' | 'agent'
export type PortForwardKind = 'local' | 'remote' | 'dynamic'

export interface PortForwardRule {
  id: string
  name: string
  kind: PortForwardKind
  enabled: boolean
  bindAddress: string
  bindPort: number
  targetHost: string
  targetPort: number
}

export interface SshConnectionProfile {
  id: string
  name: string
  source: 'nav-tools' | 'ssh-config'
  host: string
  port: number
  username: string
  authMethod: SshAuthMethod
  privateKeyPath: string
  proxyJump: string
  initialDirectory: string
  forwards: PortForwardRule[]
}

export interface SshConnectionSecrets {
  password?: string
  passphrase?: string
}

export type TerminalLaunchSpec =
  | {
      kind: 'local'
      localShell: LocalShellKind
      cwd?: string
      label?: string
    }
  | {
      kind: 'wsl'
      wslDistro: string
      cwd?: string
      label?: string
    }
  | {
      kind: 'ssh'
      sshProfile?: SshConnectionProfile
      label?: string
    }

export interface TerminalCreateRequest {
  requestId?: string
  kind: TerminalSessionKind
  cols: number
  rows: number
  cwd?: string
  localShell?: LocalShellKind
  wslDistro?: string
  sshProfile?: SshConnectionProfile
  sshSecrets?: SshConnectionSecrets
}

export interface TerminalSessionInfo {
  id: string
  kind: TerminalSessionKind
  title: string
  status: 'connecting' | 'ready' | 'closed' | 'error'
  sshConnectionId?: string
  profileId?: string
  scrollback?: string
  /** 运行时捕获的当前工作目录(经 OSC 7 / OSC 9;9 上报,可能为空) */
  cwd?: string
}

export interface TerminalCapabilities {
  platform: string
  localShells: Array<{ kind: LocalShellKind; label: string; executable: string }>
  wslDistros: string[]
  sshAvailable: boolean
}

export interface TerminalOutputEvent {
  sessionId: string
  data: string
  /** false 表示输入回显(紧随用户输入),不应驱动 tab 活动动画;缺省/true 为真实输出 */
  activity?: boolean
}

export interface TerminalStatusEvent {
  session: TerminalSessionInfo
  message?: string
  exitCode?: number
}

/** 主进程捕获到会话 cwd 变化时广播('terminal-cwd') */
export interface TerminalCwdEvent {
  sessionId: string
  cwd: string
}

/**
 * 渲染层内部事件(useMitt):同一 tab 内某个 SSH 会话上线,
 * 通知其他使用相同连接参数的断开 pane 静默重连。
 */
export const TERMINAL_SSH_RECOVERED_EVENT = 'terminal-ssh-recovered'

export interface TerminalSshRecoveredEvent {
  key: string
  sourcePaneId: string
}

/** SSH 连接身份:同一 tab 下相同连接参数的 pane 共享登录状态 */
export function sshConnectionKey(profile: SshConnectionProfile): string {
  return [
    profile.host.toLowerCase(),
    profile.port,
    profile.username,
    profile.authMethod,
    profile.privateKeyPath,
    profile.proxyJump,
  ].join('|')
}

export interface HostKeyPromptEvent {
  requestId: string
  host: string
  port: number
  fingerprint: string
}

export interface HostKeyMismatchEvent {
  host: string
  port: number
  expected: string
  actual: string
}

export interface SftpEntry {
  name: string
  path: string
  directory: boolean
  size: number
  modifiedAt: number
  mode: number
}

export interface SftpTransferEvent {
  sessionId: string
  operationId: string
  direction: 'upload' | 'download'
  name: string
  transferred: number
  total: number
  status: 'running' | 'success' | 'error'
  error?: string
}

export interface PortForwardStatusEvent {
  sessionId: string
  ruleId: string
  status: 'starting' | 'active' | 'stopped' | 'error'
  message?: string
  boundPort?: number
}

export function createPortForwardRule(kind: PortForwardKind = 'local'): PortForwardRule {
  return {
    id: createTerminalId('forward'),
    name: '',
    kind,
    enabled: true,
    bindAddress: '127.0.0.1',
    bindPort: 0,
    targetHost: kind === 'remote' ? '127.0.0.1' : '',
    targetPort: 0,
  }
}

export function createTerminalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}
