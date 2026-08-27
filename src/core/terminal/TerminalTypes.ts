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
}

export interface TerminalStatusEvent {
  session: TerminalSessionInfo
  message?: string
  exitCode?: number
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
