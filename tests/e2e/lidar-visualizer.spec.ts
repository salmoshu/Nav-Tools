// LiDAR 可视化端到端验证：加载真实板上 Trace 分片 → 回放 → 场景/评分/曲线渲染。
// 回放控制与诊断信息全部位于工具栏时间轴（LidarTimelineControl，对齐 NMEA 回放形态），
// 无独立回放面板；文件接入走数据接入对话框的统一文件输入。
// 运行于 Web 构建（playwright webServer 自动启动 pnpm run dev:web）。
import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(here, '../fixtures/lidar/trace-selftest.mcap')

const LIDAR_APP = {
  id: 'lidar-e2e',
  name: 'LiDAR E2E',
  description: 'LiDAR visualizer end-to-end audit',
  icon: 'radar',
  accent: '#06b6d4',
  windowIds: ['lidar-scene', 'lidar-scores', 'lidar-plot', 'lidar-inspector'],
}

const GNSS_APP = {
  id: 'gnss-e2e',
  name: 'GNSS',
  description: 'GNSS timeline regression workspace',
  icon: 'position',
  accent: '#0ea5e9',
  windowIds: ['gnss-map', 'raw-messages'],
}

async function openLidarApp(
  page: Page,
  application = LIDAR_APP,
  applications = [application],
): Promise<void> {
  await page.addInitScript(
    ({ application, applications }) => {
      localStorage.setItem('nav-tools:custom-applications', JSON.stringify(applications))
      localStorage.setItem('nav-tools:selected-application', application.id)
    },
    { application, applications },
  )
  await page.goto('/')
  // 选择器浮层可能在应用异步初始化完成后才挂载，等它出现并关闭；
  // 若确实没有弹出（如已选应用的直开路径）则跳过
  const closeSelector = page.getByRole('button', {
    name: /关闭应用选择器|Close Application Selector/i,
  })
  await closeSelector.click({ timeout: 12_000 }).catch(() => {})
  await expect(page.locator('.layout-component')).toHaveCount(application.windowIds.length, {
    timeout: 20_000,
  })
}

async function loadFixture(page: Page): Promise<void> {
  // 经工具栏 Input 对话框的文件输入加载。
  await page
    .getByTitle(/Input|输入/)
    .first()
    .click()
  const dialog = page.locator('.data-input-dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await page.getByRole('tab', { name: /文件输入|File Input/ }).click()
  const fileChooser = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: /选择文件|Select File/ }).click()
  await (await fileChooser).setFiles(fixturePath)
  // 确认后对话框关闭，时间轴出现即就绪
  await dialog.getByRole('button', { name: /确认|Confirm|OK/ }).click()
  await expect(page.locator('.lidar-timeline')).toBeVisible({ timeout: 30_000 })
}

async function readSceneView(page: Page) {
  return page.evaluate(() => {
    const renderer = Reflect.get(window, '__lidarSceneRenderer')
    if (!renderer) throw new Error('LiDAR scene renderer is unavailable')
    return renderer.getViewState() as {
      position: [number, number, number]
      target: [number, number, number]
      distance: number
    }
  })
}

async function readVisiblePlotPlayhead(page: Page) {
  return page.evaluate(() => {
    const chart = document.querySelector('.lidar-plot .plot-chart')
    const canvas = chart?.querySelector('canvas')
    if (!(chart instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('LiDAR plot canvas is unavailable')
    }
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('LiDAR plot canvas is not two-dimensional')

    const { width, height } = canvas
    const pixels = context.getImageData(0, 0, width, height).data
    let markerPixel = -1
    let markerPixelCount = 0
    for (let x = 0; x < width; x++) {
      let count = 0
      for (let y = 0; y < height; y++) {
        const offset = (y * width + x) * 4
        if (
          Math.abs(pixels[offset] - 249) <= 12 &&
          Math.abs(pixels[offset + 1] - 115) <= 12 &&
          Math.abs(pixels[offset + 2] - 22) <= 12 &&
          pixels[offset + 3] > 200
        ) {
          count++
        }
      }
      if (count > markerPixelCount) {
        markerPixelCount = count
        markerPixel = x
      }
    }

    return {
      markerPixel: markerPixel * (chart.clientWidth / width),
      markerPixelCount,
      chartWidth: chart.clientWidth,
    }
  })
}

test('loads a real on-board trace and renders all four panels', async ({ page }) => {
  await openLidarApp(page)
  await loadFixture(page)

  // 诊断信息收在工具栏时间轴的信息弹层：12 个通道全部出现在话题表
  await page.getByTitle(/会话与话题|Session & topics/).click()
  await expect(page.locator('.lidar-info-popover')).toBeVisible()
  await expect(page.locator('.lidar-info-popover .el-table__row')).toHaveCount(12)

  // 时间轴帧计数（当前帧 / 总帧）作为就绪信号
  await expect(page.locator('.lidar-timeline .timeline-epoch')).toContainText('/')
})

test('scene renders the point cloud and decodes dwa_scores while stepping', async ({ page }) => {
  await openLidarApp(page)
  await loadFixture(page)

  // 工具栏时间轴逐帧步进（按钮 0=播放 1=上一帧 2=下一帧）
  const nextFrame = page.locator('.lidar-timeline .timeline-button').nth(2)
  for (let i = 0; i < 5; i++) {
    await nextFrame.click()
    await page.waitForTimeout(150)
  }

  // 评分面板：当前帧的候选表有数据行
  await expect(page.locator('.lidar-scores .el-table__row').first()).toBeVisible({
    timeout: 10_000,
  })

  // 场景画布已渲染（three.js canvas 非空白：有非透明像素）
  const hasPixels = await page.evaluate(() => {
    const canvas = document.querySelector('.scene-canvas') as HTMLCanvasElement | null
    if (!canvas) return false
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return false
    const pixels = new Uint8Array(4 * 400)
    gl.readPixels(
      Math.floor(gl.drawingBufferWidth / 2) - 10,
      Math.floor(gl.drawingBufferHeight / 2) - 10,
      20,
      20,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    )
    return pixels.some((value, index) => index % 4 === 3 && value > 0)
  })
  expect(hasPixels).toBe(true)

  // 截图存档供人工核对（场景 + 整体布局）
  const scene = page.locator('.lidar-scene').first()
  await scene.screenshot({ path: 'test-results/lidar-scene-frame.png' })

  // 播放 2s 后再截一张（含工具栏时间轴的整窗）
  await page.locator('.lidar-timeline .timeline-button').first().click()
  await page.waitForTimeout(2000)
  await page.locator('.lidar-timeline .timeline-button').first().click()
  await scene.screenshot({ path: 'test-results/lidar-scene-playback.png' })
  await page.screenshot({ path: 'test-results/lidar-app-playback.png', fullPage: true })

  // 检查面板：默认话题可切换且能渲染 JSON 树
  await page.locator('.lidar-inspector .el-select').click()
  await page.locator('.el-select-dropdown__item:has-text("/dwa_scores")').first().click()
  await expect(page.locator('.lidar-inspector .json-node').first()).toBeVisible()
})

test('scene camera follows Foxglove pan, orbit, and zoom controls', async ({ page }) => {
  await openLidarApp(page)
  await loadFixture(page)

  const canvas = page.locator('.scene-canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('LiDAR scene canvas has no bounds')
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await expect(page.locator('.scene-controls-hint')).toContainText(/Shift|右键/)
  await page.waitForTimeout(400)
  const fitted = await readSceneView(page)

  await page.mouse.move(center.x, center.y)
  await page.mouse.down({ button: 'left' })
  await page.mouse.move(center.x + 70, center.y + 24, { steps: 5 })
  await expect(page.locator('.scene-crosshair')).toBeVisible()
  await page.mouse.up({ button: 'left' })
  await page.waitForTimeout(500)
  const panned = await readSceneView(page)
  expect(
    Math.hypot(panned.target[0] - fitted.target[0], panned.target[1] - fitted.target[1]),
  ).toBeGreaterThan(0.05)
  expect(Math.abs(panned.target[2])).toBeLessThan(0.001)
  await expect(page.locator('.scene-crosshair')).toBeHidden()

  await canvas.focus()
  await page.keyboard.press('1')
  await page.waitForTimeout(150)
  const beforeOrbit = await readSceneView(page)
  await page.mouse.move(center.x, center.y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(center.x + 60, center.y - 30, { steps: 5 })
  await page.mouse.up({ button: 'right' })
  await page.waitForTimeout(500)
  const orbited = await readSceneView(page)
  expect(orbited.target).toEqual(beforeOrbit.target)
  expect(
    Math.hypot(...orbited.position.map((value, index) => value - beforeOrbit.position[index])),
  ).toBeGreaterThan(0.05)
  expect(orbited.distance).toBeCloseTo(beforeOrbit.distance, 3)

  await page.mouse.move(center.x, center.y)
  await page.mouse.wheel(0, -420)
  await page.waitForTimeout(500)
  const zoomed = await readSceneView(page)
  expect(zoomed.distance).toBeLessThan(orbited.distance)

  await canvas.focus()
  await page.keyboard.press('1')
  await page.waitForTimeout(150)
  const beforeVerticalPan = await readSceneView(page)
  await page.keyboard.down('Alt')
  await page.mouse.move(center.x, center.y)
  await page.mouse.down({ button: 'left' })
  await page.mouse.move(center.x, center.y + 60, { steps: 5 })
  await page.mouse.up({ button: 'left' })
  await page.keyboard.up('Alt')
  await page.waitForTimeout(500)
  const verticalPanned = await readSceneView(page)
  expect(Math.abs(verticalPanned.target[2] - beforeVerticalPan.target[2])).toBeGreaterThan(0.05)

  await canvas.focus()
  const beforeKeyboardPan = await readSceneView(page)
  await page.keyboard.press('w')
  await page.waitForTimeout(300)
  const keyboardPanned = await readSceneView(page)
  expect(
    Math.hypot(
      keyboardPanned.target[0] - beforeKeyboardPan.target[0],
      keyboardPanned.target[1] - beforeKeyboardPan.target[1],
    ),
  ).toBeGreaterThan(0.01)
})

test('file input detects MCAP and bypasses text parser and timestamp settings', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'nav-tools:data-source-settings',
      JSON.stringify({
        activeSource: 'file',
        file: { parser: 'regex', regexPattern: '[', timeTag: true },
      }),
    )
  })
  await openLidarApp(page)

  // MCAP 和文本共用文件输入，不再提供独立录像页签。
  await page
    .getByTitle(/Input|输入/)
    .first()
    .click()
  await expect(page.locator('.data-input-dialog')).toBeVisible({ timeout: 10_000 })
  await page.getByRole('tab', { name: /文件输入|File Input/ }).click()
  await expect(page.getByRole('tab', { name: /LiDAR 录像|LiDAR Recording/ })).toHaveCount(0)

  // 页签内含路径输入与选择按钮（仅当前激活页签的输入框可见）
  const dialog = page.locator('.data-input-dialog')
  await expect(dialog.locator('.el-input__inner:visible').first()).toBeVisible()

  await expect(dialog.locator('.parser-card:visible')).toBeVisible()
  const fileChooser = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: /选择文件|Select File/ }).click()
  await (await fileChooser).setFiles(fixturePath)
  await expect(dialog.locator('.mcap-hint')).toBeVisible()
  await expect(dialog.locator('.parser-card:visible')).toHaveCount(0)
  await expect(dialog.locator('.time-tag-options')).toHaveCount(0)
  await page.screenshot({ animations: 'disabled', path: 'test-results/file-input-mcap.png' })
  // 确认后对话框关闭，时间轴出现且帧计数就绪
  await dialog.getByRole('button', { name: /确认|Confirm|OK/ }).click()
  await expect(page.locator('.lidar-timeline')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.lidar-timeline .timeline-epoch')).toContainText('/')
})

test('file input loads multiple MCAP parts and rejects mixed selections', async ({ page }) => {
  await openLidarApp(page)
  await page
    .getByTitle(/Input|输入/)
    .first()
    .click()
  await page.getByRole('tab', { name: /文件输入|File Input/ }).click()
  const dialog = page.locator('.data-input-dialog')
  const buffer = readFileSync(fixturePath)
  let fileChooser = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: /选择文件|Select File/ }).click()
  await (
    await fileChooser
  ).setFiles([
    { name: 'part_1.mcap', mimeType: 'application/octet-stream', buffer },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('notes') },
  ])
  await expect(page.locator('.el-message--warning')).toContainText(/文本文件|one text file/)
  await expect(dialog.getByRole('textbox', { name: /文件路径|File Path/ })).toHaveValue('')
  fileChooser = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: /选择文件|Select File/ }).click()
  await (
    await fileChooser
  ).setFiles([
    { name: 'part_1.mcap', mimeType: 'application/octet-stream', buffer },
    { name: 'part_2.mcap', mimeType: 'application/octet-stream', buffer },
  ])
  await expect(dialog.locator('.mcap-hint')).toContainText(/2 个分片|2 parts selected/)
  await dialog.getByRole('button', { name: /确认|Confirm|OK/ }).click()
  await expect(page.locator('.lidar-timeline')).toBeVisible({ timeout: 30_000 })
  await expect(dialog).toBeHidden()
  await page
    .getByTitle(/Input|输入/)
    .first()
    .click()
  await expect(dialog.getByRole('textbox', { name: /文件路径|File Path/ })).toHaveValue(
    'part_1.mcap',
  )
  await expect(dialog.locator('.mcap-hint')).toContainText(/2 个分片|2 parts selected/)
})

test('a recent recording reopens all parts and an edited path uses the new file', async ({
  page,
}) => {
  const parts = ['C:/recordings/part_1.mcap', 'C:/recordings/part_2.mcap']
  await page.addInitScript(
    ({ bytes, paths }) => {
      localStorage.setItem(
        'nav-tools:lidar:recent-mcap-files',
        JSON.stringify([
          { path: paths[0], paths, name: 'session-test', sizeBytes: bytes.length * 2, openedAt: 1 },
        ]),
      )
      const readPaths: string[] = []
      Object.defineProperty(window, 'mcapReadPaths', { value: readPaths })
      Object.defineProperty(window, 'electronAPI', {
        value: {
          getAppVersion: async () => '1.5.3',
          getWindowState: async () => ({ maximized: false, alwaysOnTop: false }),
          setUpdaterPrefs() {},
          getPathForFile: (file: File) => file.name,
          lidarMcapReadFile: async (path: string) => {
            readPaths.push(path)
            return { data: bytes }
          },
        },
      })
    },
    { bytes: [...readFileSync(fixturePath)], paths: parts },
  )
  await openLidarApp(page)
  await page
    .getByTitle(/Input|输入/)
    .first()
    .click()
  const dialog = page.locator('.data-input-dialog')
  await page.getByRole('tab', { name: /文件输入|File Input/ }).click()
  await dialog.locator('.mcap-recent-item').click()
  await dialog.getByRole('button', { name: /确认|Confirm|OK/ }).click()
  await expect(page.locator('.lidar-timeline')).toBeVisible({ timeout: 30_000 })
  expect(await page.evaluate(() => Reflect.get(window, 'mcapReadPaths'))).toEqual(parts)

  await page
    .getByTitle(/Input|输入/)
    .first()
    .click()
  const fileChooser = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: /选择文件|Select File/ }).click()
  await (await fileChooser).setFiles(fixturePath)
  await dialog
    .getByRole('textbox', { name: /文件路径|File Path/ })
    .fill('C:/recordings/another.mcap')
  await dialog.getByRole('button', { name: /确认|Confirm|OK/ }).click()
  await expect(dialog).toBeHidden()
  expect(await page.evaluate(() => Reflect.get(window, 'mcapReadPaths'))).toEqual([
    ...parts,
    'C:/recordings/another.mcap',
  ])
})

test('switching from an MCAP selection back to text imports the text file', async ({ page }) => {
  await openLidarApp(page, { ...LIDAR_APP, windowIds: ['raw-messages'] })
  await page
    .getByTitle(/Input|输入/)
    .first()
    .click()
  await page.getByRole('tab', { name: /文件输入|File Input/ }).click()
  const dialog = page.locator('.data-input-dialog')
  let fileChooser = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: /选择文件|Select File/ }).click()
  await (await fileChooser).setFiles(fixturePath)
  await expect(dialog.locator('.mcap-hint')).toBeVisible()
  fileChooser = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: /选择文件|Select File/ }).click()
  await (
    await fileChooser
  ).setFiles({
    name: 'sample.log',
    mimeType: 'text/plain',
    buffer: Buffer.from('unified-file-input-log\n'),
  })
  await expect(dialog.locator('.mcap-hint')).toHaveCount(0)
  await expect(dialog.locator('.parser-card:visible')).toBeVisible()
  await dialog.getByRole('button', { name: /确认|Confirm|OK/ }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.message-content').first()).toContainText('unified-file-input-log')
  await expect(page.locator('.lidar-timeline')).toHaveCount(0)
})

test('switching from LiDAR MCAP to GNSS NMEA keeps only one toolbar timeline', async ({ page }) => {
  await openLidarApp(page, LIDAR_APP, [LIDAR_APP, GNSS_APP])
  await loadFixture(page)

  await page.locator('.application-button').click()
  await page.locator('[data-application-id="gnss-e2e"]').click()
  await expect(page.locator('.layout-component')).toHaveCount(GNSS_APP.windowIds.length)
  await expect(page.locator('.lidar-timeline')).toHaveCount(0)

  await page
    .getByTitle(/Input|输入/)
    .first()
    .click()
  const dialog = page.locator('.data-input-dialog')
  await page.getByRole('tab', { name: /文件输入|File Input/ }).click()
  const fileChooser = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: /选择文件|Select File/ }).click()
  await (
    await fileChooser
  ).setFiles({
    name: 'gnss.nmea',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47\n' +
        '$GPGGA,123520,4807.039,N,01131.001,E,1,08,0.9,545.5,M,46.9,M,,\n',
    ),
  })
  await dialog.getByRole('button', { name: /确认|Confirm|OK/ }).click()

  await expect(page.locator('.file-timeline')).toBeVisible()
  await expect(
    page.locator('.toolbar-content .file-timeline, .toolbar-content .lidar-timeline'),
  ).toHaveCount(1)
  await expect(page.locator('.lidar-timeline')).toHaveCount(0)
})

test('playback advances the playhead from the toolbar timeline', async ({ page }) => {
  await openLidarApp(page)
  await loadFixture(page)

  // 逐帧步进（确定性，不依赖 rAF）：帧计数前进
  const frameLabel = page.locator('.lidar-timeline .timeline-epoch')
  const beforeFrame = await frameLabel.textContent()
  await page.locator('.lidar-timeline .timeline-button').nth(2).click()
  await expect(frameLabel).not.toHaveText(beforeFrame ?? '')

  // 播放后时间前进（轮询，容忍无头浏览器 rAF 节流）
  const timeLabel = page.locator('.lidar-timeline .timeline-time')
  const before = await timeLabel.textContent()
  await page.locator('.lidar-timeline .timeline-button').first().click()
  await expect(timeLabel).not.toHaveText(before ?? '', { timeout: 8000 })

  // 曲线面板存在且渲染了 ECharts 画布
  await expect(page.locator('.lidar-plot canvas').first()).toBeVisible()
})

test('execution curves keep the timeline playhead visible inside the chart', async ({ page }) => {
  await openLidarApp(page)
  await loadFixture(page)

  const before = await readVisiblePlotPlayhead(page)
  expect(before.markerPixelCount).toBeGreaterThan(8)
  expect(before.markerPixel).toBeGreaterThanOrEqual(0)
  expect(before.markerPixel).toBeLessThanOrEqual(before.chartWidth)

  const nextFrame = page.locator('.lidar-timeline .timeline-button').nth(2)
  for (let index = 0; index < 5; index++) await nextFrame.click()
  await expect
    .poll(async () => (await readVisiblePlotPlayhead(page)).markerPixel)
    .toBeGreaterThan(before.markerPixel)

  const after = await readVisiblePlotPlayhead(page)
  expect(after.markerPixelCount).toBeGreaterThan(8)
  expect(after.markerPixel).toBeGreaterThan(before.markerPixel)
  expect(after.markerPixel).toBeLessThanOrEqual(after.chartWidth)
})

test('clicking an arbitrary execution-curve position seeks the shared playhead', async ({
  page,
}) => {
  await openLidarApp(page)
  await loadFixture(page)

  const chart = page.locator('.lidar-plot .plot-chart')
  const box = await chart.boundingBox()
  expect(box).not.toBeNull()
  const beforeTime = await page.locator('.lidar-timeline .timeline-time').textContent()

  await chart.click({ position: { x: box!.width * 0.7, y: box!.height * 0.55 } })

  await expect(page.locator('.lidar-timeline .timeline-time')).not.toHaveText(beforeTime ?? '')
  await expect
    .poll(async () => (await readVisiblePlotPlayhead(page)).markerPixel)
    .toBeGreaterThan(box!.width * 0.6)
})
