import { expect, test, type Page } from '@playwright/test'

async function openCameraConnections(
  page: Page,
  hasPassword = true,
  delayAccess = false,
  retry = false,
) {
  await page.addInitScript(
    ({ hasPassword, delayAccess, retry }) => {
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
            loop: retry,
            parser: 'raw',
            format: 'auto',
            regexPattern: '',
          },
        }),
      )
      Reflect.set(window, '__sshObserveCalls', [])
      Reflect.set(window, '__sshReconnectCalls', [])
      Reflect.set(window, '__sshBehavior', 'success')
      Reflect.set(window, '__networkCalls', [])
      Reflect.set(window, '__rtspCalls', [])
      Reflect.set(window, '__rtspActive', false)
      const accessReady = delayAccess
        ? new Promise<void>((resolve) => Reflect.set(window, '__sshAccessResolve', resolve))
        : Promise.resolve()
      const streaming = {
        observing: true,
        ssh: { state: 'streaming', host: '192.168.3.14', port: 22, detail: '正在采样' },
      }
      Object.defineProperty(window, 'ipcRenderer', {
        value: {
          on() {},
          off() {},
          send() {},
          invoke: async (channel: string, request?: unknown) => {
            if (channel === 'open-network-connection' || channel === 'close-network-connection') {
              Reflect.get(window, '__networkCalls').push(channel)
              if (
                channel === 'open-network-connection' &&
                Reflect.get(window, '__networkBehavior') === 'pending'
              ) {
                return new Promise(() => undefined)
              }
            }
            if (channel === 'network-connect-cancel') {
              Reflect.get(window, '__networkCalls').push(channel)
              Reflect.set(window, '__networkBehavior', 'success')
            }
            if (channel === 'camera-calibration-reconnect') {
              Reflect.get(window, '__sshReconnectCalls').push(request)
              return streaming
            }
            if (channel === 'camera-calibration-observe') {
              Reflect.get(window, '__sshObserveCalls').push(request)
              if (Reflect.get(window, '__sshBehavior') === 'pending') {
                return new Promise((resolve, reject) => {
                  Reflect.set(window, '__sshResolve', () => resolve(streaming))
                  Reflect.set(window, '__sshReject', () =>
                    reject(new Error('SSH 认证失败，请检查用户名或密码')),
                  )
                })
              }
              if (Reflect.get(window, '__sshBehavior') === 'failed-state') {
                return {
                  observing: true,
                  ssh: { ...streaming.ssh, state: 'error', detail: '采样进程退出码 1' },
                }
              }
              return streaming
            }
            if (channel === 'camera-calibration-access') {
              await accessReady
              return { host: '192.168.3.14', port: 22, username: 'root', hasPassword }
            }
            if (channel === 'camera-calibration-password')
              return hasPassword ? 'saved-camera-test' : ''
            if (channel === 'camera-calibration-snapshot') {
              return { observing: false, ssh: null }
            }
            if (channel === 'camera-stream-sessions') {
              return Reflect.get(window, '__rtspActive')
                ? [{ url: 'rtsp://127.0.0.1:8554/rgbstream', ownerWindowId: 42 }]
                : []
            }
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
          startCameraStream: async (url: string) => {
            Reflect.get(window, '__rtspCalls').push(['start', url])
            Reflect.set(window, '__rtspActive', true)
            return { ok: true }
          },
          stopCameraStreamSession: async (ownerWindowId: number) => {
            Reflect.get(window, '__rtspCalls').push(['stop', ownerWindowId])
            Reflect.set(window, '__rtspActive', false)
            return true
          },
        },
      })
    },
    { hasPassword, delayAccess, retry },
  )
  await page.goto('/')
  await page.locator('.application-card').filter({ hasText: 'Camera' }).click()
  await page.getByTitle('Input', { exact: true }).click()
  await page.getByRole('tab', { name: '连接管理', exact: true }).click()
}

test('merges camera TCP cards and reveals or hides the saved SSH password', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await openCameraConnections(page)

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
  const password = dialog.getByRole('textbox', { name: 'SSH 密码', exact: true })
  await expect(password).toHaveValue('saved-camera-test')
  await expect(password).toHaveAttribute('type', 'password')
  const reveal = dialog.getByRole('button', { name: '显示密码', exact: true })
  await expect(reveal).toHaveText('')
  await expect(reveal.locator('svg')).toBeVisible()
  await reveal.click()
  await expect(password).toHaveAttribute('type', 'text')
  await dialog.getByRole('button', { name: '隐藏密码', exact: true }).click()
  await expect(password).toHaveAttribute('type', 'password')
  await dialog.getByRole('textbox', { name: '相机地址', exact: true }).fill('192.168.3.20')
  await dialog
    .getByRole('button', { name: '连接', exact: true })
    .evaluate((element) => element.click())
  await expect(dialog).toBeHidden()
  expect(await page.evaluate(() => Reflect.get(window, '__sshObserveCalls').length)).toBe(1)
  await expect(page.getByRole('tab', { name: '连接', exact: true })).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

test('SSH card shows connecting and a persistent failure, then allows retry', async ({ page }) => {
  await openCameraConnections(page)
  const card = page.locator('.app-connection-card').filter({ hasText: '相机测量' })
  await page.evaluate(() => Reflect.set(window, '__sshBehavior', 'pending'))
  await card.getByRole('button', { name: '连接', exact: true }).click()
  const connecting = card.getByRole('button', { name: '连接中…', exact: true })
  await expect(connecting).toBeVisible()
  await expect(connecting).toBeDisabled()
  expect(await page.evaluate(() => Reflect.get(window, '__sshObserveCalls').length)).toBe(1)

  await page.evaluate(() => Reflect.get(window, '__sshReject')())
  await expect(card.getByRole('alert')).toContainText('SSH 认证失败')
  await expect(card.getByRole('button', { name: '连接', exact: true })).toBeEnabled()

  await page.evaluate(() => Reflect.set(window, '__sshBehavior', 'success'))
  await card.getByRole('button', { name: '连接', exact: true }).click()
  await expect(card.getByRole('button', { name: '断开', exact: true })).toBeVisible()
  await expect(card.getByRole('alert')).toHaveCount(0)
})

test('loads the saved password when SSH configuration is opened before access metadata arrives', async ({
  page,
}) => {
  await openCameraConnections(page, true, true)
  const card = page.locator('.app-connection-card').filter({ hasText: '相机测量' })
  await card.getByRole('button', { name: '去配置', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'SSH 设备访问', exact: true })
  await expect(dialog).toBeVisible()
  await page.evaluate(() => Reflect.get(window, '__sshAccessResolve')())
  await expect(dialog.getByRole('textbox', { name: 'SSH 密码', exact: true })).toHaveValue(
    'saved-camera-test',
  )
})

test('SSH Connect opens configuration when the saved password is missing', async ({ page }) => {
  await openCameraConnections(page, false)
  const card = page.locator('.app-connection-card').filter({ hasText: '相机测量' })
  await card.getByRole('button', { name: '连接', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'SSH 设备访问', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('alert')).toContainText('密码')
  expect(await page.evaluate(() => Reflect.get(window, '__sshObserveCalls').length)).toBe(0)
})

test('a failed measurement snapshot does not make Connect appear successful', async ({ page }) => {
  await openCameraConnections(page)
  await page.evaluate(() => Reflect.set(window, '__sshBehavior', 'failed-state'))
  const card = page.locator('.app-connection-card').filter({ hasText: '相机测量' })
  await card.getByRole('button', { name: '连接', exact: true }).click()
  await expect(card.getByRole('alert')).toContainText('采样进程退出码 1')
  await expect(card.getByRole('button', { name: '连接', exact: true })).toBeEnabled()
})

test('camera TCP, RTSP and SSH cards all support connect and disconnect', async ({ page }) => {
  await openCameraConnections(page)
  const tcpCard = page.locator('.app-connection-card').filter({ hasText: '相机控制' })
  await tcpCard.getByRole('button', { name: '连接', exact: true }).click()
  await expect(tcpCard.getByRole('button', { name: '断开', exact: true })).toBeVisible()
  await tcpCard.getByRole('button', { name: '断开', exact: true }).click()
  await expect(tcpCard.getByRole('button', { name: '连接', exact: true })).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, '__networkCalls'))).toEqual([
    'open-network-connection',
    'close-network-connection',
  ])

  const videoCard = page.locator('.app-connection-card').filter({ hasText: '相机视频' })
  await videoCard.getByRole('button', { name: '连接', exact: true }).click()
  await expect(videoCard.getByRole('button', { name: '断开', exact: true })).toBeVisible()
  await videoCard.getByRole('button', { name: '断开', exact: true }).click()
  await expect(videoCard.getByRole('button', { name: '连接', exact: true })).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, '__rtspCalls'))).toEqual([
    ['start', 'rtsp://127.0.0.1:8554/rgbstream'],
    ['stop', 42],
  ])

  const sshCard = page.locator('.app-connection-card').filter({ hasText: '相机测量' })
  await sshCard.getByRole('button', { name: '连接', exact: true }).click()
  await expect(sshCard.getByRole('button', { name: '断开', exact: true })).toBeVisible()
  await sshCard.getByRole('button', { name: '断开', exact: true }).click()
  await expect(sshCard.getByRole('button', { name: '连接', exact: true })).toBeVisible()
})

test('Retry cancels and reconnects a pending SSH link after RTSP succeeds', async ({ page }) => {
  await openCameraConnections(page, true, false, true)
  const sshCard = page.locator('.app-connection-card').filter({ hasText: '相机测量' })
  await page.evaluate(() => Reflect.set(window, '__sshBehavior', 'pending'))
  await sshCard.getByRole('button', { name: '连接', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__sshObserveCalls').length))
    .toBe(1)

  const videoCard = page.locator('.app-connection-card').filter({ hasText: '相机视频' })
  await videoCard.getByRole('button', { name: '连接', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__sshReconnectCalls').length))
    .toBe(1)
  expect(await page.evaluate(() => Reflect.get(window, '__sshObserveCalls').length)).toBe(1)
})

test('Retry cancels a pending TCP attempt after another camera link succeeds', async ({ page }) => {
  await openCameraConnections(page, true, false, true)
  await page.evaluate(() => Reflect.set(window, '__networkBehavior', 'pending'))
  const tcpCard = page.locator('.app-connection-card').filter({ hasText: '相机控制' })
  await tcpCard.getByRole('button', { name: '连接', exact: true }).click()
  await expect(tcpCard.getByRole('button', { name: '连接中…', exact: true })).toBeVisible()

  const videoCard = page.locator('.app-connection-card').filter({ hasText: '相机视频' })
  await videoCard.getByRole('button', { name: '连接', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (Reflect.get(window, '__networkCalls') as string[]).filter(
            (channel) => channel === 'open-network-connection',
          ).length,
      ),
    )
    .toBe(2)
  expect(await page.evaluate(() => Reflect.get(window, '__networkCalls'))).toContain(
    'network-connect-cancel',
  )
})
