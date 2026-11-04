import { expect, test } from '@playwright/test'

test('settings header shares the sidebar width and centers the back label with its arrow', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    const application = {
      id: 'settings-layout',
      name: 'Settings Layout',
      description: '',
      icon: 'grid',
      accent: '#6366f1',
      windowIds: ['raw-messages'],
    }
    localStorage.setItem('nav-tools:custom-applications', JSON.stringify([application]))
    localStorage.setItem('nav-tools:selected-application', application.id)
  })
  await page.goto('/#app/settings-layout')
  await page.getByRole('button', { name: /Settings|设置/ }).click()

  const header = page.locator('.settings-header')
  const nav = page.locator('.settings-nav')
  const back = page.locator('.back-button')
  await expect(header).toBeVisible()
  await expect(nav).toBeVisible()
  await expect(back).toBeVisible()

  const [headerBox, navBox, arrowBox, labelBox] = await Promise.all([
    header.boundingBox(),
    nav.boundingBox(),
    back.locator('svg').boundingBox(),
    back.locator('span').boundingBox(),
  ])
  expect(headerBox).not.toBeNull()
  expect(navBox).not.toBeNull()
  expect(arrowBox).not.toBeNull()
  expect(labelBox).not.toBeNull()

  expect(headerBox!.x).toBeCloseTo(navBox!.x, 1)
  expect(headerBox!.width).toBeCloseTo(navBox!.width, 1)
  expect(headerBox!.y + headerBox!.height).toBeLessThanOrEqual(navBox!.y + 1)
  expect(
    Math.abs(arrowBox!.y + arrowBox!.height / 2 - (labelBox!.y + labelBox!.height / 2)),
  ).toBeLessThanOrEqual(1)
})
