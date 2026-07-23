import { expect, test } from '@playwright/test'

test('opens the user application selector in the renderer', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('/')
  await expect(page.getByText('Nav-Tools', { exact: true })).toBeVisible()
  await expect(page.getByText('选择应用', { exact: true })).toBeVisible()
  await expect(page.getByText('GNSS', { exact: true })).toBeVisible()
  await expect(page.getByText('Motor', { exact: true })).toBeVisible()
  await expect(page.getByText('Camera', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '重置应用' }).click()
  await expect(page.locator('.selector-backdrop > .el-overlay.is-message-box')).toBeVisible()
  await expect(page.locator('.selector-backdrop > .el-overlay.is-message-box')).toHaveCSS(
    'z-index',
    '9000',
  )
  await expect(page.locator('.app-message-box')).toBeVisible()
  await expect(page.getByText('只保留默认的 GNSS、Motor 和 Camera 应用')).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'test-results/ui-audit-confirmation-dialog.png' })
  await page.keyboard.press('Escape')
  await expect(page.getByText('只保留默认的 GNSS、Motor 和 Camera 应用')).toBeHidden()
  await page.screenshot({ path: 'test-results/ui-audit-selector.png' })

  await page.getByRole('button', { name: '新建应用' }).click()
  const editor = page.getByRole('dialog', { name: '新建应用' })
  await expect(editor).toBeVisible()
  await expect(editor.getByRole('radiogroup', { name: '应用图标' }).locator('button')).toHaveCount(
    20,
  )

  await editor.locator('.el-color-picker__trigger').click()
  await expect(editor.locator('.application-color-picker-popper')).toBeVisible()
  expect(
    Number(
      await editor
        .locator('.application-color-picker-popper')
        .evaluate((element) => getComputedStyle(element).zIndex),
    ),
  ).toBeGreaterThan(8000)
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'test-results/ui-audit-color-picker.png' })
  await page.keyboard.press('Escape')
  await expect(editor.locator('.application-color-picker-popper')).toBeHidden()
  await editor.getByRole('button', { name: '取消' }).click()
  await expect(editor).toBeHidden()

  await page.getByRole('button', { name: '新建应用' }).click()
  await expect(editor).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(editor).toBeHidden()

  await page.getByRole('button', { name: '新建应用' }).click()
  await expect(editor).toBeVisible()
  await page.waitForTimeout(300)
  const windowSelect = editor.getByRole('combobox').last()
  await windowSelect.click({ force: true })
  const firstWindowOption = page.getByRole('option').first()
  await expect(firstWindowOption).toBeVisible()
  await expect(firstWindowOption.locator('.window-option-icon')).toBeVisible()
  await expect(firstWindowOption.locator('.window-option-subtitle')).not.toHaveText('')
  expect(
    Number(
      await editor
        .locator('.application-window-popper')
        .first()
        .evaluate((element) => getComputedStyle(element).zIndex),
    ),
  ).toBeGreaterThan(8000)
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'test-results/ui-audit-window-options.png' })
  await firstWindowOption.click()
  await editor.getByText('新建应用', { exact: true }).click()
  await expect(firstWindowOption).toBeHidden()
  await page.screenshot({ path: 'test-results/ui-audit-application-editor.png' })
  await editor.getByRole('button', { name: '取消' }).click()
  await expect(editor).toBeHidden()

  await page.keyboard.press('Escape')
  await expect(page.getByText('选择应用', { exact: true })).toBeHidden()
  await page.getByTitle('选择应用').click()
  await expect(page.getByText('选择应用', { exact: true })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByText('选择应用', { exact: true })).toBeVisible()
  const mobileSelectorTitle = page.locator('.selector-header h1')
  const mobileSelectorHeader = page.locator('.selector-header')
  await expect(mobileSelectorTitle).toHaveCSS('white-space', 'nowrap')
  await expect(mobileSelectorHeader).toHaveCSS('flex-direction', 'column')
  expect((await mobileSelectorTitle.boundingBox())!.height).toBeLessThan(32)
  await page.screenshot({ path: 'test-results/ui-audit-selector-mobile.png' })
  await page.getByRole('button', { name: '新建应用' }).click()
  await expect(editor).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'test-results/ui-audit-application-editor-mobile.png' })
  await editor.click({ position: { x: 4, y: 4 } })
  await expect(editor).toBeHidden()
  expect(pageErrors).toEqual([])
})

test('uses native window dragging without turning header controls into drag regions', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page.locator('.app-header')).toHaveCSS('-webkit-app-region', 'drag')
  await expect(page.locator('.header-controls')).toHaveCSS('-webkit-app-region', 'no-drag')
  await expect(page.getByRole('button', { name: '最小化窗口' })).toHaveCSS(
    '-webkit-app-region',
    'no-drag',
  )
})

test('opens the default Camera application and its RTSP player', async ({ page }) => {
  await page.goto('/')
  await page.locator('.application-card').filter({ hasText: 'Camera' }).click()

  await expect(page.getByText('Camera Video', { exact: true })).toBeVisible()
  await expect(page.locator('.context-app-name')).toHaveText('Camera')
  const toolbarCameraIcon = page.getByTitle('Camera Video').locator('svg')
  const titleCameraIcon = page.locator('.card-header .panel-title-icon svg')
  await expect(toolbarCameraIcon).toBeVisible()
  await expect(titleCameraIcon).toBeVisible()
  expect(await toolbarCameraIcon.locator('path').first().getAttribute('d')).toBe(
    await titleCameraIcon.locator('path').first().getAttribute('d'),
  )
  const videoStage = page.locator('.video-stage')
  const cameraControls = page.locator('.camera-controls')
  const [stageBox, controlsBox] = await Promise.all([
    videoStage.boundingBox(),
    cameraControls.boundingBox(),
  ])
  expect(stageBox).not.toBeNull()
  expect(controlsBox).not.toBeNull()
  expect(controlsBox!.y).toBeGreaterThanOrEqual(stageBox!.y + stageBox!.height - 1)
  const cameraSource = page.getByTitle('在 Input 中配置 Camera RTSP 数据源')
  await expect(cameraSource).toContainText('rtsp://192.168.3.14:8554/rgbstream')
  await expect(page.getByText('在 Input 中配置 RTSP 数据源后点击播放')).toBeVisible()

  await cameraSource.click()
  const dataSourceDialog = page.getByRole('dialog')
  await expect(dataSourceDialog).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Camera RTSP' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(dataSourceDialog.getByRole('textbox', { name: 'RTSP 视频地址' })).toHaveValue(
    'rtsp://192.168.3.14:8554/rgbstream',
  )
  await page.screenshot({ path: 'test-results/ui-audit-camera-source.png' })
  await dataSourceDialog.getByRole('button', { name: '保存数据源' }).click()
  await expect(dataSourceDialog).toBeHidden()

  await page.getByTitle('全屏展示').click()
  await expect(page.locator('.full-screen-header')).toHaveCount(0)
  await expect(page.locator('.full-screen-card .el-card__header')).toHaveCount(0)
  await expect(page.locator('.app-header .context-app-name')).toHaveText('Camera')
  await expect(page.locator('.app-header .context-panel-title')).toHaveText('Camera Video')
  await expect(page.locator('.app-header .context-title-icon svg')).toBeVisible()
  await expect(page.getByRole('button', { name: '退出组件全屏' })).toBeVisible()
  await page.screenshot({ path: 'test-results/ui-audit-fullscreen-header.png' })
  await page.getByRole('button', { name: '退出组件全屏' }).click()
  await expect(page.locator('.app-header .context-app-name')).toHaveText('Camera')
  await expect(page.locator('.app-header .context-panel-title')).toHaveCount(0)
  await expect(page.locator('.full-screen-card')).toHaveCount(0)

  await page.getByRole('button', { name: '播放' }).click()
  await expect(page.getByText('RTSP 播放仅支持 Nav-Tools 桌面版').first()).toBeVisible()

  await page.getByTitle('全屏展示').click()
  await expect(page.locator('.full-screen-card')).toBeVisible()
  await page.getByTitle('Camera Video').click()
  await expect(page.locator('.full-screen-card')).toHaveCount(0)
  await expect(page.locator('.app-header .context-panel-title')).toHaveCount(0)
  await expect(page.locator('.card-header .title').filter({ hasText: 'Camera Video' })).toHaveCount(
    2,
  )

  await page.getByTitle('全屏展示').first().click()
  await page.getByTitle('Auto').click()
  await expect(page.locator('.full-screen-card')).toHaveCount(0)
  await expect(page.locator('.card-header .title').filter({ hasText: 'Camera Video' })).toHaveCount(
    2,
  )

  await page.getByTitle('全屏展示').first().click()
  await page.getByTitle('Reset').click()
  await expect(page.locator('.full-screen-card')).toHaveCount(0)
  await expect(page.locator('.app-header .context-panel-title')).toHaveCount(0)
  await expect(page.locator('.card-header .title').filter({ hasText: 'Camera Video' })).toHaveCount(
    1,
  )
})

test('offers TCP and UDP network inputs in a compact dialog', async ({ page }) => {
  const application = {
    id: 'ui-audit',
    name: '数据工作台',
    description: '网络数据验证',
    icon: 'grid',
    accent: '#3b82f6',
    windowIds: ['raw-messages'],
  }
  await page.addInitScript((value) => {
    localStorage.setItem('nav-tools:custom-applications', JSON.stringify([value]))
    localStorage.setItem('nav-tools:selected-application', value.id)
  }, application)

  await page.goto('/#app/ui-audit')
  await page.getByTitle('选择应用').click()
  const selector = page.locator('.selector-backdrop')
  await expect(selector).toBeVisible()
  await selector.getByText('选择应用', { exact: true }).click()
  await expect(selector).toBeVisible()
  await selector.click({ position: { x: 100, y: 100 } })
  await expect(selector).toBeHidden()

  const paleToolbarIcons = await page
    .locator('.toolbar-btn svg path')
    .evaluateAll((paths) =>
      paths
        .map((path) => getComputedStyle(path).fill)
        .filter((fill) => fill === 'rgb(242, 242, 242)' || fill === 'rgb(255, 255, 255)'),
    )
  expect(paleToolbarIcons).toEqual([])
  await page.screenshot({ path: 'test-results/ui-audit-toolbar-light.png' })

  await page.getByTitle('Input').click()
  await expect(page.getByText('数据接入', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '文件输入' }).click()
  const filePathInput = page.getByPlaceholder('请输入文件路径')
  await expect(filePathInput).toHaveCSS('-webkit-app-region', 'no-drag')
  await filePathInput.click()
  await expect.poll(() => filePathInput.evaluate((el) => el === document.activeElement)).toBe(true)
  await page.keyboard.type('C:\\data\\sample.log')
  await expect(filePathInput).toHaveValue('C:\\data\\sample.log')
  await page.getByRole('tab', { name: '网络连接' }).click()
  const dialog = page.getByRole('dialog')
  const parserSelect = dialog.getByRole('combobox', { name: '数据解析方式' })
  await expect(parserSelect).toBeVisible()
  await dialog.locator('.parser-select:visible').click()
  await page.getByRole('option', { name: 'NMEA' }).click()
  await expect(dialog.getByText('NMEA', { exact: true }).last()).toBeVisible()
  await expect(page.locator('.data-parser-badge')).toContainText('Raw')
  await expect(page.locator('.data-input-overlay')).toHaveCSS('-webkit-app-region', 'no-drag')
  const hostInput = dialog.getByPlaceholder('127.0.0.1')
  await expect(hostInput).toHaveCSS('-webkit-app-region', 'no-drag')
  await hostInput.click()
  await expect.poll(() => hostInput.evaluate((el) => el === document.activeElement)).toBe(true)
  await hostInput.evaluate((el) => el.select())
  await page.keyboard.type('192.168.1.10')
  await expect(hostInput).toHaveValue('192.168.1.10')
  const portInput = dialog.getByPlaceholder('请输入端口')
  await expect(portInput).toHaveCSS('-webkit-app-region', 'no-drag')
  await portInput.click()
  await expect.poll(() => portInput.evaluate((el) => el === document.activeElement)).toBe(true)
  await page.keyboard.type('8080')
  await expect(portInput).toHaveValue('8080')
  const selectedProtocol = dialog.getByText('TCP', { exact: true }).first()
  await expect(selectedProtocol).toBeVisible()
  await selectedProtocol.click()
  const udpOption = page.getByRole('option', { name: 'UDP' })
  await expect(udpOption).toBeVisible()
  await udpOption.click()
  await expect(dialog.getByText('UDP', { exact: true }).first()).toBeVisible()
  await expect(udpOption).toBeHidden()
  await page.screenshot({ path: 'test-results/ui-audit-network.png' })

  await page.setViewportSize({ width: 390, height: 844 })
  const dialogBounds = await dialog.boundingBox()
  expect(dialogBounds).not.toBeNull()
  expect(dialogBounds!.x).toBeGreaterThanOrEqual(0)
  expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'test-results/ui-audit-network-mobile.png' })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await page.getByTitle('Input').click()
  await expect(dialog).toBeVisible()
  await dialog.click({ position: { x: 4, y: 4 } })
  await expect(dialog).toBeHidden()

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.getByTitle('Input').click()
  await page.getByRole('tab', { name: '文件输入' }).click()
  await filePathInput.fill('C:\\data\\sample.log')
  await dialog.locator('.parser-select:visible').click()
  await page.getByRole('option', { name: 'JSON' }).click()
  await dialog.getByRole('button', { name: '加载文件' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.data-parser-badge')).toContainText('JSON')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('nav-tools:data-source-settings')
        return raw ? JSON.parse(raw).file.parser : undefined
      }),
    )
    .toBe('json')

  await page.evaluate(() => localStorage.setItem('nav-tools:theme', 'dark'))
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.screenshot({ path: 'test-results/ui-audit-toolbar-dark.png' })
})

test('keeps the connection toggle centered and re-docks the toolbar around the header', async ({
  page,
}) => {
  const application = {
    id: 'toolbar-audit',
    name: 'Toolbar Audit',
    description: '',
    icon: 'grid',
    accent: '#3b82f6',
    windowIds: ['raw-messages'],
  }
  await page.addInitScript((value) => {
    localStorage.setItem('nav-tools:custom-applications', JSON.stringify([value]))
    localStorage.setItem('nav-tools:selected-application', value.id)
  }, application)
  await page.goto('/#app/toolbar-audit')

  const toolbar = page.locator('.toolbar')
  const toggle = toolbar.locator('.toggle-switch')
  const slider = toolbar.locator('.toggle-slider')
  const toggleBounds = await toggle.boundingBox()
  const sliderBounds = await slider.boundingBox()
  expect(toggleBounds).not.toBeNull()
  expect(sliderBounds).not.toBeNull()
  expect(toggleBounds!.height).toBeCloseTo(24, 0)
  expect(sliderBounds!.y + sliderBounds!.height / 2).toBeCloseTo(
    toggleBounds!.y + toggleBounds!.height / 2,
    0,
  )

  const dragToolbar = async (x: number, y: number) => {
    const handleBounds = await toolbar.locator('.toolbar-handle').boundingBox()
    expect(handleBounds).not.toBeNull()
    await page.mouse.move(
      handleBounds!.x + handleBounds!.width / 2,
      handleBounds!.y + handleBounds!.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(x, y, { steps: 8 })
  }

  await dragToolbar(160, 58)
  const topPreview = page.locator('.dock-zone-top')
  await expect(topPreview).toBeVisible()
  expect((await topPreview.boundingBox())!.y).toBeCloseTo(38, 0)
  await page.mouse.up()
  await expect(toolbar).toHaveClass(/toolbar-top/)
  expect((await toolbar.boundingBox())!.y).toBeCloseTo(38, 0)
  await page.screenshot({ path: 'test-results/ui-audit-toolbar-top.png' })

  await dragToolbar(160, 320)
  expect((await toolbar.boundingBox())!.y).toBeGreaterThan(100)
  await page.mouse.move(160, 700, { steps: 8 })
  await expect(page.locator('.dock-zone-bottom')).toBeVisible()
  await page.mouse.up()
  await expect(toolbar).toHaveClass(/toolbar-bottom/)
  expect((await toolbar.boundingBox())!.y).toBeCloseTo(680, 0)
  await page.screenshot({ path: 'test-results/ui-audit-toolbar-toggle.png' })

  await dragToolbar(20, 220)
  const leftPreview = page.locator('.dock-zone-left')
  await expect(leftPreview).toBeVisible()
  expect((await leftPreview.boundingBox())!.y).toBeCloseTo(38, 0)
  await page.mouse.up()
  await expect(toolbar).toHaveClass(/toolbar-left/)
  const leftToolbarBounds = await toolbar.boundingBox()
  const verticalToggleBounds = await toggle.boundingBox()
  const verticalSliderBounds = await slider.boundingBox()
  expect(leftToolbarBounds!.x).toBeCloseTo(0, 0)
  expect(leftToolbarBounds!.y).toBeCloseTo(38, 0)
  expect(verticalSliderBounds!.x + verticalSliderBounds!.width / 2).toBeCloseTo(
    verticalToggleBounds!.x + verticalToggleBounds!.width / 2,
    0,
  )

  const [leftContentBounds, leftHandleBounds, leftButtonBounds, leftDividerBounds] =
    await Promise.all([
      toolbar.locator('.toolbar-content').boundingBox(),
      toolbar.locator('.toolbar-handle').boundingBox(),
      toolbar.locator('.toolbar-btn').first().boundingBox(),
      toolbar.locator('.divider').first().boundingBox(),
    ])
  const toolbarCenterX = leftContentBounds!.x + leftContentBounds!.width / 2
  expect(leftHandleBounds!.x + leftHandleBounds!.width / 2).toBeCloseTo(toolbarCenterX, 0)
  expect(verticalToggleBounds!.x + verticalToggleBounds!.width / 2).toBeCloseTo(toolbarCenterX, 0)
  expect(leftButtonBounds!.x + leftButtonBounds!.width / 2).toBeCloseTo(toolbarCenterX, 0)
  expect(leftDividerBounds!.x + leftDividerBounds!.width / 2).toBeCloseTo(toolbarCenterX, 0)
  expect(leftDividerBounds!.width).toBeCloseTo(20, 0)
  expect(leftDividerBounds!.height).toBeCloseTo(1, 0)

  await dragToolbar(1260, 220)
  await expect(page.locator('.dock-zone-right')).toBeVisible()
  await page.mouse.up()
  await expect(toolbar).toHaveClass(/toolbar-right/)
  const rightToolbarBounds = await toolbar.boundingBox()
  const [rightContentBounds, rightButtonBounds, rightDividerBounds] = await Promise.all([
    toolbar.locator('.toolbar-content').boundingBox(),
    toolbar.locator('.toolbar-btn').first().boundingBox(),
    toolbar.locator('.divider').first().boundingBox(),
  ])
  const rightToolbarCenterX = rightContentBounds!.x + rightContentBounds!.width / 2
  expect(rightToolbarBounds!.x + rightToolbarBounds!.width).toBeCloseTo(1280, 0)
  expect(rightButtonBounds!.x + rightButtonBounds!.width / 2).toBeCloseTo(rightToolbarCenterX, 0)
  expect(rightDividerBounds!.x + rightDividerBounds!.width / 2).toBeCloseTo(rightToolbarCenterX, 0)
  expect(rightDividerBounds!.width).toBeCloseTo(20, 0)
  expect(rightDividerBounds!.height).toBeCloseTo(1, 0)
})

test('scrolls the dashboard to the bottom when many windows are present', async ({ page }) => {
  const application = {
    id: 'scroll-audit',
    name: 'Scroll Audit',
    description: '',
    icon: 'grid',
    accent: '#3b82f6',
    windowIds: [
      'plot',
      'raw-messages',
      'flow-deviation',
      'gnss-deviation',
      'gnss-signals',
      'sky-plot',
      'motor-parameters',
    ],
  }
  await page.addInitScript((value) => {
    localStorage.setItem('nav-tools:custom-applications', JSON.stringify([value]))
    localStorage.setItem('nav-tools:selected-application', value.id)
  }, application)

  await page.goto('/#app/scroll-audit')
  const content = page.locator('.dashboard-content')
  const gridItems = page.locator('.vgl-item:not(.vgl-item--placeholder)')
  await expect(content).toBeVisible()
  await expect(gridItems).toHaveCount(application.windowIds.length)

  await content.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })

  const contentBounds = await content.boundingBox()
  const itemBounds = await gridItems.last().boundingBox()
  expect(contentBounds).not.toBeNull()
  expect(itemBounds).not.toBeNull()
  expect(itemBounds!.y + itemBounds!.height).toBeLessThanOrEqual(
    contentBounds!.y + contentBounds!.height,
  )
})

test('aligns each card resize handle with the card bottom-right corner', async ({ page }) => {
  const application = {
    id: 'resize-handle-audit',
    name: 'Resize Handle Audit',
    description: '',
    icon: 'grid',
    accent: '#3b82f6',
    windowIds: ['plot', 'raw-messages', 'gnss-deviation'],
  }
  await page.addInitScript((value) => {
    localStorage.setItem('nav-tools:custom-applications', JSON.stringify([value]))
    localStorage.setItem('nav-tools:selected-application', value.id)
  }, application)

  await page.goto('/#app/resize-handle-audit')
  const gridItems = page.locator('.vgl-item:not(.vgl-item--placeholder)')
  await expect(gridItems).toHaveCount(application.windowIds.length)

  for (let index = 0; index < application.windowIds.length; index += 1) {
    const item = gridItems.nth(index)
    const card = item.locator('.box-card')
    const resizer = item.locator('.vgl-item__resizer')
    const cardBounds = await card.boundingBox()
    const resizerBounds = await resizer.boundingBox()

    expect(cardBounds).not.toBeNull()
    expect(resizerBounds).not.toBeNull()
    expect(resizerBounds!.x + resizerBounds!.width).toBeCloseTo(
      cardBounds!.x + cardBounds!.width,
      0,
    )
    expect(resizerBounds!.y + resizerBounds!.height).toBeCloseTo(
      cardBounds!.y + cardBounds!.height,
      0,
    )
    await expect(resizer).toHaveCSS('right', '0px')
    await expect(resizer).toHaveCSS('bottom', '0px')
    const pseudoOffset = await resizer.evaluate((element) => {
      const style = getComputedStyle(element, '::before')
      return { right: style.right, bottom: style.bottom }
    })
    expect(pseudoOffset).toEqual({ right: '0px', bottom: '0px' })
  }
})

test('prevents text selection in adjacent cards while resizing', async ({ page }) => {
  const application = {
    id: 'resize-selection-audit',
    name: 'Resize Selection Audit',
    description: '',
    icon: 'grid',
    accent: '#3b82f6',
    windowIds: ['plot', 'raw-messages'],
  }
  await page.addInitScript((value) => {
    localStorage.setItem('nav-tools:custom-applications', JSON.stringify([value]))
    localStorage.setItem('nav-tools:selected-application', value.id)
  }, application)

  await page.goto('/#app/resize-selection-audit')
  const firstItem = page.locator('.vgl-item:not(.vgl-item--placeholder)').first()
  const secondTitle = page.getByText('Raw Messages', { exact: true })
  const resizerBounds = await firstItem.locator('.vgl-item__resizer').boundingBox()
  const titleBounds = await secondTitle.boundingBox()
  expect(resizerBounds).not.toBeNull()
  expect(titleBounds).not.toBeNull()

  await page.mouse.move(
    resizerBounds!.x + resizerBounds!.width - 2,
    resizerBounds!.y + resizerBounds!.height - 2,
  )
  await page.mouse.down()
  await expect(page.locator('html')).toHaveClass(/dashboard-resizing/)
  await page.mouse.move(titleBounds!.x + titleBounds!.width / 2, titleBounds!.y + 8, {
    steps: 12,
  })

  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('')
  await page.mouse.up()
  await expect(page.locator('html')).not.toHaveClass(/dashboard-resizing/)
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('')
})

test('shows restore and always-on-top controls for detached panels', async ({ page }) => {
  const payload = encodeURIComponent(
    JSON.stringify({
      componentName: 'RawMessages',
      windowId: 'raw-messages',
      title: 'Raw Messages',
    }),
  )
  await page.goto(`/#card/${payload}`)
  await expect(page.locator('.brand-name')).toHaveText('Raw Messages')
  await expect(page.locator('.context-title')).toHaveCount(0)
  await expect(page.getByTitle('还原到主窗口')).toBeVisible()
  await expect(page.getByTitle('保持置顶')).toBeVisible()
  await expect(page.locator('.lucide-panel-top-open')).toBeVisible()
  await expect(page.locator('.lucide-pin')).toBeVisible()
  await expect(page.getByRole('button', { name: /选择主题模式/ })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/ui-audit-detached-header.png' })
})
