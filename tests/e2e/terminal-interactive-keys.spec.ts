import { expect, test, type Page } from '@playwright/test'

const ESC = String.fromCharCode(27)

type IpcCall = { channel: string; payload: unknown }
type IpcListener = (event: unknown, payload: unknown) => void

type TerminalHarnessWindow = Window & {
  __ipcInvokeLog?: IpcCall[]
  __ipcListeners?: Record<string, IpcListener[]>
}

async function seedInteractiveSession(
  page: Page,
  kind: 'local' | 'wsl' | 'ssh',
  options: { presentation?: 'gui'; vimInScrollback?: boolean } = {},
): Promise<void> {
  const appId = `terminal-interactive-${kind}`
  const sessionId = `interactive-${kind}-session`
  const application = {
    id: appId,
    name: `Interactive ${kind}`,
    description: 'Interactive terminal keyboard audit',
    icon: 'terminal',
    accent: '#3b82f6',
    windowIds: ['terminal'],
  }
  const session = {
    id: sessionId,
    kind,
    title: kind === 'ssh' ? 'Robot' : kind === 'wsl' ? 'Ubuntu' : 'Git Bash',
    status: 'ready',
  }
  const scrollback =
    options.vimInScrollback === false
      ? ''
      : `${ESC}[?1049h${ESC}[22;0;0t${ESC}[?1h${ESC}=${ESC}[H${ESC}[2JVim`
  await page.addInitScript(
    ({ application, sessionId, session, scrollback, presentation }) => {
      localStorage.setItem('nav-tools:custom-applications', JSON.stringify([application]))
      localStorage.setItem('nav-tools:selected-application', application.id)
      localStorage.setItem(
        'nav-tools:terminal-layout:v3',
        JSON.stringify({
          version: 3,
          activeTabId: 'interactive-tab',
          tabs: [
            {
              id: 'interactive-tab',
              title: 'Terminal',
              focusedPaneId: 'interactive-pane',
              root: {
                kind: 'pane',
                id: 'interactive-pane',
                title: 'Terminal',
                sessionId,
                presentation,
              },
            },
          ],
        }),
      )
      Object.defineProperty(window, 'ipcRenderer', {
        configurable: true,
        value: {
          invoke: async (channel: string, payload: unknown) => {
            const w = window as unknown as TerminalHarnessWindow
            ;(w.__ipcInvokeLog ??= []).push({ channel, payload })
            if (channel === 'terminal-capabilities') {
              return { platform: 'win32', localShells: [], wslDistros: [], sshAvailable: true }
            }
            if (channel === 'terminal-session-list') return [session]
            if (channel === 'terminal-session-attach') return { ...session, scrollback }
            if (channel === 'terminal-ssh-config-list') return []
            return undefined
          },
          on: (channel: string, listener: IpcListener) => {
            const w = window as unknown as TerminalHarnessWindow
            ;((w.__ipcListeners ??= {})[channel] ??= []).push(listener)
          },
          off: (channel: string, listener: IpcListener) => {
            const w = window as unknown as TerminalHarnessWindow
            const listeners = w.__ipcListeners?.[channel]
            if (listeners)
              w.__ipcListeners![channel] = listeners.filter((entry) => entry !== listener)
          },
          send: () => undefined,
        },
      })
    },
    {
      application,
      sessionId,
      session,
      scrollback,
      presentation: options.presentation,
    },
  )
  await page.goto(`/#app/${appId}`)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as TerminalHarnessWindow).__ipcInvokeLog?.filter(
            (call) => call.channel === 'terminal-session-attach',
          ).length ?? 0,
      ),
    )
    .toBe(1)
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))))
  if (await page.locator('.xterm-helper-textarea').isVisible()) {
    await page.locator('.xterm-helper-textarea').focus()
  }
}

async function writtenData(page: Page): Promise<string> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const calls = (window as unknown as TerminalHarnessWindow).__ipcInvokeLog ?? []
        return calls
          .filter((call) => call.channel === 'terminal-session-write')
          .map((call) => (call.payload as { data: string }).data)
          .join('')
      }),
    )
    .not.toBe('')
  return page.evaluate(() => {
    const calls = (window as unknown as TerminalHarnessWindow).__ipcInvokeLog ?? []
    return calls
      .filter((call) => call.channel === 'terminal-session-write')
      .map((call) => (call.payload as { data: string }).data)
      .join('')
  })
}

async function emitOutput(page: Page, data: string): Promise<void> {
  await page.evaluate((data) => {
    const w = window as unknown as TerminalHarnessWindow
    for (const listener of w.__ipcListeners?.['terminal-output'] ?? []) {
      listener(null, {
        sessionId: w.__ipcInvokeLog?.find((call) => call.channel === 'terminal-session-attach')
          ?.payload,
        data,
      })
    }
  }, data)
}

for (const kind of ['ssh', 'wsl', 'local'] as const) {
  test(`forwards Vim editing and quit keys in a ${kind} session`, async ({ page }) => {
    await seedInteractiveSession(page, kind)

    await page.keyboard.press('i')
    await page.keyboard.type('hello')
    await page.keyboard.press('Escape')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.type(':q!')
    await page.keyboard.press('Enter')

    await expect.poll(() => writtenData(page)).toBe(`ihello${ESC}${ESC}OA${ESC}OB:q!\r`)
  })
}

for (const kind of ['wsl', 'local'] as const) {
  test(`uses the interactive terminal when Vim enters the alternate screen in ${kind} GUI mode`, async ({
    page,
  }) => {
    await seedInteractiveSession(page, kind, { presentation: 'gui' })

    await expect(page.locator('.terminal-gui-view')).toHaveCount(0)
    await expect(page.locator('.xterm-host')).toBeVisible()
    await page.keyboard.type('ihello')
    await page.keyboard.press('Escape')
    await page.keyboard.type(':q!')
    await page.keyboard.press('Enter')

    await expect.poll(() => writtenData(page)).toBe(`ihello${ESC}:q!\r`)
  })

  test(`switches a running ${kind} GUI session to Vim and restores it on exit`, async ({
    page,
  }) => {
    await seedInteractiveSession(page, kind, {
      presentation: 'gui',
      vimInScrollback: false,
    })
    await expect(page.locator('.terminal-gui-view')).toBeVisible()
    await expect(page.locator('.xterm-host')).toBeHidden()

    await emitOutput(page, `${ESC}[?1049h${ESC}[?1h${ESC}=${ESC}[?2004h`)
    await expect(page.locator('.terminal-gui-view')).toHaveCount(0)
    await expect(page.locator('.xterm-host')).toBeVisible()
    await page.locator('.xterm-helper-textarea').focus()
    await page.keyboard.type('ihello')
    await page.keyboard.press('Escape')
    await page.keyboard.type(':q!')
    await page.keyboard.press('Enter')
    await expect.poll(() => writtenData(page)).toBe(`ihello${ESC}:q!\r`)

    await emitOutput(page, `${ESC}[?2004l${ESC}[?1l${ESC}>${ESC}[?1049l`)
    await expect(page.locator('.terminal-gui-view')).toBeVisible()
    await expect(page.locator('.xterm-host')).toBeHidden()
  })
}
