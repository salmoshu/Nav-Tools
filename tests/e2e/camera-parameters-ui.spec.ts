import { expect, test } from '@playwright/test'
import { createCalibrationSnapshot } from '../../src/core/camera/CameraCalibrationTypes'

test('preserves camera inputs across tabs and displays background task states at card widths', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript((snapshot) => {
    localStorage.setItem('nav-tools:locale', 'zh-CN')
    localStorage.setItem('nav-tools:theme', 'system')
    Object.defineProperty(window, 'ipcRenderer', {
      value: {
        on(channel: string, listener: (event: unknown, data: unknown) => void) {
          window.addEventListener(channel, (event) => listener(null, (event as CustomEvent).detail))
        },
        off() {},
        send() {},
        invoke: async () => undefined,
      },
    })
    Object.defineProperty(window, 'electronAPI', {
      value: {
        getAppVersion: async () => '1.5.2',
        getWindowState: async () => ({ maximized: false, alwaysOnTop: false }),
        setUpdaterPrefs() {},
        cameraCalibrationSnapshot: async () => snapshot,
        getPathForFile: (file: File) => `C:\\camera-tools\\scripts\\${file.name}`,
        cameraScriptRun: async () => {
          window.dispatchEvent(
            new CustomEvent('camera-script-event', {
              detail: { type: 'state', state: 'running', detail: 'Running camera check' },
            }),
          )
        },
      },
    })
  }, createCalibrationSnapshot())
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 600, height: 800 })
  await page.goto(
    `/#card/${encodeURIComponent(JSON.stringify({ componentName: 'CameraParameters', title: '相机参数' }))}`,
  )

  await expect(page.getByRole('tab', { name: '手动命令' })).toHaveAttribute('aria-selected', 'true')
  const content = page.getByRole('textbox', { name: '子命令内容' })
  await content.fill('0.55,62.292,-21.5')
  await expect(page.getByRole('button', { name: '发送命令', exact: true })).toBeDisabled()
  await page.screenshot({ animations: 'disabled', path: 'test-results/camera-command-light.png' })

  await page.getByRole('tab', { name: '连接', exact: true }).click()
  await page.getByRole('textbox', { name: '相机地址', exact: true }).fill('192.168.3.20')
  await expect(page.getByRole('textbox', { name: '服务器地址' })).toHaveAttribute('readonly', '')
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/camera-connection-light.png',
  })
  await page.getByRole('tab', { name: '手动命令' }).click()
  await expect(content).toHaveValue('0.55,62.292,-21.5')
  await page.getByRole('button', { name: '说明', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '相机命令说明' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: '自动标定' }).click()
  await page.getByRole('combobox', { name: '目标数目' }).press('Enter')
  await page.getByRole('option', { name: '双目标', exact: true }).click()
  await expect(page.locator('.cal-target-group')).toHaveCount(2)
  await page.getByRole('tab', { name: '脚本注入' }).click()
  await expect(page.locator('.script-connection')).toContainText('192.168.3.20')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'camera-diagnostics-with-a-long-file-name.sh',
    mimeType: 'text/x-shellscript',
    buffer: Buffer.from('echo camera-ui-test'),
  })
  await expect(page.locator('.script-file-info strong')).toHaveText(
    'camera-diagnostics-with-a-long-file-name.sh',
  )
  await page.getByRole('button', { name: '注入并执行' }).click()
  await expect(page.getByRole('button', { name: '停止执行' })).toBeVisible()
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('camera-script-event', {
        detail: { type: 'output', text: 'Camera diagnostic output\n' + 'long-output-'.repeat(90) },
      }),
    ),
  )
  await page.getByRole('tab', { name: '连接', exact: true }).click()
  await expect(page.getByRole('tab', { name: '脚本注入' }).locator('.activity-dot')).toBeVisible()
  await expect(page.getByRole('textbox', { name: '相机地址', exact: true })).toBeDisabled()

  await page.evaluate(
    (snapshot) =>
      window.dispatchEvent(
        new CustomEvent('camera-calibration-state', {
          detail: { ...snapshot, phase: 'failed', reason: '测量通道已断开，请重新连接。' },
        }),
      ),
    createCalibrationSnapshot(),
  )

  for (const width of [380, 1000]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const name of ['连接', '手动命令', '自动标定', '脚本注入']) {
      await page.getByRole('tab', { name, exact: true }).click()
      const pane = page.getByRole('tabpanel', { name, exact: true })
      await expect(pane).toBeVisible()
      expect(
        await pane.evaluate((element) => element.scrollWidth - element.clientWidth),
      ).toBeLessThanOrEqual(1)
      if (name === '自动标定') {
        await expect(page.locator('.cal-target-group')).toHaveCount(2)
        await expect(page.locator('.cal-reason')).toHaveText('测量通道已断开，请重新连接。')
      }
      await page.screenshot({
        animations: 'disabled',
        path: `test-results/camera-${name}-${width}.png`,
      })
    }
  }
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.screenshot({ animations: 'disabled', path: 'test-results/camera-script-dark.png' })
  await page.getByRole('tab', { name: '自动标定' }).click()
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/camera-calibration-dark.png',
  })
  await page.setViewportSize({ width: 600, height: 420 })
  await expect(page.getByRole('button', { name: '开始标定', exact: true })).toBeInViewport()
  await page.locator('.calibration-pane .parameter-scroll').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByRole('button', { name: '开始标定', exact: true })).toBeInViewport()
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/camera-calibration-compact.png',
  })
  expect(errors).toEqual([])
})

test('keeps the default English interface usable in a narrow panel', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 760 })
  await page.goto(
    `/#card/${encodeURIComponent(JSON.stringify({ componentName: 'CameraParameters', title: 'Camera Parameters' }))}`,
  )
  for (const name of ['Connection', 'Commands', 'Auto Calibration', 'Script Injection']) {
    await page.getByRole('tab', { name, exact: true }).click()
    const pane = page.getByRole('tabpanel', { name, exact: true })
    expect(
      await pane.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1)
  }
  await expect(page.getByRole('button', { name: 'Inject & Run' })).toBeInViewport()
  await page.screenshot({ animations: 'disabled', path: 'test-results/camera-script-english.png' })
})
