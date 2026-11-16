import { expect, test } from '@playwright/test'

test('supports persistent row view, reordering and a narrow viewport', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('nav-tools:locale', 'zh-CN'))
  await page.goto('/')
  await expect(page.locator('.application-grid')).toBeVisible()
  await expect(page.locator('.view-mode-button')).toHaveCount(2)
  for (const button of await page.locator('.view-mode-button').all()) {
    await expect(button).toHaveCSS('border-radius', '3px')
  }
  await expect(page.locator('.application-card--row')).toHaveCount(0)

  await page.getByRole('button', { name: '按行显示', exact: true }).click()
  await expect(page.locator('.application-grid--rows')).toBeVisible()
  await expect(page.locator('.application-card--row')).toHaveCount(4)
  await expect(page.locator('.application-card--row .application-copy').first()).toHaveCSS(
    'column-gap',
    '8px',
  )
  await expect(page.getByRole('button', { name: '按行显示', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.locator('[data-application-id="gnss"]').focus()
  await page.keyboard.press('Control+ArrowDown')
  await expect
    .poll(async () =>
      page
        .locator('.application-card--row')
        .evaluateAll((cards) => cards.map((card) => (card as HTMLElement).dataset.applicationId)),
    )
    .toEqual(['serial', 'gnssraw', 'gnss', 'gnsslib'])

  const gnsslib = page.locator('[data-application-id="gnsslib"]')
  const serial = page.locator('[data-application-id="serial"]')
  await gnsslib.dragTo(serial)
  await expect
    .poll(async () =>
      page
        .locator('.application-card--row')
        .evaluateAll((cards) => cards.map((card) => (card as HTMLElement).dataset.applicationId)),
    )
    .toEqual(['gnsslib', 'serial', 'gnssraw', 'gnss'])

  await page.reload()
  await expect(page.locator('.application-grid--rows')).toBeVisible()
  expect(
    await page.evaluate(() => localStorage.getItem('nav-tools:application-selector-view')),
  ).toBe('"rows"')
  await expect
    .poll(async () =>
      page
        .locator('.application-card--row')
        .evaluateAll((cards) => cards.map((card) => (card as HTMLElement).dataset.applicationId)),
    )
    .toEqual(['gnsslib', 'serial', 'gnssraw', 'gnss'])

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.selector-panel')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByRole('button', { name: '卡片显示', exact: true }).click()
  await expect(page.locator('.application-grid--rows')).toHaveCount(0)
  expect(errors).toEqual([])
})
