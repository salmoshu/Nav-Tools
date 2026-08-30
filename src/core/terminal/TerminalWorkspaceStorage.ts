import {
  createTerminalTab,
  findTerminalPane,
  listTerminalPanes,
  type TerminalLayoutNode,
  type TerminalTabLayout,
} from './TerminalLayout'
import type {
  LocalShellKind,
  PortForwardKind,
  PortForwardRule,
  SshAuthMethod,
  SshConnectionProfile,
  TerminalLaunchSpec,
} from './TerminalTypes'

const STORAGE_KEY = 'nav-tools:terminal-layout:v3'
const LEGACY_STORAGE_KEYS = ['nav-tools:terminal-layout:v2', 'nav-tools:terminal-layout:v1']

export interface TerminalWorkspace {
  tabs: TerminalTabLayout[]
  activeTabId: string
}

export interface TerminalRecoveryTarget {
  tabId: string
  paneId: string
  launch: TerminalLaunchSpec
}

export interface TerminalRecoveryPlan {
  tabs: TerminalTabLayout[]
  targets: TerminalRecoveryTarget[]
}

export function planTerminalRecovery(
  tabs: TerminalTabLayout[],
  liveSessionIds: ReadonlySet<string>,
): TerminalRecoveryPlan {
  const targets: TerminalRecoveryTarget[] = []
  const restoredTabs = tabs.map((tab) => {
    const reconcile = (node: TerminalLayoutNode): TerminalLayoutNode => {
      if (node.kind === 'split') {
        return { ...node, first: reconcile(node.first), second: reconcile(node.second) }
      }
      if (node.sessionId && liveSessionIds.has(node.sessionId)) return node
      const pane = node.sessionId ? { ...node, sessionId: undefined } : node
      if (pane.launch?.kind === 'local' || pane.launch?.kind === 'wsl') {
        targets.push({ tabId: tab.id, paneId: pane.id, launch: pane.launch })
      }
      return pane
    }
    return { ...tab, root: reconcile(tab.root) }
  })
  return { tabs: restoredTabs, targets }
}

export class TerminalWorkspaceStorage {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>) {}

  public load(): TerminalWorkspace {
    for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
      try {
        const parsed = JSON.parse(this.storage.getItem(key) || '') as {
          version?: number
          activeTabId?: unknown
          tabs?: unknown[]
        }
        if (![1, 2, 3].includes(parsed.version || 0) || !Array.isArray(parsed.tabs)) continue
        const tabs = parsed.tabs.flatMap((value) => {
          const tab = normalizeTab(value, parsed.version === 3)
          return tab ? [tab] : []
        })
        if (tabs.length === 0) continue
        const activeTabId =
          typeof parsed.activeTabId === 'string' &&
          tabs.some((tab) => tab.id === parsed.activeTabId)
            ? parsed.activeTabId
            : tabs[0].id
        return { tabs, activeTabId }
      } catch {
        // Try older storage versions before creating a fresh workspace.
      }
    }
    const tab = createTerminalTab('Terminal')
    return { tabs: [tab], activeTabId: tab.id }
  }

  public save(workspace: TerminalWorkspace): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, ...workspace }))
  }
}

function normalizeTab(value: unknown, allowLaunch: boolean): TerminalTabLayout | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<TerminalTabLayout>
  const root = normalizeLayoutNode(record.root, allowLaunch)
  if (!root || typeof record.id !== 'string') return null
  const panes = listTerminalPanes(root)
  return {
    id: record.id,
    title: typeof record.title === 'string' && record.title ? record.title : 'Terminal',
    root,
    focusedPaneId:
      typeof record.focusedPaneId === 'string' && findTerminalPane(root, record.focusedPaneId)
        ? record.focusedPaneId
        : panes[0]?.id,
  }
}

function normalizeLayoutNode(value: unknown, allowLaunch: boolean): TerminalLayoutNode | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (record.kind === 'pane') {
    if (typeof record.id !== 'string') return null
    return {
      kind: 'pane',
      id: record.id,
      title: typeof record.title === 'string' ? record.title : 'Terminal',
      sessionId: typeof record.sessionId === 'string' ? record.sessionId : undefined,
      launch: allowLaunch ? normalizeLaunchSpec(record.launch) : undefined,
      presentation: record.presentation === 'gui' ? 'gui' : undefined,
    }
  }
  if (record.kind !== 'split' || typeof record.id !== 'string') return null
  const first = normalizeLayoutNode(record.first, allowLaunch)
  const second = normalizeLayoutNode(record.second, allowLaunch)
  if (!first || !second) return null
  const ratio =
    typeof record.ratio === 'number' && Number.isFinite(record.ratio) ? record.ratio : 0.5
  return {
    kind: 'split',
    id: record.id,
    direction: record.direction === 'vertical' ? 'vertical' : 'horizontal',
    ratio: Math.min(0.95, Math.max(0.05, ratio)),
    first,
    second,
  }
}

function normalizeLaunchSpec(value: unknown): TerminalLaunchSpec | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const cwd = optionalString(record.cwd)
  const label = optionalString(record.label)
  if (record.kind === 'local' && isLocalShellKind(record.localShell)) {
    return { kind: 'local', localShell: record.localShell, cwd, label }
  }
  if (record.kind === 'wsl') {
    const wslDistro = optionalString(record.wslDistro)
    return wslDistro ? { kind: 'wsl', wslDistro, cwd, label } : undefined
  }
  if (record.kind === 'ssh') {
    const sshProfile = normalizeSshProfile(record.sshProfile)
    return { kind: 'ssh', sshProfile, label }
  }
  return undefined
}

function normalizeSshProfile(value: unknown): SshConnectionProfile | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const id = optionalString(record.id)
  const name = optionalString(record.name)
  const host = optionalString(record.host)
  const username = optionalString(record.username)
  const port = Number(record.port)
  if (!id || !name || !host || !username || !Number.isInteger(port) || port < 1 || port > 65535) {
    return undefined
  }
  const authMethod: SshAuthMethod = isSshAuthMethod(record.authMethod) ? record.authMethod : 'agent'
  const forwards = Array.isArray(record.forwards)
    ? record.forwards.flatMap((rule) => {
        const normalized = normalizeForwardRule(rule)
        return normalized ? [normalized] : []
      })
    : []
  return {
    id,
    name,
    source: record.source === 'ssh-config' ? 'ssh-config' : 'nav-tools',
    host,
    port,
    username,
    authMethod,
    privateKeyPath: optionalString(record.privateKeyPath) || '',
    proxyJump: optionalString(record.proxyJump) || '',
    initialDirectory: optionalString(record.initialDirectory) || '',
    forwards,
  }
}

function normalizeForwardRule(value: unknown): PortForwardRule | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const id = optionalString(record.id)
  const kind = record.kind
  const bindPort = Number(record.bindPort)
  const targetPort = Number(record.targetPort)
  if (
    !id ||
    !isPortForwardKind(kind) ||
    !Number.isInteger(bindPort) ||
    !Number.isInteger(targetPort)
  ) {
    return undefined
  }
  return {
    id,
    kind,
    name: optionalString(record.name) || '',
    enabled: record.enabled !== false,
    bindAddress: optionalString(record.bindAddress) || '127.0.0.1',
    bindPort,
    targetHost: optionalString(record.targetHost) || '',
    targetPort,
  }
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized || undefined
}

function isLocalShellKind(value: unknown): value is LocalShellKind {
  return ['powershell', 'cmd', 'git-bash', 'system'].includes(String(value))
}

function isSshAuthMethod(value: unknown): value is SshAuthMethod {
  return ['password', 'private-key', 'agent'].includes(String(value))
}

function isPortForwardKind(value: unknown): value is PortForwardKind {
  return ['local', 'remote', 'dynamic'].includes(String(value))
}
