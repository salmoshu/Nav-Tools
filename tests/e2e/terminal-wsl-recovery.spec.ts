import { expect, test } from '@playwright/test'

test('leaves a restored WSL session disconnected until the user reconnects it', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const application = {
      id: 'terminal-wsl-recovery',
      name: 'Terminal WSL Recovery',
      description: 'WSL manual recovery audit',
      icon: 'terminal',
      accent: '#3b82f6',
      windowIds: ['terminal'],
    }
    localStorage.setItem('nav-tools:custom-applications', JSON.stringify([application]))
    localStorage.setItem('nav-tools:selected-application', application.id)
    localStorage.setItem(
      'nav-tools:terminal-layout:v3',
      JSON.stringify({
        version: 3,
        activeTabId: 'wsl-tab',
        tabs: [
          {
            id: 'wsl-tab',
            title: 'WSL · Ubuntu-20.04',
            focusedPaneId: 'wsl-pane',
            root: {
              kind: 'pane',
              id: 'wsl-pane',
              title: 'WSL · Ubuntu-20.04',
              sessionId: 'stale-wsl-session',
              launch: {
                kind: 'wsl',
                wslDistro: 'Ubuntu-20.04',
                cwd: '/home/winchell/E-Wagon',
                label: 'WSL · Ubuntu-20.04',
              },
            },
          },
        ],
      }),
    )
    Object.defineProperty(window, '__terminalCreateRequests', { value: [] })
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: {
        invoke: async (channel: string, payload?: Record<string, unknown> | string) => {
          if (channel === 'terminal-capabilities') {
            return {
              platform: 'win32',
              localShells: [],
              wslDistros: ['Ubuntu-20.04'],
              sshAvailable: true,
            }
          }
          if (channel === 'terminal-session-list') return []
          if (channel === 'terminal-session-create') {
            const target = window as unknown as {
              __terminalCreateRequests: Array<Record<string, unknown>>
            }
            target.__terminalCreateRequests.push(payload as Record<string, unknown>)
            return {
              id: 'wsl-live-session',
              kind: 'wsl',
              title: 'WSL · Ubuntu-20.04',
              status: 'ready',
            }
          }
          if (channel === 'terminal-session-attach') {
            return {
              id: 'wsl-live-session',
              kind: 'wsl',
              title: 'WSL · Ubuntu-20.04',
              status: 'ready',
              scrollback: '',
            }
          }
          if (channel === 'terminal-ssh-config-list') return []
          return undefined
        },
        on: () => undefined,
        off: () => undefined,
        send: () => undefined,
      },
    })
  })

  const createRequests = () =>
    page.evaluate(
      () =>
        (window as unknown as { __terminalCreateRequests: Array<Record<string, unknown>> })
          .__terminalCreateRequests,
    )

  await page.goto('/#app/terminal-wsl-recovery')
  await expect(page.locator('.launcher-restore')).toBeVisible()
  await expect(page.locator('.launcher-restore__action')).toBeVisible()
  expect(await createRequests()).toEqual([])

  await page.locator('.launcher-restore__action').click()
  await expect(page.locator('.launcher-restore')).toHaveCount(0)
  await expect.poll(async () => (await createRequests()).length).toBe(1)
  expect((await createRequests())[0]).toMatchObject({
    kind: 'wsl',
    wslDistro: 'Ubuntu-20.04',
    cwd: '/home/winchell/E-Wagon',
  })
})
