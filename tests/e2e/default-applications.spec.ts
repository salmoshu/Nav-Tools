import { expect, test } from '@playwright/test'

test('settings cards control the selector and retain the selection after restarting', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('nav-tools:locale', 'en-US'))
  await page.goto('/')
  const cards = page.locator('.application-card')
  await expect(cards).toHaveCount(4)
  expect(
    await cards.evaluateAll((elements) =>
      elements.map((el) => el.getAttribute('data-application-id')),
    ),
  ).toEqual(['serial', 'gnss', 'gnssraw', 'gnsslib'])

  await page.getByRole('button', { name: 'Default Applications', exact: true }).click()
  const settings = page.locator('.settings-page')
  await expect(settings.getByRole('checkbox')).toHaveCount(7)
  expect(await settings.getByRole('checkbox').allTextContents()).toEqual([
    expect.stringContaining('Serial'),
    expect.stringContaining('Flow'),
    expect.stringContaining('GNSS'),
    expect.stringContaining('GNSS-Raw'),
    expect.stringContaining('Camera'),
    expect.stringContaining('LiDAR'),
    expect.stringContaining('GNSS-Lib'),
  ])
  for (const name of ['Serial', 'GNSS', 'GNSS-Raw', 'GNSS-Lib']) {
    await expect(settings.getByRole('checkbox', { name, exact: true })).toBeChecked()
  }
  for (const name of ['Flow', 'Camera', 'LiDAR']) {
    await expect(settings.getByRole('checkbox', { name, exact: true })).not.toBeChecked()
  }
  await page.screenshot({ path: 'test-results/default-applications-settings.png' })
  await settings.getByRole('checkbox', { name: 'Camera', exact: true }).click()
  await settings.getByRole('checkbox', { name: 'LiDAR', exact: true }).click()
  await settings.getByRole('checkbox', { name: 'Flow', exact: true }).click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByTitle(/^(选择应用|Select Application)$/).click()
  await expect(cards).toHaveCount(7)
  expect(
    await cards.evaluateAll((elements) =>
      elements.map((el) => el.getAttribute('data-application-id')),
    ),
  ).toEqual(['serial', 'motor', 'gnss', 'gnssraw', 'camera', 'lidar', 'gnsslib'])

  await page.reload()
  await expect(cards).toHaveCount(7)
  await page.getByRole('button', { name: 'Default Applications', exact: true }).click()
  await expect(settings.getByRole('checkbox', { name: 'Camera', exact: true })).toBeChecked()
  await settings.getByRole('checkbox', { name: 'Camera', exact: true }).click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByTitle(/^(选择应用|Select Application)$/).click()
  await expect(page.locator('.application-card[data-application-id="camera"]')).toHaveCount(0)
  await expect(cards).toHaveCount(6)
})

test('an empty selector still provides access to default application settings', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    localStorage.setItem('nav-tools:enabled-default-applications', '[]')
    localStorage.setItem('nav-tools:theme', 'dark')
  })
  await page.goto('/')
  await expect(page.locator('.application-card')).toHaveCount(0)
  await page.getByRole('button', { name: 'Default Applications', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Serial', exact: true }).click()
  await page.screenshot({ path: 'test-results/default-applications-dark.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('checkbox', { name: 'GNSS-Lib', exact: true }).scrollIntoViewIfNeeded()
  const bounds = await page.getByRole('checkbox', { name: 'GNSS-Lib', exact: true }).boundingBox()
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'test-results/default-applications-mobile.png' })
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByTitle(/^(选择应用|Select Application)$/).click()
  await expect(page.locator('.application-card')).toHaveCount(1)
})
