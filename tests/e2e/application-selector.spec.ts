import { expect, test } from '@playwright/test'

test('opens the user application selector in the renderer', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('/')
  await expect(page.getByText('Nav-Tools', { exact: true })).toBeVisible()
  await expect(page.getByText('选择应用', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/ui-audit-selector.png' })

  await page.getByRole('button', { name: '新建应用' }).click()
  const editor = page.getByRole('dialog', { name: '新建应用' })
  await expect(editor).toBeVisible()
  await page.waitForTimeout(300)
  const windowSelect = editor.getByRole('combobox').last()
  await windowSelect.click({ force: true })
  const firstWindowOption = page.getByRole('option').first()
  await expect(firstWindowOption).toBeVisible()
  await firstWindowOption.click()
  await editor.getByText('新建应用', { exact: true }).click()
  await expect(firstWindowOption).toBeHidden()
  await page.screenshot({ path: 'test-results/ui-audit-application-editor.png' })
  await editor.getByRole('button', { name: '取消' }).click()
  await expect(editor).toBeHidden()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByText('选择应用', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/ui-audit-selector-mobile.png' })
  await page.getByRole('button', { name: '新建应用' }).click()
  await expect(editor).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'test-results/ui-audit-application-editor-mobile.png' })
  expect(pageErrors).toEqual([])
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
  await page.getByRole('tab', { name: '网络连接' }).click()
  const dialog = page.getByRole('dialog')
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

  await page.setViewportSize({ width: 1280, height: 720 })
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
  await expect(page.getByTitle('还原到主窗口')).toBeVisible()
  await expect(page.getByTitle('保持置顶')).toBeVisible()
  await expect(page.locator('.lucide-panel-top-open')).toBeVisible()
  await expect(page.locator('.lucide-pin')).toBeVisible()
  await expect(page.getByRole('button', { name: /选择主题模式/ })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/ui-audit-detached-header.png' })
})
