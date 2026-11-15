import { expect, test } from '@playwright/test'
import { openSolver } from './support/gnssSolver'

for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const initialMode of ['post', 'realtime'] as const) {
    test(`renders realtime Inputs and Options in ${locale} from ${initialMode}`, async ({
      page,
    }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.stack ?? error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      const labels =
        locale === 'zh-CN'
          ? { realtime: '实时解算', inputs: '输入', options: '处理选项', common: '常用' }
          : { realtime: 'Real-time', inputs: 'Inputs', options: 'Options', common: 'Common' }
      try {
        const panel = await openSolver(page, initialMode, true, locale)
        if (initialMode === 'post')
          await panel.locator('.el-radio-button').filter({ hasText: labels.realtime }).click()
        await expect(panel.locator('.stream-section')).toHaveCount(3)
        await expect(panel.locator('.stream-section').first()).toBeVisible()
        await expect(panel.locator('.stream-section').nth(1)).toContainText(
          'user:password@host:2101/mountpoint',
        )
        await panel.getByRole('tab', { name: labels.options, exact: true }).click()
        await expect(panel.locator('[data-option="mode"]')).toBeVisible()
        await expect(panel.locator('.options-heading h3')).toHaveText(labels.common)
        const search = panel.locator('.options-search input')
        await search.fill('pos2-arthres')
        await expect(panel.locator('[data-option="ratioThreshold"]')).toBeVisible()
        await search.fill('stats-errphase')
        await expect(panel.locator('[data-option="phaseErrorM"]')).toBeVisible()
        await panel.getByRole('tab', { name: labels.inputs, exact: true }).click()
        await expect(panel.locator('.stream-section').first()).toBeVisible()
        expect(errors).toEqual([])
      } finally {
        if (errors.length) console.error('Renderer errors:', errors)
      }
    })
  }
}
