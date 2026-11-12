import { expect, test } from '@playwright/test'

test('merges camera TCP cards and edits SSH settings in Data Source connections', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'zh-CN')
    localStorage.setItem(
      'nav-tools:enabled-default-applications',
      JSON.stringify(['serial', 'gnss', 'gnssraw', 'camera', 'gnsslib']),
    )
    localStorage.setItem(
      'nav-tools:data-source-settings',
      JSON.stringify({
        version: 1,
        activeSource: 'network',
        network: {
          protocol: 'tcp',
          host: '127.0.0.1',
          port: 8080,
          loop: false,
          parser: 'raw',
          format: 'auto',
          regexPattern: '',
        },
      }),
    )
    Reflect.set(window, '__sshObserveCalls', [])
    Object.defineProperty(window, 'ipcRenderer', {
      value: {
        on() {},
        off() {},
        send() {},
        invoke: async (channel: string) => {
          if (channel === 'camera-calibration-observe') {
            ;(Reflect.get(window, '__sshObserveCalls') as unknown[]).push(true)
            return undefined
          }
          if (channel === 'camera-calibration-access') {
            return { host: '192.168.3.14', port: 22, username: 'root', hasPassword: true }
          }
          if (channel === 'camera-calibration-snapshot') {
            return { observing: false, ssh: null }
          }
          if (channel === 'camera-stream-sessions') return []
          if (channel === 'data-injection-status') {
            return { state: 'idle', receivedBytes: 0, forwardedBytes: 0, ggaSent: 0 }
          }
          if (channel === 'terminal-capabilities') {
            return { platform: 'win32', localShells: [], wslDistros: [], sshAvailable: true }
          }
          if (channel === 'terminal-session-list' || channel === 'terminal-ssh-config-list') {
            return []
          }
          return undefined
        },
      },
    })
    Object.defineProperty(window, 'electronAPI', {
      value: {
        getAppVersion: async () => '1.8.8',
        getWindowState: async () => ({ maximized: false, alwaysOnTop: false }),
        setUpdaterPrefs() {},
      },
    })
  })
  await page.goto('/')
  await page.locator('.application-card').filter({ hasText: 'Camera' }).click()
  await page.getByTitle('Input', { exact: true }).click()
  await page.getByRole('tab', { name: '连接管理', exact: true }).click()

  const inputDialog = page.locator('.data-input-dialog')
  await expect(inputDialog.getByRole('button', { name: /^(确定|OK)$/ })).toHaveCount(0)
  await expect(inputDialog.getByRole('button', { name: '取消', exact: true })).toBeVisible()
  await expect(page.locator('.app-connection-card').filter({ hasText: '相机控制' })).toHaveCount(1)
  await expect(
    page.locator('.app-connection-endpoint').filter({ hasText: '127.0.0.1:8080' }),
  ).toHaveCount(1)
  await expect(page.locator('.app-connection-card').filter({ hasText: '相机视频' })).toHaveCount(1)
  await expect(page.locator('.app-connection-card').filter({ hasText: '相机测量' })).toHaveCount(1)
  await page
    .locator('.app-connection-card')
    .filter({ hasText: '相机测量' })
    .getByRole('button', { name: '去配置', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'SSH 设备访问', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: '相机地址', exact: true })).toHaveValue(
    '192.168.3.14',
  )
  await expect(dialog.getByRole('textbox', { name: 'SSH 用户名', exact: true })).toHaveValue('root')
  await expect(dialog.getByRole('textbox', { name: 'SSH 密码', exact: true })).toHaveValue('')
  await dialog.getByRole('textbox', { name: '相机地址', exact: true }).fill('192.168.3.20')
  await dialog
    .getByRole('button', { name: '连接', exact: true })
    .evaluate((element) => element.click())
  await expect(dialog).toBeHidden()
  expect(await page.evaluate(() => Reflect.get(window, '__sshObserveCalls').length)).toBe(1)
  await expect(page.getByRole('tab', { name: '连接', exact: true })).toHaveCount(0)
  expect(pageErrors).toEqual([])
})
