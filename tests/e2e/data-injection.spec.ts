import { expect, test } from '@playwright/test'

test('injection is placed between A and C and persists independently without submitting the main data source', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('nav-tools:locale', 'en-US'))
  await page.goto('/')
  await page.locator('.application-card[data-application-id="serial"]').click()
  await page.getByTitle('Input', { exact: true }).click()
  const dialog = page.locator('.data-input-dialog')
  expect(
    await dialog
      .locator('.data-source-main-tabs > .el-tabs__header .el-tabs__item')
      .allTextContents(),
  ).toEqual(['Data source', 'Data injection', 'Connection management'])
  const originalSettings = await page.evaluate(() =>
    localStorage.getItem('nav-tools:data-source-settings'),
  )
  await dialog.getByRole('tab', { name: 'Data injection', exact: true }).click()
  const injection = dialog.locator('.data-injection-panel')
  await expect(injection.getByRole('tab', { name: /Serial Port/ })).toBeVisible()
  await expect(injection.getByRole('tab', { name: /Network/ })).toBeVisible()
  await expect(injection.getByRole('textbox', { name: 'Mountpoint', exact: true })).toBeVisible()
  await injection
    .getByRole('textbox', { name: 'Injection server address' })
    .fill('cors.example.com')
  await injection.getByRole('textbox', { name: 'Mountpoint', exact: true }).fill('RTCM3')
  await injection.getByRole('textbox', { name: 'Username', exact: true }).fill('rover')
  await injection.getByRole('textbox', { name: 'Password', exact: true }).fill('session-secret')
  await expect(injection.getByRole('switch', { name: 'Send GGA' })).toBeChecked()
  await page.screenshot({ path: 'test-results/data-injection-ntrip.png' })
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(await page.evaluate(() => localStorage.getItem('nav-tools:data-source-settings'))).toBe(
    originalSettings,
  )
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('nav-tools:data-injection-settings')!),
  )
  expect(saved.network).toMatchObject({
    host: 'cors.example.com',
    mountpoint: 'RTCM3',
    username: 'rover',
    password: '',
  })
  await page.getByTitle('Input', { exact: true }).click()
  await dialog.getByRole('tab', { name: 'Data injection', exact: true }).click()
  await injection.getByRole('tab', { name: /Serial Port/ }).click()
  await expect(injection.getByRole('combobox', { name: 'Baud Rate', exact: true })).toBeVisible()
  await expect(injection.getByRole('combobox', { name: 'Data Bits', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/data-injection-serial.png' })
})

test('retrieves mountpoints, selects a suggestion, accepts free text and reports caster errors', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('nav-tools:locale', 'en-US'))
  await page.goto('/')
  await page.locator('.application-card[data-application-id="serial"]').click()
  await page.evaluate(() => {
    Reflect.set(window, '__mountpointCalls', [])
    Object.defineProperty(window, 'electronAPI', { value: {}, configurable: true })
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: {
        on() {},
        off() {},
        send() {},
        async invoke(channel: string, options: { host: string }) {
          if (channel === 'data-injection-status')
            return { state: 'idle', receivedBytes: 0, forwardedBytes: 0, ggaSent: 0 }
          if (channel === 'search-serial-ports') return []
          if (channel === 'data-injection-mountpoints') {
            Reflect.get(window, '__mountpointCalls').push({ ...options })
            if (options.host === 'denied.example')
              throw new Error('NTRIP connection rejected: HTTP/1.1 401 Unauthorized')
            if (options.host === 'slow.example')
              await new Promise((resolve) => setTimeout(resolve, 500))
            return [
              {
                mountpoint: options.host === 'slow.example' ? 'OLD-CASTER' : 'BASE',
                identifier: 'Local station',
                format: 'RTCM 3.3',
                navigationSystem: 'GPS+GAL',
              },
            ]
          }
        },
      },
    })
  })
  await page.getByTitle('Input', { exact: true }).click()
  const dialog = page.locator('.data-input-dialog')
  await dialog.getByRole('tab', { name: 'Data injection', exact: true }).click()
  const panel = dialog.locator('.data-injection-panel')
  const host = panel.getByRole('textbox', { name: 'Injection server address' })
  const setHost = async (value: string) => {
    await host.click()
    await expect(host).toBeFocused()
    await host.fill(value)
    await expect(host).toHaveValue(value)
  }
  const mountpoint = panel.getByRole('textbox', { name: 'Mountpoint', exact: true })
  const fetch = panel.getByRole('button', { name: 'Get mountpoints', exact: true })
  await setHost('caster.example')
  await fetch.click()
  await expect(panel.getByRole('status')).toContainText('available: 1')
  await mountpoint.click()
  await panel.getByRole('option', { name: /BASE/ }).click()
  await expect(mountpoint).toHaveValue('BASE')
  await mountpoint.fill('MY-MANUAL-VRS')
  await panel.getByRole('textbox', { name: 'Username', exact: true }).click()
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('nav-tools:data-injection-settings')!).network.mountpoint,
    ),
  ).toBe('MY-MANUAL-VRS')
  await setHost('denied.example')
  await fetch.click()
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__mountpointCalls').at(-1)?.host))
    .toBe('denied.example')
  await expect(panel.getByRole('alert')).toContainText('401 Unauthorized')
  await expect(mountpoint).toHaveValue('MY-MANUAL-VRS')
  await setHost('slow.example')
  await fetch.click()
  await setHost('caster.example')
  await fetch.click()
  await expect(panel.getByRole('status')).toContainText('available: 1')
  // Let the previous caster answer after the newer request has completed.
  await page.waitForTimeout(650)
  await mountpoint.fill('')
  await mountpoint.click()
  await expect(panel.getByRole('option', { name: /BASE/ })).toBeVisible()
  await expect(panel.getByRole('option', { name: /OLD-CASTER/ })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/ntrip-mountpoint-selection.png' })
})
