import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    localStorage.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'maximize-audit',
          name: 'Maximize Audit',
          description: '',
          icon: 'grid',
          accent: '#3b82f6',
          windowIds: ['raw-messages', 'plot'],
        },
      ]),
    )
    localStorage.setItem('nav-tools:selected-application', 'maximize-audit')
  })
  await page.goto('/#app/maximize-audit')
})

test('double-clicking a docked header maximizes the card and Escape restores it', async ({
  page,
}) => {
  const card = page.locator('.box-card').first()
  const header = card.locator('.card-header')
  await expect(header).toBeVisible()
  const originalHeight = Math.round((await card.boundingBox())!.height)

  await header.dblclick({ position: { x: 60, y: 20 } })
  await expect(card).toHaveClass(/full-screen-card/)
  await expect(card.locator('.el-card__body')).toBeVisible()
  await expect(header).toHaveCount(0)
  await page.screenshot({ path: 'test-results/panel-maximized.png' })

  await page.keyboard.press('Escape')
  await expect(card).not.toHaveClass(/full-screen-card/)
  await expect(header).toBeVisible()
  await expect(card.locator('.el-card__body')).toBeVisible()
  await expect
    .poll(async () => Math.round((await card.boundingBox())!.height))
    .toBe(originalHeight)
})
