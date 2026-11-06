import { expect, test } from '@playwright/test'

test('recent files use a searchable dropdown capped at 17 records and fill the chosen path', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    localStorage.setItem(
      'nav-tools:recent-input-files',
      JSON.stringify(
        Array.from({ length: 20 }, (_, index) => ({
          path: `C:/recordings/session-${index}.log`,
          name: `session-${index}.log`,
          sizeBytes: 1024 * (index + 1),
          openedAt: 20 - index,
        })),
      ),
    )
  })
  await page.goto('/')
  await page.locator('.application-card[data-application-id="serial"]').click()
  await page.getByTitle('Input', { exact: true }).click()
  const dialog = page.locator('.data-input-dialog')
  await dialog.getByRole('tab', { name: /File Input/ }).click()
  const recent = dialog.getByRole('combobox', { name: 'Recent files', exact: true })
  await expect(recent).toBeVisible()
  await expect(page.locator('.recent-files-dropdown:visible')).toHaveCount(0)
  await recent.click()
  const popup = page.locator('.el-popper.recent-files-dropdown:visible')
  const options = popup.getByRole('option')
  await expect(options).toHaveCount(17)
  await expect(popup).toHaveCSS('z-index', '9000')
  await expect(popup).toHaveCSS('opacity', '1')
  await page.screenshot({
    path: 'test-results/recent-input-files-dropdown.png',
    animations: 'disabled',
  })
  await options.filter({ hasText: 'session-16.log' }).click()
  await expect(dialog.getByRole('textbox', { name: 'File Path', exact: true })).toHaveValue(
    'C:/recordings/session-16.log',
  )
  await expect(page.locator('.recent-files-dropdown:visible')).toHaveCount(0)
  await recent.click()
  await recent.fill('session-12')
  await expect(options.filter({ visible: true })).toHaveCount(1)
  await options.filter({ hasText: 'session-12.log' }).click()
  await expect(dialog.getByRole('textbox', { name: 'File Path', exact: true })).toHaveValue(
    'C:/recordings/session-12.log',
  )
})
