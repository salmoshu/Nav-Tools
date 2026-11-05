import { expect, test } from '@playwright/test'

test('collapses composer labels at the default card width and restores them when wider', async ({
  page,
}) => {
  const payload = encodeURIComponent(
    JSON.stringify({
      componentName: 'RawMessages',
      windowId: 'raw-messages',
      title: 'Messages',
    }),
  )
  await page.setViewportSize({ width: 700, height: 800 })
  await page.goto(`/#card/${payload}`)

  const inputContainer = page.locator('.input-container')
  const actions = page.locator('.composer-actions')
  const labels = actions.locator('.el-button > span > span')
  await expect(inputContainer).toBeVisible()
  await expect(labels).toHaveCount(3)
  await expect(labels.first()).toBeHidden()
  await expect(labels.nth(1)).toBeHidden()
  await expect(labels.nth(2)).toBeHidden()
  const inputBox = await inputContainer.boundingBox()
  const actionsBox = await actions.boundingBox()
  expect(inputBox).not.toBeNull()
  expect(actionsBox).not.toBeNull()
  expect(actionsBox!.y).toBeLessThan(inputBox!.y + 8)
  expect(actionsBox!.y + actionsBox!.height).toBeLessThanOrEqual(inputBox!.y + inputBox!.height + 1)

  await page.setViewportSize({ width: 1100, height: 800 })
  await expect(labels.first()).toBeVisible()
  await expect(labels.nth(1)).toBeVisible()
  await expect(labels.nth(2)).toBeVisible()
})
