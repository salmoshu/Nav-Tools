import { expect, test } from '@playwright/test'

test('clears old recycled rows before new messages are selected and copied', async ({ page }) => {
  const payload = encodeURIComponent(
    JSON.stringify({ componentName: 'RawMessages', windowId: 'raw-messages', title: 'Messages' }),
  )
  await page.goto(`/#card/${payload}`)
  await expect(page.locator('.flow-console-virtual')).toBeVisible()
  await page.evaluate(async () => {
    const { useConsole } = await import('/src/composables/flow/useConsole.ts')
    useConsole().addMessage('OLD_MESSAGE_SHOULD_NOT_BE_COPIED\n')
  })
  await expect(page.locator('.message-line').first()).toContainText('OLD_MESSAGE_SHOULD_NOT_BE_COPIED')
  await page.getByRole('button', { name: 'Clear console', exact: true }).click()
  await expect(page.locator('.message-line')).toHaveCount(0)
  await page.evaluate(async () => {
    const { useConsole } = await import('/src/composables/flow/useConsole.ts')
    useConsole().addMessage('NEW_MESSAGE_ONLY\n')
  })
  await expect(page.locator('.message-line').first()).toContainText('NEW_MESSAGE_ONLY')

  await page.locator('.console-content-virtual').click()
  await page.keyboard.press('ControlOrMeta+A')
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '')
  expect(selected).toContain('NEW_MESSAGE_ONLY')
  expect(selected).not.toContain('OLD_MESSAGE_SHOULD_NOT_BE_COPIED')
})
