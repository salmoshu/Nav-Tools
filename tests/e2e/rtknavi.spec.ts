import { expect, test } from '@playwright/test'

test('starts RTKNAVI, displays a live solution and stops again', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const application = {
    id: 'rtknavi-e2e',
    name: 'RTKNAVI E2E',
    description: '',
    icon: 'satellite',
    accent: '#7c3aed',
    windowIds: ['gnsslib-rtknavi'],
  }
  await page.addInitScript((value) => {
    localStorage.setItem('nav-tools:locale', 'zh-CN')
    localStorage.setItem('nav-tools:custom-applications', JSON.stringify([value]))
    localStorage.setItem('nav-tools:selected-application', value.id)
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
    const emit = (channel: string, payload: unknown) => {
      for (const listener of listeners.get(channel) ?? []) listener({}, payload)
    }
    Object.assign(window, {
      __rtkNaviEmit: emit,
      __rtkNaviRequest: undefined,
    })
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: {
        on(channel: string, listener: (...args: unknown[]) => void) {
          const entries = listeners.get(channel) ?? new Set()
          entries.add(listener)
          listeners.set(channel, entries)
        },
        off(channel: string, listener: (...args: unknown[]) => void) {
          listeners.get(channel)?.delete(listener)
        },
        invoke: async () => undefined,
        send: () => undefined,
      },
    })
    const api: Record<string, (...args: never[]) => unknown> = {
      getAppVersion: async () => '1.8.0',
      getWindowState: async () => ({ maximized: false, alwaysOnTop: false }),
      rtkNaviStatus: async () => ({ runId: '', state: 'idle', outputPath: '' }),
      rtkNaviStart: async (request: { runId: string }) => {
        Reflect.set(window, '__rtkNaviRequest', request)
        queueMicrotask(() => {
          emit('rtknavi-solution', {
            runId: request.runId,
            epochs: 1,
            qualityCounts: { 1: 1 },
            solution: {
              time: '2005/04/02 00:00:30.000',
              latitude: 35.160874837,
              longitude: 139.613834647,
              height: 69.2997,
              quality: 1,
              satellites: 7,
              age: 1.5,
              ratio: 2.8,
            },
          })
        })
        return {
          runId: request.runId,
          state: 'running',
          outputPath: '/tmp/solution.pos',
          pid: 1234,
        }
      },
      rtkNaviStop: async (runId: string) => ({
        runId,
        state: 'stopped',
        outputPath: '/tmp/solution.pos',
      }),
    }
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: new Proxy(api, {
        get(target, property: string) {
          return target[property] ?? (() => Promise.resolve(undefined))
        },
      }),
    })
  }, application)
  await page.goto('/#app/rtknavi-e2e')

  const panel = page.locator('.rtknavi')
  await expect(panel).toBeVisible({ timeout: 20_000 })
  await panel.getByRole('tab', { name: '输入与选项' }).click()
  const modeField = panel.locator('.option-field').filter({ hasText: '定位模式' })
  await modeField.locator('.el-select').click()
  await page.getByRole('option', { name: '单点定位 (Single)', exact: true }).click()
  const roverInput = panel.locator('.stream-section').first().locator('.stream-path input')
  await roverInput.fill('/tmp/rover.rtcm3')

  await panel.getByRole('button', { name: '启动', exact: true }).click()
  await expect(panel.getByRole('tab', { name: '实时监控' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(panel.locator('.summary-card').first()).toContainText('1')
  await expect(panel.locator('.solution-grid')).toContainText('35.160874837°')
  await expect(panel.locator('.solution-grid')).toContainText('固定解')
  await expect(panel.locator('.run-state')).toHaveText('实时解算中')
  await panel.evaluate((element) => {
    element.scrollTop = 0
  })
  await page.screenshot({ path: 'test-results/rtknavi-monitor.png', fullPage: true })
  await panel.getByRole('tab', { name: '输入与选项' }).click()
  await expect(roverInput).toBeDisabled()
  await panel.getByRole('button', { name: '停止', exact: true }).click()
  await expect(roverInput).toBeEnabled()

  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 390, height: 844 })
  await panel.evaluate((element) => {
    element.style.width = '390px'
    element.style.maxWidth = '390px'
    element.scrollTop = 0
  })
  await expect(page.locator('html')).toHaveClass(/dark/)
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  )

  await page.reload()
  await expect(panel).toBeVisible({ timeout: 20_000 })
  await panel.getByRole('tab', { name: '输入与选项' }).click()
  await expect(roverInput).toHaveValue('/tmp/rover.rtcm3')
  expect(pageErrors).toEqual([])
})
