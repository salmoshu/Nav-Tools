import { expect, test, type Locator, type Page } from '@playwright/test'

const dialogApplication = {
  id: 'dialog-ui-audit',
  name: '对话框审计',
  description: '配置弹框响应式验证',
  icon: 'grid',
  accent: '#3b82f6',
  windowIds: ['plot', 'flow-deviation', 'motor-parameters'],
}

async function expectDialogInsideViewport(page: Page, dialog: Locator): Promise<void> {
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.app-dialog-heading')).toBeVisible()

  await expect
    .poll(async () => Math.abs((await dialog.locator('..').boundingBox())?.y ?? 100))
    .toBeLessThan(0.5)

  const bounds = await dialog.boundingBox()
  const viewport = page.viewportSize()
  expect(bounds).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.y).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width + 1)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height + 1)
}

test('keeps legacy configuration dialogs polished and inside a narrow viewport', async ({
  page,
}) => {
  await page.addInitScript((application) => {
    localStorage.setItem('nav-tools:custom-applications', JSON.stringify([application]))
    localStorage.setItem('nav-tools:selected-application', application.id)
  }, dialogApplication)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#app/dialog-ui-audit')
  const cards = page.locator('.vgl-item:not(.vgl-item--placeholder)')
  await expect(cards).toHaveCount(dialogApplication.windowIds.length)

  const plotCard = cards.filter({ has: page.getByText('Plot', { exact: true }) })
  await plotCard.locator('.message-btn').click()
  let dialog = page.locator('.plot-message-dialog')
  await expectDialogInsideViewport(page, dialog)
  await expect(dialog.getByText('JSON 数据结构与输入约定')).toBeAttached()
  await page.screenshot({ path: 'test-results/ui-audit-plot-message-mobile.png' })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await plotCard.locator('.layout-btn').click()
  dialog = page.locator('.plot-config-dialog')
  await expectDialogInsideViewport(page, dialog)
  await dialog.getByText('双图', { exact: true }).click()
  await expectDialogInsideViewport(page, dialog)
  await page.screenshot({ path: 'test-results/ui-audit-plot-config-mobile.png' })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  const deviationCard = cards.filter({ has: page.getByText('Deviation Chart', { exact: true }) })
  await deviationCard.locator('.config-btn').click()
  dialog = page.locator('.deviation-config-dialog')
  await expectDialogInsideViewport(page, dialog)
  await page.screenshot({ path: 'test-results/ui-audit-deviation-config-mobile.png' })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  const motorCard = cards.filter({ has: page.getByText('Hex Message', { exact: true }) })
  await motorCard.locator('.config-btn').click()
  dialog = page.locator('.motor-config-dialog')
  await expectDialogInsideViewport(page, dialog)
  await expect(dialog.locator('.config-tool-card')).toBeVisible()
  await expect(dialog.locator('.config-tool-card').getByText('载入配置')).toBeVisible()
  await expect(dialog.locator('.el-dialog__footer').getByText('载入配置')).toHaveCount(0)
  await expect(dialog.locator('.el-dialog__footer').getByText('取消')).toBeVisible()
  const headerInput = dialog
    .locator('.message-field')
    .filter({ hasText: '报头' })
    .locator('input')
  const originalHeader = await headerInput.inputValue()
  await page.screenshot({ path: 'test-results/ui-audit-motor-config-mobile.png' })
  await headerInput.fill('FF')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await motorCard.locator('.config-btn').click()
  await expect(headerInput).toHaveValue(originalHeader)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await page.locator('.statusbar .add-btn').click()
  dialog = page.locator('.status-property-dialog')
  await expectDialogInsideViewport(page, dialog)
  await page.screenshot({ path: 'test-results/ui-audit-status-property-mobile.png' })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await page.setViewportSize({ width: 1280, height: 720 })
  await plotCard.locator('.layout-btn').click()
  dialog = page.locator('.plot-config-dialog')
  await dialog.getByText('双图', { exact: true }).click()
  await dialog.getByText('双Y轴', { exact: true }).click()
  await expectDialogInsideViewport(page, dialog)
  await page.screenshot({ path: 'test-results/ui-audit-plot-config-desktop.png' })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await motorCard.locator('.config-btn').click()
  dialog = page.locator('.motor-config-dialog')
  await expectDialogInsideViewport(page, dialog)
  await page.screenshot({ path: 'test-results/ui-audit-motor-config-desktop.png' })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await page.evaluate(() => localStorage.setItem('nav-tools:theme', 'dark'))
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  const darkPlotCard = page
    .locator('.vgl-item:not(.vgl-item--placeholder)')
    .filter({ has: page.getByText('Plot', { exact: true }) })
  await darkPlotCard.locator('.layout-btn').click()
  dialog = page.locator('.plot-config-dialog')
  await expectDialogInsideViewport(page, dialog)
  await page.screenshot({ path: 'test-results/ui-audit-plot-config-dark.png' })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
