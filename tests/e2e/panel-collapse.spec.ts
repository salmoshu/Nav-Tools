import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    localStorage.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'collapse-audit',
          name: 'Collapse Audit',
          description: '',
          icon: 'grid',
          accent: '#3b82f6',
          windowIds: ['raw-messages', 'plot'],
        },
      ]),
    )
    localStorage.setItem('nav-tools:selected-application', 'collapse-audit')
  })
  await page.goto('/#app/collapse-audit')
})

test('double-clicking a docked header collapses the grid card with four rounded corners and preserves its content', async ({
  page,
}) => {
  const card = page.locator('.box-card').first()
  const header = card.locator('.card-header')
  const original = await card.boundingBox()
  await card.locator('.card-content').evaluate((node) => {
    node.dataset.collapseMarker = 'preserved'
  })
  await header.dblclick({ position: { x: 60, y: 20 } })
  await expect(card).toHaveClass(/collapsed-card/)
  await expect(card.locator('.el-card__body')).toBeHidden()
  await expect(header).toHaveAttribute('aria-expanded', 'false')
  await expect.poll(async () => Math.round((await card.boundingBox())!.height)).toBe(42)
  const radii = await card.evaluate((node) => {
    const style = getComputedStyle(node)
    return [
      style.borderTopLeftRadius,
      style.borderTopRightRadius,
      style.borderBottomLeftRadius,
      style.borderBottomRightRadius,
    ]
  })
  expect(radii.every((radius) => radius === radii[0] && radius !== '0px')).toBe(true)
  await expect(card.locator('..').locator('..').locator('.vgl-item__resizer')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/panel-collapsed.png' })
  await header.dblclick({ position: { x: 60, y: 20 } })
  await expect(card).not.toHaveClass(/collapsed-card/)
  await expect(card.locator('.card-content')).toHaveAttribute('data-collapse-marker', 'preserved')
  await expect(card.locator('.el-card__body')).toBeVisible()
  await expect
    .poll(async () => Math.round((await card.boundingBox())!.height))
    .toBe(Math.round(original!.height))
})

test('saves collapsed layout state and expands the panel when entering fullscreen', async ({
  page,
}) => {
  const card = page.locator('.box-card').first()
  await card.locator('.card-header').dblclick({ position: { x: 60, y: 20 } })
  await page.getByTitle('Save', { exact: true }).click()
  await page.reload()
  await expect(card).toHaveClass(/collapsed-card/)
  await card.locator('.fullscreen-btn').click()
  await expect(card).toHaveClass(/full-screen-card/)
  await expect(card).not.toHaveClass(/collapsed-card/)
  await expect(card.locator('.el-card__body')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(card).not.toHaveClass(/full-screen-card/)
  await expect(card.locator('.el-card__body')).toBeVisible()
  await expect(card.locator('.card-header')).toHaveAttribute('aria-expanded', 'true')
})
