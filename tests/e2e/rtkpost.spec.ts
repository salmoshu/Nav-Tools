import { expect, test } from '@playwright/test'
import { openSolver } from './support/gnssSolver'

test('preserves both engine configurations when switching modes and reloading the unified workspace', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const panel = await openSolver(page, 'post', false)
  await expect(panel.locator('.solver-alert')).toBeVisible()
  await expect(panel.locator('.rtkpost .run-toolbar')).toHaveCount(0)
  const rover = panel.locator('.file-row').filter({ hasText: 'RINEX OBS: Rover' }).locator('input')
  const output = panel.locator('.file-row').filter({ hasText: 'Solution file' }).locator('input')
  await rover.fill('/data/my-rover.obs')
  await rover.press('Tab')
  await expect(output).toHaveValue('/data/rover.pos')
  await output.fill('/data/my-solution.pos')
  await panel.locator('.add-nav').click()
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  const format = panel.locator('.option-field').filter({ hasText: 'Coordinate / protocol format' })
  await format.locator('.el-select').click()
  await page.getByRole('option', { name: 'NMEA-0183 GGA', exact: true }).click()
  await panel.locator('.el-radio-button').filter({ hasText: 'Real-time' }).click()
  await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
  const liveInput = panel.locator('.stream-section').first().locator('.stream-path input')
  await liveInput.fill('/data/my-stream.rtcm3')
  await panel.locator('.el-radio-button').filter({ hasText: 'Post-processing' }).click()
  await expect(rover).toHaveValue('/data/my-rover.obs')
  await expect(output).toHaveValue('/data/my-solution.pos')
  await expect(
    panel.locator('input[placeholder="NAV / CLK / SP3 / FCB / IONEX / SBAS"]'),
  ).toHaveCount(2)
  await page.reload()
  await expect(panel).toBeVisible({ timeout: 20_000 })
  await expect(rover).toHaveValue('/data/my-rover.obs')
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  await expect(
    panel.locator('.option-field').filter({ hasText: 'Coordinate / protocol format' }),
  ).toContainText('NMEA-0183 GGA')
  await panel.locator('.el-radio-button').filter({ hasText: 'Real-time' }).click()
  await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
  await expect(liveInput).toHaveValue('/data/my-stream.rtcm3')
  expect(pageErrors).toEqual([])
})
