import { expect, test } from '@playwright/test'

test('supports a scrollable port list, 12800 baud, control lines and loop sending', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    localStorage.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'serial-e2e',
          name: 'Serial E2E',
          description: 'Serial connection integration coverage',
          icon: 'serial',
          accent: '#1783ff',
          windowIds: ['raw-messages'],
        },
      ]),
    )
    localStorage.setItem('nav-tools:selected-application', 'serial-e2e')
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
    Reflect.set(window, '__serialOptions', [])
    Reflect.set(window, '__sent', [])
    Reflect.set(window, 'ipcRenderer', {
      on(channel: string, listener: (...args: unknown[]) => void) {
        const entries = listeners.get(channel) ?? new Set()
        entries.add(listener)
        listeners.set(channel, entries)
      },
      off(channel: string, listener: (...args: unknown[]) => void) {
        listeners.get(channel)?.delete(listener)
      },
      invoke: async (channel: string, options: unknown) => {
        if (channel === 'search-serial-ports') {
          return Array.from({ length: 40 }, (_, index) => `USB-SERIAL (COM${index + 1})`)
        }
        if (channel === 'open-serial-port') {
          Reflect.get(window, '__serialOptions').push(options)
          return 'connected'
        }
        return undefined
      },
      send(channel: string, data: unknown) {
        if (channel.startsWith('send-serial-')) {
          Reflect.get(window, '__sent').push({ channel, data })
        }
      },
    })
  })

  await page.goto('/#app/serial-e2e')
  await expect(page.locator('.flow-console-virtual')).toBeVisible()
  await page.getByTitle('Input', { exact: true }).click()
  const dialog = page.locator('.data-input-dialog')
  await expect(dialog).toBeVisible()
  await page.getByRole('tab', { name: /Serial Port/ }).click()
  await dialog.locator('#pane-serial .el-select').first().click()

  const dropdown = page.locator('body .el-popper.serial-port-dropdown')
  await expect(dropdown).toBeVisible()
  expect(
    Number(await dropdown.evaluate((element) => getComputedStyle(element).zIndex)),
  ).toBeGreaterThan(8000)
  const list = dropdown.locator('.el-select-dropdown__wrap')
  await expect(list).toHaveCSS('overflow-y', 'auto')
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await dropdown.getByRole('option', { name: 'USB-SERIAL (COM40)', exact: true }).click()

  const baud = dialog.locator('#pane-serial .el-select').nth(1)
  await baud.click()
  await page.getByRole('option', { name: '12800', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useDevice } = await import('/src/hooks/useDevice.ts')
        return useDevice().serialBaudRate.value
      }),
    )
    .toBe('12800')
  await dialog.getByText('Show full serial parameters', { exact: true }).click()
  await dialog.locator('.serial-signal-options').getByText('RTS', { exact: true }).click()
  await dialog.locator('.serial-signal-options').getByText('DTR', { exact: true }).click()
  await dialog.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(await page.evaluate(() => Reflect.get(window, '__serialOptions')[0])).toMatchObject({
    path: 'COM40',
    baudRate: 12800,
    rts: true,
    dtr: false,
  })

  await page.getByLabel('Enter ASCII data', { exact: true }).fill('AA')
  await page.locator('.loop-send-button').click()
  const frequency = page.locator('.loop-frequency-row input')
  await frequency.fill('2')
  await frequency.press('Tab')
  await page
    .locator('.loop-send-settings')
    .getByRole('button', { name: 'Start loop', exact: true })
    .click()
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__sent').length))
    .toBeGreaterThan(1)
  await page
    .locator('.loop-send-settings')
    .getByRole('button', { name: 'Stop loop', exact: true })
    .click()
  const stoppedCount = await page.evaluate(() => Reflect.get(window, '__sent').length)
  await page.waitForTimeout(600)
  expect(await page.evaluate(() => Reflect.get(window, '__sent').length)).toBe(stoppedCount)
  expect(
    await page.evaluate(() =>
      Reflect.get(window, '__sent').every((entry) => entry.channel === 'send-serial-ascii-data'),
    ),
  ).toBe(true)

  await page
    .locator('.loop-send-settings')
    .getByRole('button', { name: 'Start loop', exact: true })
    .click()
  await page.evaluate(async () => {
    const { useDevice } = await import('/src/hooks/useDevice.ts')
    useDevice().closeCurrDevice()
  })
  const disconnectedCount = await page.evaluate(() => Reflect.get(window, '__sent').length)
  await page.waitForTimeout(600)
  expect(await page.evaluate(() => Reflect.get(window, '__sent').length)).toBe(disconnectedCount)
  await expect(page.locator('.loop-send-button')).toHaveCount(0)
  await expect(page.locator('.message-input input')).toBeDisabled()
})
