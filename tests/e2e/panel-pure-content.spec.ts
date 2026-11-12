import { expect, test, type Locator, type Page } from '@playwright/test'

async function enterPureContent(page: Page, card: Locator): Promise<void> {
  const trigger = card.locator('.panel-actions-trigger')
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const item = page.getByRole('menuitem', { name: '纯净内容', exact: true }).last()
  await expect(item).toBeVisible()
  await item.evaluate((element) => element.click())
}

test('keeps multiple cards in pure content mode and restores the latest one with Escape', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'zh-CN')
    localStorage.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'pure-test',
          name: 'Pure Test',
          description: '',
          icon: 'camera',
          accent: '#14b8a6',
          windowIds: ['camera-video', 'raw-messages'],
        },
      ]),
    )
    localStorage.setItem('nav-tools:selected-application', 'pure-test')
    Object.defineProperty(window, 'ipcRenderer', {
      value: {
        on() {},
        off() {},
        send() {},
        invoke: async () => undefined,
      },
    })
    Object.defineProperty(window, 'electronAPI', {
      value: {
        getAppVersion: async () => '1.8.8',
        getWindowState: async () => ({ maximized: false, alwaysOnTop: false }),
        setUpdaterPrefs() {},
        cameraCalibrationSnapshot: async () => null,
        cameraCalibrationAccess: async () => ({}),
      },
    })
  })
  await page.goto('/#app/pure-test')

  const videoCard = page.locator('.box-card').filter({ hasText: '相机视频' }).first()
  const messagesCard = page.locator('.box-card').filter({ hasText: '消息' }).first()
  await expect(videoCard).toBeVisible()
  await expect(messagesCard).toBeVisible()

  await enterPureContent(page, videoCard)
  await expect(videoCard).toHaveClass(/pure-content-card/)
  await expect(messagesCard).not.toHaveClass(/pure-content-card/)

  await enterPureContent(page, messagesCard)
  await expect(videoCard).toHaveClass(/pure-content-card/)
  await expect(messagesCard).toHaveClass(/pure-content-card/)
  await expect(page.locator('.pure-content-card')).toHaveCount(2)
  await expect(page.locator('.pure-content-card .el-card__header').first()).toBeHidden()
  await expect(page.locator('.pure-content-card .el-card__header').last()).toBeHidden()
  await expect(page.locator('.pure-content-actions')).toHaveCount(2)
  await expect(messagesCard.locator('.console-header')).toBeHidden()
  await expect(messagesCard.locator('.console-input-bar')).toBeHidden()
  await expect(messagesCard.locator('.console-footer')).toBeHidden()

  const videoGridItem = videoCard.locator('..').locator('..')
  const beforeDrag = await videoGridItem.boundingBox()
  const dragHandle = await videoCard.boundingBox()
  expect(beforeDrag).not.toBeNull()
  expect(dragHandle).not.toBeNull()
  await expect(videoCard.locator('.pure-content-drag-handle')).toHaveCount(0)
  await page.mouse.move(dragHandle!.x + 24, dragHandle!.y + 1)
  await page.mouse.down()
  await page.mouse.move(dragHandle!.x + 184, dragHandle!.y + 90, { steps: 12 })
  await page.mouse.up()
  const afterDrag = await videoGridItem.boundingBox()
  expect(afterDrag).not.toBeNull()
  expect(
    Math.abs(afterDrag!.x - beforeDrag!.x) + Math.abs(afterDrag!.y - beforeDrag!.y),
  ).toBeGreaterThan(50)

  await page.keyboard.press('Escape')
  await expect(messagesCard).not.toHaveClass(/pure-content-card/)
  await expect(videoCard).toHaveClass(/pure-content-card/)
})
