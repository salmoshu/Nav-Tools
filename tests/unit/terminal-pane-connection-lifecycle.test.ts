/* eslint-disable vue/one-component-per-file, vue/require-default-prop */
import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyPane } from '@/core/terminal/TerminalLayout'
import { createSshProfile } from '@/core/terminal/TerminalProfileStorage'
import type { TerminalSessionInfo } from '@/core/terminal/TerminalTypes'

const xtermHarness = vi.hoisted(() => ({
  keyHandler: undefined as ((event: KeyboardEvent) => boolean) | undefined,
  paste: vi.fn(),
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80
    rows = 24
    loadAddon() {}
    open() {}
    onData() {}
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
      xtermHarness.keyHandler = handler
    }
    paste(text: string) {
      xtermHarness.paste(text)
    }
    getSelection() {
      return ''
    }
    focus() {}
    reset() {}
    dispose() {}
  },
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}))

vi.mock('../../src/components/windows/common/TerminalSftpPanel.vue', async () => {
  const { defineComponent } = await import('vue')
  return { default: defineComponent({ name: 'TerminalSftpPanelStub', template: '<div />' }) }
})

vi.mock('../../src/components/windows/common/TerminalConnectionDialog.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'TerminalConnectionDialogStub',
      props: {
        modelValue: Boolean,
        connecting: Boolean,
        connectionError: String,
        profiles: Array,
      },
      emits: ['update:modelValue', 'connect', 'remove'],
      setup(props, { emit }) {
        return () =>
          h(
            'button',
            {
              id: 'ssh-connect-stub',
              onClick: () =>
                emit(
                  'connect',
                  {
                    id: 'ssh-test',
                    name: 'SSH Test',
                    source: 'nav-tools',
                    host: '192.0.2.10',
                    port: 22,
                    username: 'root',
                    authMethod: 'password',
                    privateKeyPath: '',
                    proxyJump: '',
                    initialDirectory: '',
                    forwards: [],
                  },
                  { password: 'test-only' },
                  false,
                ),
            },
            props.connecting ? 'connecting' : props.connectionError || 'idle',
          )
      },
    }),
  }
})

import TerminalPane from '../../src/components/windows/common/TerminalPane.vue'

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

const Passthrough = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  },
})

describe('TerminalPane connection lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    xtermHarness.keyHandler = undefined
    xtermHarness.paste.mockReset()
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: {
        invoke: vi.fn((channel: string) =>
          channel === 'terminal-session-create' ? new Promise(() => undefined) : Promise.resolve(),
        ),
        on: vi.fn(),
        off: vi.fn(),
        send: vi.fn(),
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('leaves the connecting state with an error when session creation never settles', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp(TerminalPane, {
      pane: createEmptyPane(),
      focused: true,
      paneCount: 1,
      expanded: false,
      capabilities: { platform: 'win32', localShells: [], wslDistros: [], sshAvailable: true },
      profiles: [],
    })
    for (const name of [
      'ElAlert',
      'ElButton',
      'ElDialog',
      'ElDropdown',
      'ElDropdownItem',
      'ElDropdownMenu',
      'ElIcon',
      'ElInput',
      'ElInputNumber',
      'ElOption',
      'ElSelect',
      'ElSwitch',
      'ElTooltip',
      'ElEmpty',
    ]) {
      app.component(name, Passthrough)
    }
    app.mount(host)

    ;(host.querySelector('.launch-card--ssh') as HTMLButtonElement).click()
    await nextTick()
    const connectButton = host.querySelector('#ssh-connect-stub') as HTMLButtonElement
    connectButton.click()
    await nextTick()
    expect(connectButton.textContent).toBe('connecting')

    await vi.advanceTimersByTimeAsync(20_000)
    await nextTick()

    expect(connectButton.textContent).not.toBe('connecting')
    expect(connectButton.textContent).not.toBe('idle')
    app.unmount()
  })

  it('renders a ready SSH session without cloning a reactive profile proxy', async () => {
    const profile = reactive({
      ...createSshProfile(),
      id: 'ssh-test',
      name: 'Camera',
      host: '192.0.2.10',
      username: 'root',
      authMethod: 'password' as const,
    })
    const session: TerminalSessionInfo = {
      id: 'ssh-ready',
      kind: 'ssh',
      title: profile.name,
      status: 'ready',
      profileId: profile.id,
      sshConnectionId: 'connection-ready',
    }
    window.ipcRenderer.invoke = vi.fn((channel: string) => {
      if (channel === 'terminal-session-create') return Promise.resolve(session)
      if (channel === 'terminal-session-attach') return Promise.resolve(session)
      return Promise.resolve()
    })

    const pane = ref(createEmptyPane())
    const sessionInfo = ref<TerminalSessionInfo>()
    const errors: unknown[] = []
    const Host = defineComponent({
      setup() {
        return () =>
          h(TerminalPane, {
            pane: pane.value,
            focused: true,
            paneCount: 1,
            expanded: false,
            capabilities: {
              platform: 'win32',
              localShells: [],
              wslDistros: [],
              sshAvailable: true,
            },
            profiles: [profile],
            sessionInfo: sessionInfo.value,
            onSession: (_paneId: string, value: TerminalSessionInfo) => {
              pane.value = { ...pane.value, sessionId: value.id, title: value.title }
              sessionInfo.value = value
            },
          })
      },
    })
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp(Host)
    app.config.errorHandler = (error) => errors.push(error)
    for (const name of [
      'ElAlert',
      'ElButton',
      'ElDialog',
      'ElDropdown',
      'ElDropdownItem',
      'ElDropdownMenu',
      'ElEmpty',
      'ElIcon',
      'ElInput',
      'ElInputNumber',
      'ElOption',
      'ElSelect',
      'ElSwitch',
      'ElTooltip',
    ]) {
      app.component(name, Passthrough)
    }
    app.mount(host)

    ;(host.querySelector('.launch-card--ssh') as HTMLButtonElement).click()
    await nextTick()
    ;(host.querySelector('#ssh-connect-stub') as HTMLButtonElement).click()
    await Promise.resolve()
    await nextTick()
    await Promise.resolve()
    await nextTick()

    expect(errors).toEqual([])
    expect(pane.value.sessionId).toBe(session.id)
    app.unmount()
  })

  it('pastes clipboard text into the active Windows terminal with Ctrl+V', async () => {
    window.ipcRenderer.invoke = vi.fn((channel: string) =>
      channel === 'clipboard-read-text' ? Promise.resolve('Get-Process') : Promise.resolve(),
    )
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp(TerminalPane, {
      pane: { ...createEmptyPane(), sessionId: 'local-session' },
      focused: true,
      paneCount: 1,
      expanded: false,
      capabilities: { platform: 'win32', localShells: [], wslDistros: [], sshAvailable: true },
      profiles: [],
    })
    for (const name of [
      'ElAlert',
      'ElButton',
      'ElDialog',
      'ElDropdown',
      'ElDropdownItem',
      'ElDropdownMenu',
      'ElEmpty',
      'ElIcon',
      'ElInput',
      'ElInputNumber',
      'ElOption',
      'ElSelect',
      'ElSwitch',
      'ElTooltip',
    ]) {
      app.component(name, Passthrough)
    }
    app.mount(host)

    const event = new KeyboardEvent('keydown', {
      key: 'v',
      code: 'KeyV',
      ctrlKey: true,
    })
    expect(xtermHarness.keyHandler?.(event)).toBe(false)
    await Promise.resolve()
    await Promise.resolve()

    expect(window.ipcRenderer.invoke).toHaveBeenCalledWith('clipboard-read-text')
    expect(xtermHarness.paste).toHaveBeenCalledWith('Get-Process')
    app.unmount()
  })

  it('shows a disconnected state and recreates the same local terminal in place', async () => {
    const closedSession: TerminalSessionInfo = {
      id: 'local-closed',
      kind: 'local',
      title: 'PowerShell',
      status: 'closed',
    }
    const reconnectedSession: TerminalSessionInfo = {
      id: 'local-reconnected',
      kind: 'local',
      title: 'PowerShell',
      status: 'ready',
    }
    window.ipcRenderer.invoke = vi.fn((channel: string) => {
      if (channel === 'terminal-session-attach') return Promise.resolve(closedSession)
      if (channel === 'terminal-session-create') return Promise.resolve(reconnectedSession)
      return Promise.resolve()
    })

    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp(TerminalPane, {
      pane: {
        ...createEmptyPane(),
        sessionId: closedSession.id,
        launch: { kind: 'local', localShell: 'powershell', label: 'PowerShell' },
      },
      focused: true,
      paneCount: 1,
      expanded: false,
      capabilities: {
        platform: 'win32',
        localShells: [{ kind: 'powershell', label: 'PowerShell', executable: 'powershell.exe' }],
        wslDistros: [],
        sshAvailable: true,
      },
      profiles: [],
      sessionInfo: closedSession,
    })
    for (const name of [
      'ElAlert',
      'ElButton',
      'ElDialog',
      'ElDropdown',
      'ElDropdownItem',
      'ElDropdownMenu',
      'ElEmpty',
      'ElIcon',
      'ElInput',
      'ElInputNumber',
      'ElOption',
      'ElSelect',
      'ElSwitch',
      'ElTooltip',
    ]) {
      app.component(name, Passthrough)
    }
    app.mount(host)
    await nextTick()

    const reconnect = host.querySelector('.session-reconnect') as HTMLElement | null
    expect(reconnect).not.toBeNull()
    reconnect?.click()
    await Promise.resolve()
    await nextTick()

    expect(window.ipcRenderer.invoke).toHaveBeenCalledWith(
      'terminal-session-close',
      closedSession.id,
    )
    expect(window.ipcRenderer.invoke).toHaveBeenCalledWith(
      'terminal-session-create',
      expect.objectContaining({ kind: 'local', localShell: 'powershell' }),
    )
    app.unmount()
  })
})
