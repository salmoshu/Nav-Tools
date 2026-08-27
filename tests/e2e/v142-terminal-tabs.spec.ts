import { expect, test } from '@playwright/test'

test('drags terminal tabs into a persisted order', async ({ page }) => {
  const application = {
    id: 'terminal-v142',
    name: 'Terminal v1.4.2',
    description: 'Terminal tab reorder audit',
    icon: 'terminal',
    accent: '#3b82f6',
    windowIds: ['terminal'],
  }
  await page.addInitScript((value) => {
    localStorage.setItem('nav-tools:custom-applications', JSON.stringify([value]))
    localStorage.setItem('nav-tools:selected-application', value.id)
    let sequence = 0
    const sessions = new Map<string, Record<string, unknown>>()
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: {
        invoke: async (channel: string, payload?: Record<string, unknown> | string) => {
          if (channel === 'terminal-capabilities') {
            return {
              platform: 'win32',
              localShells: [
                { kind: 'powershell', label: 'PowerShell', executable: 'powershell.exe' },
                { kind: 'cmd', label: 'Command Prompt', executable: 'cmd.exe' },
              ],
              wslDistros: [],
              sshAvailable: true,
            }
          }
          if (channel === 'terminal-session-list' || channel === 'terminal-ssh-config-list')
            return []
          if (channel === 'terminal-session-create') {
            const request = payload as Record<string, unknown>
            const title = request.localShell === 'powershell' ? 'PowerShell' : 'Command Prompt'
            const session = {
              id: `tab-session-${++sequence}`,
              kind: 'local',
              title,
              status: 'ready',
            }
            sessions.set(session.id, session)
            return session
          }
          if (channel === 'terminal-session-attach') return sessions.get(String(payload))
          return undefined
        },
        on: () => undefined,
        off: () => undefined,
        send: () => undefined,
      },
    })
  }, application)

  await page.goto('/#app/terminal-v142')
  const addTerminal = page.getByRole('button', { name: /New terminal tab|新建终端标签页/ })
  await addTerminal.click()
  await page.getByRole('menuitem', { name: 'PowerShell' }).click()
  await addTerminal.click()
  await page.getByRole('menuitem', { name: 'Command Prompt' }).click()

  const tabs = page.locator('.terminal-tab')
  await expect(tabs.locator('.tab-label')).toHaveText(['Terminal', 'PowerShell', 'Command Prompt'])
  await tabs.nth(2).dragTo(tabs.nth(0))
  await expect(tabs.locator('.tab-label')).toHaveText(['Command Prompt', 'Terminal', 'PowerShell'])

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('nav-tools:terminal-layout:v3')
        return raw ? JSON.parse(raw).tabs.map((tab: { title: string }) => tab.title) : []
      }),
    )
    .toEqual(['Command Prompt', 'Terminal', 'PowerShell'])
})
