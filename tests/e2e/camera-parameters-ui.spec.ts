import { expect, test, type Page } from '@playwright/test'
import { createCalibrationSnapshot } from '../../src/core/camera/CameraCalibrationTypes'

interface ScriptRequestRecord {
  localPaths: string[]
  timeoutS: number
}

async function mockScriptSelection(page: Page, paths: string[]): Promise<void> {
  await page.addInitScript((selectedPaths) => {
    localStorage.setItem('nav-tools:locale', 'zh-CN')
    localStorage.setItem('nav-tools:theme', 'system')
    Object.defineProperty(window, 'cameraScriptRequests', { value: [] })
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
        getAppVersion: async () => '1.7.22',
        getWindowState: async () => ({ maximized: false, alwaysOnTop: false }),
        setUpdaterPrefs() {},
        openFileDialog: async () => selectedPaths,
        cameraScriptRun: async (request: ScriptRequestRecord) => {
          const target = window as unknown as { cameraScriptRequests: ScriptRequestRecord[] }
          target.cameraScriptRequests.push(request)
          window.dispatchEvent(
            new CustomEvent('camera-script-event', {
              detail: { type: 'state', state: 'success', detail: 'completed' },
            }),
          )
          return { ok: true }
        },
      },
    })
  }, paths)
}

async function scriptRequests(page: Page): Promise<ScriptRequestRecord[]> {
  return page.evaluate(() =>
    (window as unknown as { cameraScriptRequests: ScriptRequestRecord[] }).cameraScriptRequests.map(
      (request) => ({ localPaths: request.localPaths, timeoutS: request.timeoutS }),
    ),
  )
}

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
        openFileDialog: async () => [
          'C:\\camera-tools\\scripts\\camera-diagnostics-with-a-long-file-name.sh',
        ],
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

  await expect(page.getByRole('tab', { name: '连接', exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: '手动命令' }).click()
  await expect(content).toHaveValue('0.55,62.292,-21.5')
  await page.getByRole('button', { name: '说明', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '相机命令说明' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: '自动标定' }).click()
  await page.getByRole('combobox', { name: '目标数目' }).press('Enter')
  await page.getByRole('option', { name: '双目标', exact: true }).click()
  await expect(page.locator('.cal-target-group')).toHaveCount(2)
  const firstTarget = page.locator('.cal-target-group').first()
  const azimuthFrom = firstTarget.locator('input[aria-label="角度 From (°)"]')
  const azimuthTo = firstTarget.locator('input[aria-label="角度 To (°)"]')
  await expect(azimuthFrom).toHaveValue('0.0')
  await expect(azimuthTo).toHaveValue('90.0')
  await azimuthFrom.fill('-10.5')
  await azimuthTo.fill('10.5')
  await expect(azimuthFrom).toHaveValue('-10.5')
  await expect(azimuthTo).toHaveValue('10.5')
  await firstTarget.getByRole('button', { name: '表盘', exact: true }).click()
  const dial = page.locator('.azimuth-dial')
  const sector = dial.locator('.azimuth-sector')
  const startHandle = dial.locator('.azimuth-handle--start')
  const endHandle = dial.locator('.azimuth-handle--end')
  await expect(startHandle).toHaveAttribute('aria-valuenow', '-10.5')
  await expect(endHandle).toHaveAttribute('aria-valuenow', '10.5')
  await startHandle.press('ArrowRight')
  await expect(azimuthFrom).toHaveValue('-5.0')
  await sector.press('ArrowRight')
  await expect(azimuthFrom).toHaveValue('0.0')
  await expect(azimuthTo).toHaveValue('15.0')
  await expect(dial).toBeVisible()
  await page.waitForTimeout(300)

  const dialBounds = (await dial.locator('svg').boundingBox())!
  const dialPoint = (angle: number, radius: number) => ({
    x: dialBounds.x + (dialBounds.width * (120 + radius * Math.sin((angle * Math.PI) / 180))) / 240,
    y:
      dialBounds.y + (dialBounds.height * (120 - radius * Math.cos((angle * Math.PI) / 180))) / 240,
  })
  const dragStart = dialPoint(0, 42)
  const dragEnd = dialPoint(20, 42)
  await page.mouse.move(dragStart.x, dragStart.y)
  await page.mouse.down()
  await page.mouse.move(dragEnd.x, dragEnd.y, { steps: 8 })
  await page.mouse.up()
  await expect(azimuthFrom).toHaveValue('20.0')
  await expect(azimuthTo).toHaveValue('35.0')

  const endBounds = (await endHandle.boundingBox())!
  const resizeEnd = dialPoint(60, 82)
  await page.mouse.move(endBounds.x + endBounds.width / 2, endBounds.y + endBounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(resizeEnd.x, resizeEnd.y, { steps: 8 })
  await page.mouse.up()
  await expect(azimuthFrom).toHaveValue('20.0')
  expect(Number(await azimuthTo.inputValue())).toBeCloseTo(60, 0)

  await endHandle.press('End')
  await expect(azimuthTo).toHaveValue('180.0')
  await sector.press('ArrowRight')
  await expect(azimuthFrom).toHaveValue('20.0')
  await expect(azimuthTo).toHaveValue('180.0')
  await startHandle.press('Home')
  await expect(azimuthFrom).toHaveValue('-180.0')
  await sector.press('ArrowLeft')
  await expect(azimuthTo).toHaveValue('180.0')
  await page.keyboard.press('Escape')
  await azimuthFrom.fill('-10.5')
  await azimuthTo.fill('10.5')
  const secondTarget = page.locator('.cal-target-group').nth(1)
  await expect(secondTarget.locator('input[aria-label="角度 From (°)"]')).toHaveValue('-90.0')
  await expect(secondTarget.locator('input[aria-label="角度 To (°)"]')).toHaveValue('0.0')
  await page.getByRole('tab', { name: '脚本注入' }).click()
  await expect(page.locator('.script-connection')).toContainText('192.168.3.14')
  await page.getByRole('button', { name: '选择脚本' }).click()
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
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useConsole } = await import('/src/composables/flow/useConsole.ts')
        return useConsole(true).totalCount.value
      }),
    )
    .toBeGreaterThan(0)
  await expect(page.getByRole('tab', { name: '脚本注入' }).locator('.activity-dot')).toBeVisible()

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
    for (const name of ['手动命令', '自动标定', '脚本注入']) {
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

test('keeps the calibration history table at its latest row while running', async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 840 })
  const history = Array.from({ length: 12 }, (_, index) => ({
    offset: -20 + index * 0.1,
    distances: [2 + index * 0.001],
    errorsCm: [index * 0.1],
    accepted: true,
    verification: false,
  }))
  const snapshot = {
    ...createCalibrationSnapshot(),
    observing: true,
    busy: true,
    phase: 'sampling' as const,
    history,
  }
  await page.addInitScript((initial) => {
    localStorage.setItem('nav-tools:locale', 'zh-CN')
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
        getAppVersion: async () => '1.8.11',
        getWindowState: async () => ({ maximized: false, alwaysOnTop: false }),
        setUpdaterPrefs() {},
        cameraCalibrationSnapshot: async () => initial,
      },
    })
  }, snapshot)
  await page.goto(
    `/#card/${encodeURIComponent(JSON.stringify({ componentName: 'CameraParameters', title: '相机参数' }))}`,
  )
  await page.getByRole('tab', { name: '自动标定', exact: true }).click()
  const rows = page.locator('.cal-history .el-table__body tbody tr')
  const scroller = page.locator('.cal-history .el-table__body-wrapper .el-scrollbar__wrap')
  await expect(rows).toHaveCount(12)
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  await scroller.evaluate((el) => {
    el.scrollTop = 0
  })
  await page.evaluate(
    (state) => window.dispatchEvent(new CustomEvent('camera-calibration-state', { detail: state })),
    {
      ...snapshot,
      history: [
        ...history,
        { offset: -18.8, distances: [2.012], errorsCm: [1.2], accepted: true, verification: false },
      ],
    },
  )
  await expect(rows).toHaveCount(13)
  await expect
    .poll(() =>
      scroller.evaluate((el) => Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) <= 1),
    )
    .toBe(true)
  await expect(rows.last()).toContainText('+0.012 m')
  const accepted = rows.last().locator('.el-table-fixed-column--right')
  await accepted.hover()
  expect(await accepted.evaluate((cell) => {
    const context = document.createElement('canvas').getContext('2d')!
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = getComputedStyle(cell).backgroundColor
    context.fillRect(0, 0, 1, 1)
    return context.getImageData(0, 0, 1, 1).data[3]
  })).toBe(255)
})

test('keeps the default English interface usable in a narrow panel', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 760 })
  await page.goto(
    `/#card/${encodeURIComponent(JSON.stringify({ componentName: 'CameraParameters', title: 'Camera Parameters' }))}`,
  )
  for (const name of ['Commands', 'Auto Calibration', 'Script Injection']) {
    await page.getByRole('tab', { name, exact: true }).click()
    const pane = page.getByRole('tabpanel', { name, exact: true })
    expect(
      await pane.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1)
  }
  await expect(page.getByRole('button', { name: 'Inject & Run' })).toBeInViewport()
  await page.screenshot({ animations: 'disabled', path: 'test-results/camera-script-english.png' })
})

test('selects multiple shell scripts and sends them together only after clicking run', async ({
  page,
}) => {
  const paths = ['C:\\camera-tools\\first.sh', 'D:\\diagnostics\\second.sh']
  await mockScriptSelection(page, paths)
  await page.goto(
    `/#card/${encodeURIComponent(JSON.stringify({ componentName: 'CameraParameters', title: '相机参数' }))}`,
  )
  await page.getByRole('tab', { name: '脚本注入' }).click()
  await page.getByRole('button', { name: '选择脚本' }).click()

  await expect(page.locator('.script-file-info strong')).toHaveText('first.sh、second.sh')
  expect(await scriptRequests(page)).toEqual([])
  await page.getByRole('button', { name: '注入并执行' }).click()
  await expect.poll(async () => (await scriptRequests(page)).length).toBe(1)
  expect((await scriptRequests(page))[0]).toMatchObject({ localPaths: paths, timeoutS: 120 })
})

test('automatically runs a matching host and lidar package pair without a deployment button', async ({
  page,
}) => {
  const paths = [
    'C:\\Users\\Salmos\\Desktop\\E-Wagon固件\\0.5.3\\e-wagon-lidar-1.3.2-aarch64-20261026_0846.tar.gz',
    'C:\\Users\\Salmos\\Desktop\\E-Wagon固件\\0.5.3\\e-wagon-0.5.3-aarch64-20261026_0845.tar.gz',
  ]
  await mockScriptSelection(page, paths)
  await page.goto(
    `/#card/${encodeURIComponent(JSON.stringify({ componentName: 'CameraParameters', title: '相机参数' }))}`,
  )
  await page.getByRole('tab', { name: '脚本注入' }).click()
  await expect(page.getByRole('button', { name: /部署/ })).toHaveCount(0)
  await page.getByRole('button', { name: '选择脚本' }).click()

  await expect.poll(async () => (await scriptRequests(page)).length).toBe(1)
  expect((await scriptRequests(page))[0]).toMatchObject({ localPaths: paths, timeoutS: 120 })
  expect((await scriptRequests(page))[0]).not.toHaveProperty('localPath')
  await expect(page.locator('.script-file-info strong')).toContainText('e-wagon-0.5.3')
  await expect(page.locator('.script-file-info strong')).toContainText('e-wagon-lidar-1.3.2')
  await expect(page.locator('.script-card .cal-phase')).toHaveText('执行成功')
})

test('acquires and releases its own observation lease when another observer is active', async ({
  page,
}) => {
  await page.addInitScript(
    (snapshot) => {
      localStorage.setItem('nav-tools:locale', 'zh-CN')
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
      Reflect.set(window, '__observeCalls', [])
      Reflect.set(window, '__closeCalls', [])
      Object.defineProperty(window, 'ipcRenderer', {
        value: { on() {}, off() {}, send() {}, invoke: async () => undefined },
      })
      Object.defineProperty(window, 'electronAPI', {
        value: {
          getAppVersion: async () => '1.8.8',
          getWindowState: async () => ({ maximized: false, alwaysOnTop: false }),
          setUpdaterPrefs() {},
          cameraCalibrationAccess: async () => ({
            host: '192.168.3.14',
            port: 22,
            username: 'root',
            hasPassword: true,
          }),
          cameraCalibrationSnapshot: async () => snapshot,
          cameraCalibrationReadParams: async () => ({
            height: 0.55,
            fov: 1.087,
            thetaOffset: -21.5,
          }),
          cameraCalibrationObserve: async () => {
            ;(Reflect.get(window, '__observeCalls') as unknown[]).push(true)
            return snapshot
          },
          cameraCalibrationClose: async () => {
            ;(Reflect.get(window, '__closeCalls') as unknown[]).push(true)
            return snapshot
          },
        },
      })
    },
    { ...createCalibrationSnapshot(), observing: true, phase: 'observing' },
  )
  await page.goto(
    `/#card/${encodeURIComponent(JSON.stringify({ componentName: 'CameraParameters', title: '相机参数' }))}`,
  )
  await page.evaluate(async () => {
    const { useDevice } = await import('/src/hooks/useDevice.ts')
    const { globalDevice } = useDevice()
    globalDevice.value = {
      type: 'network',
      protocol: 'tcp',
      host: '127.0.0.1',
      port: 8080,
      connected: true,
    }
  })

  await expect(page.getByRole('tab', { name: '手动命令' })).toHaveAttribute('aria-selected', 'true')
  expect(await page.evaluate(() => Reflect.get(window, '__closeCalls').length)).toBe(0)
  await page.getByRole('tab', { name: '自动标定', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__observeCalls').length)).toBe(1)
  await page.getByRole('tab', { name: '手动命令', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__closeCalls').length)).toBe(1)
})

test('shows calibration start failures in an error dialog', async ({ page }) => {
  await page.addInitScript(
    (snapshot) => {
      localStorage.setItem('nav-tools:locale', 'zh-CN')
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
      Object.defineProperty(window, 'ipcRenderer', {
        value: { on() {}, off() {}, send() {}, invoke: async () => undefined },
      })
      Object.defineProperty(window, 'electronAPI', {
        value: {
          getAppVersion: async () => '1.8.8',
          getWindowState: async () => ({ maximized: false, alwaysOnTop: false }),
          setUpdaterPrefs() {},
          cameraCalibrationAccess: async () => ({
            host: '192.168.3.14',
            port: 22,
            username: 'root',
            hasPassword: true,
          }),
          cameraCalibrationSnapshot: async () => snapshot,
          cameraCalibrationReadParams: async () => ({
            height: 0.55,
            fov: 1.087,
            thetaOffset: -21.5,
          }),
          cameraCalibrationObserve: async () => snapshot,
          cameraCalibrationStart: async () => {
            throw new Error('模拟标定启动失败')
          },
        },
      })
    },
    { ...createCalibrationSnapshot(), observing: true, phase: 'observing' },
  )
  await page.goto(
    `/#card/${encodeURIComponent(JSON.stringify({ componentName: 'CameraParameters', title: '相机参数' }))}`,
  )
  await page.evaluate(async () => {
    const { useDevice } = await import('/src/hooks/useDevice.ts')
    const { globalDevice } = useDevice()
    globalDevice.value = {
      type: 'network',
      protocol: 'tcp',
      host: '127.0.0.1',
      port: 8080,
      connected: true,
    }
  })
  await page.getByRole('tab', { name: '自动标定', exact: true }).click()
  await page.getByRole('button', { name: '开始标定', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '标定失败', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('模拟标定启动失败')
})

test('remembers both calibration angle ranges across reloads and target count changes', async ({
  page,
}) => {
  await mockScriptSelection(page, [])
  await page.goto(
    `/#card/${encodeURIComponent(JSON.stringify({ componentName: 'CameraParameters', title: '相机参数' }))}`,
  )

  const calibration = page.getByRole('tab', { name: '自动标定', exact: true })
  const targets = page.locator('.cal-target-group')
  const from = (index: number) => targets.nth(index).getByLabel('角度 From (°)', { exact: true })
  const to = (index: number) => targets.nth(index).getByLabel('角度 To (°)', { exact: true })

  await calibration.click()
  await from(0).fill('-20')
  await to(0).fill('0')
  await from(1).fill('0')
  await to(1).fill('20')
  await to(1).blur()

  await page.getByRole('tab', { name: '手动命令', exact: true }).click()
  await page.getByRole('textbox', { name: '子命令内容', exact: true }).fill('0.55,62.292,-20')
  await page.reload()
  await expect(page.getByRole('textbox', { name: '子命令内容', exact: true })).toHaveValue(
    '0.55,62.292,-20',
  )
  await calibration.click()
  await expect(from(0)).toHaveValue('-20.0')
  await expect(to(0)).toHaveValue('0.0')
  await expect(from(1)).toHaveValue('0.0')
  await expect(to(1)).toHaveValue('20.0')

  const count = page.getByRole('combobox', { name: '目标数目' })
  await count.press('Enter')
  await page.getByRole('option', { name: '单目标', exact: true }).click()
  await expect(targets).toHaveCount(1)
  await page.reload()
  await calibration.click()
  await expect(targets).toHaveCount(1)
  await expect(from(0)).toHaveValue('-20.0')
  await expect(to(0)).toHaveValue('0.0')
  await count.press('Enter')
  await page.getByRole('option', { name: '双目标', exact: true }).click()
  await expect(from(1)).toHaveValue('0.0')
  await expect(to(1)).toHaveValue('20.0')
})

test('remembers independent content for each camera sub-command', async ({ page }) => {
  await mockScriptSelection(page, [])
  await page.goto(
    `/#card/${encodeURIComponent(JSON.stringify({ componentName: 'CameraParameters', title: '相机参数' }))}`,
  )
  const selector = page.getByRole('combobox', { name: '子命令类型', exact: true })
  const content = page.getByRole('textbox', { name: '子命令内容', exact: true })

  async function selectCommand(name: string) {
    await selector.press('Enter')
    await page.getByRole('option', { name, exact: true }).click()
  }

  await content.fill('0.55,62.292,-20')
  await selectCommand('set_range')
  await expect(content).toHaveValue('1.000,1.500')
  await content.fill('2.000,3.000')
  await selectCommand('set_params')
  await expect(content).toHaveValue('0.55,62.292,-20')
  await selectCommand('read_params')
  await expect(content).toHaveValue('')
  await selectCommand('set_range')
  await expect(content).toHaveValue('2.000,3.000')

  await page.reload()
  await selectCommand('set_range')
  await expect(content).toHaveValue('2.000,3.000')
  await selectCommand('set_params')
  await expect(content).toHaveValue('0.55,62.292,-20')
  await selectCommand('read_params')
  await expect(content).toHaveValue('')
})
