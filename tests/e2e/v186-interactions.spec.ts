import { expect, test } from '@playwright/test'

test('opens a fresh SSH tab with its connection dialog instead of a reconnect prompt', async ({
  page,
}) => {
  const application = {
    id: 'terminal-new-ssh',
    name: 'Terminal SSH',
    description: '',
    icon: 'terminal',
    accent: '#3b82f6',
    windowIds: ['terminal'],
  }
  await page.addInitScript((application) => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    localStorage.setItem('nav-tools:custom-applications', JSON.stringify([application]))
    localStorage.setItem('nav-tools:selected-application', application.id)
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: {
        invoke: async (channel: string) => {
          if (channel === 'terminal-capabilities') {
            return { platform: 'win32', localShells: [], wslDistros: [], sshAvailable: true }
          }
          if (channel === 'terminal-session-list' || channel === 'terminal-ssh-config-list') {
            return []
          }
          return undefined
        },
        on: () => undefined,
        off: () => undefined,
        send: () => undefined,
      },
    })
  }, application)
  await page.goto('/#app/terminal-new-ssh')

  await page.locator('.terminal-tab-add').click()
  await page.getByRole('menuitem', { name: 'SSH', exact: true }).click()

  await expect(page.locator('.terminal-connection-dialog')).toBeVisible()
  await expect(page.locator('.terminal-tab.active .tab-label')).toHaveText('SSH')
  await expect(page.locator('.terminal-pane').last().locator('.launcher-restore')).toHaveCount(0)
  await expect(page.getByText('Reconnect required', { exact: true })).toHaveCount(0)
})

test('keeps settings open when cancelling the selector and enters the selected application', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('nav-tools:locale', 'en-US'))
  await page.goto('/#app/serial')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.locator('.settings-page')).toBeVisible()

  await page.locator('.application-button').click()
  const selector = page.locator('.selector-backdrop')
  await expect(selector).toBeVisible()
  await expect(page.locator('.settings-page')).toBeVisible()
  await selector.getByRole('button', { name: 'Close Application Selector', exact: true }).click()
  await expect(selector).toHaveCount(0)
  await expect(page.locator('.settings-page')).toBeVisible()

  await page.locator('.application-button').click()
  await selector.locator('.application-card[data-application-id="gnss"]').click()
  await expect(selector).toHaveCount(0)
  await expect(page.locator('.settings-page')).toHaveCount(0)
  await expect(page.locator('.context-app-name')).toHaveText('GNSS')
  await expect(page.locator('.dashboard-content')).toBeVisible()
})
