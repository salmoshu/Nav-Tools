import { expect, test, type Page } from '@playwright/test'

async function mockIpc(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: {
        invoke: async () => undefined,
        send: () => undefined,
        on: () => undefined,
        off: () => undefined,
      },
    })
  })
}

test('opens Messages settings from the card title and persists the divider preference', async ({
  page,
}) => {
  const application = {
    id: 'messages-settings',
    name: 'Messages settings',
    description: '',
    icon: 'terminal',
    accent: '#3b82f6',
    windowIds: ['raw-messages'],
  }
  await mockIpc(page)
  await page.addInitScript((application) => {
    localStorage.setItem('nav-tools:custom-applications', JSON.stringify([application]))
    localStorage.setItem('nav-tools:selected-application', application.id)
  }, application)
  await page.goto('/#app/messages-settings')

  await page.locator('.panel-settings-entry').click()
  const settings = page.locator('.settings-page')
  await expect(settings).toBeVisible()
  await expect(settings.getByRole('button', { name: 'Messages', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const dividerSwitch = settings.getByRole('switch', { name: 'Show message row dividers' })
  await expect(dividerSwitch).toBeChecked()
  await dividerSwitch.locator('..').click()
  await expect(dividerSwitch).not.toBeChecked()
  await settings.getByRole('button', { name: 'Back', exact: true }).click()

  await page.evaluate(async () => {
    const { useConsole } = await import('/src/composables/flow/useConsole.ts')
    const console = useConsole(true)
    console.clearMessages()
    console.dataFormat.value = 'none'
    console.displayFormat.value = 'ascii'
    console.addMessage('first\nsecond\n')
  })
  const rows = page.locator('.message-line')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toHaveCSS('border-bottom-width', '0px')

  await page.locator('.panel-settings-entry').click()
  await expect(
    settings.getByRole('switch', { name: 'Show message row dividers' }),
  ).not.toBeChecked()
  await settings.getByRole('button', { name: 'Back', exact: true }).click()
  await page.reload()
  await page.locator('.panel-settings-entry').click()
  await expect(
    settings.getByRole('switch', { name: 'Show message row dividers' }),
  ).not.toBeChecked()
})

test('opens component settings from a detached window title', async ({ page }) => {
  await mockIpc(page)
  const payload = encodeURIComponent(
    JSON.stringify({ componentName: 'RawMessages', windowId: 'raw-messages', title: 'Messages' }),
  )
  await page.goto(`/#card/${payload}`)

  await expect(page.locator('.card-window')).toBeVisible()
  await page.locator('.brand-settings-entry').click()
  await expect(page.locator('.settings-page')).toBeVisible()
  await expect(page.locator('.card-window')).toBeHidden()
  await expect(
    page.locator('.settings-page').getByRole('button', { name: 'Messages', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.locator('.card-window')).toBeVisible()
  await expect(page.locator('.settings-page')).toHaveCount(0)
})
