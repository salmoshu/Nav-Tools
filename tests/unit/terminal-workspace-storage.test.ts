import { beforeEach, describe, expect, it } from 'vitest'
import { createTerminalTab, findTerminalPane } from '@/core/terminal/TerminalLayout'
import {
  planTerminalRecovery,
  TerminalWorkspaceStorage,
} from '@/core/terminal/TerminalWorkspaceStorage'

describe('TerminalWorkspaceStorage', () => {
  beforeEach(() => localStorage.clear())

  it('restores the active tab, split layout, and PowerShell launch type after restart', () => {
    const storage = new TerminalWorkspaceStorage(localStorage)
    const tab = createTerminalTab('PowerShell')
    if (tab.root.kind !== 'pane') throw new Error('Expected a pane')
    tab.root.sessionId = 'process-owned-session-id'
    tab.root.launch = {
      kind: 'local',
      localShell: 'powershell',
      cwd: 'D:\\robot',
      label: 'PowerShell',
    }

    storage.save({ tabs: [tab], activeTabId: tab.id })
    const restored = storage.load()
    const pane = findTerminalPane(restored.tabs[0].root, tab.root.id)

    expect(restored.activeTabId).toBe(tab.id)
    expect(pane?.sessionId).toBe('process-owned-session-id')
    expect(pane?.launch).toEqual({
      kind: 'local',
      localShell: 'powershell',
      cwd: 'D:\\robot',
      label: 'PowerShell',
    })
  })

  it('migrates a v2 layout without trusting malformed launch metadata', () => {
    localStorage.setItem(
      'nav-tools:terminal-layout:v2',
      JSON.stringify({
        version: 2,
        tabs: [
          {
            id: 'legacy-tab',
            title: 'Terminal',
            focusedPaneId: 'legacy-pane',
            root: {
              kind: 'pane',
              id: 'legacy-pane',
              title: 'PowerShell',
              sessionId: 'old-session',
              launch: { kind: 'local', localShell: 'not-a-shell' },
            },
          },
        ],
      }),
    )

    const restored = new TerminalWorkspaceStorage(localStorage).load()

    expect(restored.tabs).toHaveLength(1)
    expect(findTerminalPane(restored.tabs[0].root, 'legacy-pane')?.launch).toBeUndefined()
  })

  it('persists the per-pane GUI presentation and drops malformed values', () => {
    const storage = new TerminalWorkspaceStorage(localStorage)
    const tab = createTerminalTab('Terminal')
    if (tab.root.kind !== 'pane') throw new Error('Expected a pane')
    tab.root.presentation = 'gui'

    storage.save({ tabs: [tab], activeTabId: tab.id })
    const restored = storage.load()

    expect(findTerminalPane(restored.tabs[0].root, tab.root.id)?.presentation).toBe('gui')
  })

  it('defaults missing or malformed presentation to the terminal view', () => {
    localStorage.setItem(
      'nav-tools:terminal-layout:v3',
      JSON.stringify({
        version: 3,
        tabs: [
          {
            id: 'tab',
            title: 'Terminal',
            focusedPaneId: 'pane-a',
            root: {
              kind: 'split',
              id: 'split',
              direction: 'horizontal',
              ratio: 0.5,
              first: { kind: 'pane', id: 'pane-a', title: 'A', presentation: 'gui' },
              second: { kind: 'pane', id: 'pane-b', title: 'B', presentation: 'side' },
            },
          },
        ],
      }),
    )

    const restored = new TerminalWorkspaceStorage(localStorage).load()

    expect(findTerminalPane(restored.tabs[0].root, 'pane-a')?.presentation).toBe('gui')
    expect(findTerminalPane(restored.tabs[0].root, 'pane-b')?.presentation).toBeUndefined()
  })

  it('plans recreation of a missing local process while preserving its pane and layout', () => {
    const tab = createTerminalTab('PowerShell')
    if (tab.root.kind !== 'pane') throw new Error('Expected a pane')
    tab.root.sessionId = 'stale-after-app-restart'
    tab.root.launch = {
      kind: 'local',
      localShell: 'powershell',
      label: 'PowerShell',
    }

    const plan = planTerminalRecovery([tab], new Set())
    const pane = findTerminalPane(plan.tabs[0].root, tab.root.id)

    expect(pane?.sessionId).toBeUndefined()
    expect(pane?.launch?.kind).toBe('local')
    expect(plan.targets).toEqual([{ tabId: tab.id, paneId: tab.root.id, launch: tab.root.launch }])
  })

  it('keeps a disconnected SSH profile for manual reconnect without persisting credentials', () => {
    const tab = createTerminalTab('Robot')
    if (tab.root.kind !== 'pane') throw new Error('Expected a pane')
    tab.root.sessionId = 'stale-ssh-session'
    tab.root.launch = {
      kind: 'ssh',
      label: 'Robot',
      sshProfile: {
        id: 'robot',
        name: 'Robot',
        source: 'nav-tools',
        host: '192.0.2.20',
        port: 22,
        username: 'root',
        authMethod: 'password',
        privateKeyPath: '',
        proxyJump: '',
        initialDirectory: '',
        forwards: [],
      },
    }

    const plan = planTerminalRecovery([tab], new Set())
    const pane = findTerminalPane(plan.tabs[0].root, tab.root.id)

    expect(pane?.sessionId).toBeUndefined()
    expect(pane?.launch?.kind).toBe('ssh')
    expect(plan.targets).toEqual([])
    expect(JSON.stringify(plan.tabs)).not.toContain('password":')
  })
})
