import { expect, test } from '@playwright/test'

test.describe.configure({ timeout: 120_000 })

test('reorders applications with neighboring-card movement and persists the order', async ({
  page,
}) => {
  await page.goto('/')
  const cards = page.locator('.application-card')
  await expect(cards).toHaveCount(4)
  await expect(cards.locator('h2')).toHaveText(['Serial', 'GNSS', 'Flow', 'Camera'])

  await cards.nth(3).dragTo(cards.nth(0))
  await expect(cards.locator('h2')).toHaveText(['Camera', 'Serial', 'GNSS', 'Flow'])
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('nav-tools:custom-applications')
        return raw ? JSON.parse(raw).map((entry: { id: string }) => entry.id) : []
      }),
    )
    .toEqual(['camera', 'serial', 'gnss', 'motor'])

  await page.reload()
  await expect(page.locator('.application-card h2')).toHaveText([
    'Camera',
    'Serial',
    'GNSS',
    'Flow',
  ])
})

test('creates a selected terminal type, splits it, and restores the workspace after reload', async ({
  page,
}) => {
  const application = {
    id: 'terminal-v141',
    name: 'Terminal v1.4.1',
    description: 'Terminal interaction audit',
    icon: 'terminal',
    accent: '#3b82f6',
    windowIds: ['terminal'],
  }
  await page.addInitScript((value) => {
    localStorage.setItem('nav-tools:custom-applications', JSON.stringify([value]))
    localStorage.setItem('nav-tools:selected-application', value.id)

    let nextSession = 0
    const sessions = new Map<string, Record<string, unknown>>()
    const createSession = (kind: 'local' | 'wsl' | 'ssh', title: string) => {
      const session = {
        id: `browser-session-${++nextSession}`,
        kind,
        title,
        status: 'ready',
      }
      sessions.set(session.id, session)
      return session
    }
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: {
        invoke: async (channel: string, payload?: Record<string, unknown> | string) => {
          if (channel === 'terminal-capabilities') {
            return {
              platform: 'win32',
              localShells: [
                {
                  kind: 'powershell',
                  label: 'PowerShell',
                  executable: 'powershell.exe',
                },
                { kind: 'cmd', label: 'Command Prompt', executable: 'cmd.exe' },
              ],
              wslDistros: ['Ubuntu'],
              sshAvailable: true,
            }
          }
          if (channel === 'terminal-session-list') return []
          if (channel === 'terminal-ssh-config-list') return []
          if (channel === 'terminal-session-create') {
            const request = payload as Record<string, unknown>
            const kind = request.kind as 'local' | 'wsl' | 'ssh'
            const title =
              kind === 'local'
                ? request.localShell === 'powershell'
                  ? 'PowerShell'
                  : 'Command Prompt'
                : kind === 'wsl'
                  ? `WSL · ${request.wslDistro}`
                  : 'SSH'
            return createSession(kind, title)
          }
          if (channel === 'terminal-session-clone') return createSession('local', 'PowerShell')
          if (channel === 'terminal-session-attach') return sessions.get(String(payload))
          if (channel === 'terminal-session-close' && typeof payload === 'string') {
            sessions.delete(payload)
          }
          return undefined
        },
        on: () => undefined,
        off: () => undefined,
        send: () => undefined,
      },
    })
  }, application)

  await page.goto('/#app/terminal-v141')
  const addTerminal = page.getByRole('button', { name: /New terminal tab|新建终端标签页/ })
  await expect(addTerminal).toBeVisible()
  await addTerminal.click()
  await page.getByRole('menuitem', { name: 'PowerShell' }).click()

  await expect(page.locator('.terminal-tab.active .tab-label')).toHaveText('PowerShell')
  await expect(page.locator('.terminal-tab.active .tab-status-dot')).toHaveCSS(
    'background-color',
    'rgb(63, 185, 80)',
  )
  await page.getByRole('button', { name: /Split Right|向右拆分/ }).click()
  await expect(page.locator('.terminal-pane')).toHaveCount(2)

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('nav-tools:terminal-layout:v3')
        return raw ? JSON.parse(raw).tabs?.[1]?.root?.kind : undefined
      }),
    )
    .toBe('split')

  await page.reload()
  await expect(page.locator('.terminal-tab.active .tab-label')).toHaveText('PowerShell')
  await expect(page.locator('.terminal-pane')).toHaveCount(2)

  await page.getByRole('button', { name: /Settings|设置/ }).click()
  await page.getByText(/Keyboard Shortcuts|快捷键/, { exact: true }).click()
  await expect(page.getByRole('heading', { name: /Keyboard Shortcuts|快捷键/ })).toBeVisible()
  await expect(page.locator('.shortcut-category')).toHaveText(/Terminal|终端/)
  await expect(page.locator('.shortcut-input')).not.toHaveCount(0)
})
