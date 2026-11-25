import { expect, test } from '@playwright/test'
import { openSolver } from './support/gnssSolver'

for (const { engine, expected } of [
  { engine: 'rnx2rtkp', expected: 'C:/new-rover/session/rover.pos' },
  { engine: 'starrtk', expected: 'C:/new-rover/session/rover.starrtk.pos' },
] as const) {
  test(`moves the ${engine} post output into the selected Rover directory`, async ({ page }) => {
    const panel = await openSolver(page, 'post')
    if (engine === 'starrtk') {
      const engineRow = panel.locator('.file-row').filter({ hasText: 'Processing engine' })
      await engineRow.locator('.el-select').click()
      await page.getByRole('option', { name: 'StarRTK', exact: true }).click()
    }
    const roverRow = panel.locator('.file-row').filter({ hasText: 'RINEX OBS: Rover' }).first()
    const output = panel.locator('.file-row').filter({ hasText: 'Solution file' }).locator('input')
    await output.fill('/elsewhere/custom.pos')
    await page.evaluate(() => {
      window.electronAPI.openFileDialog = async () => ['C:/new-rover/session/rover.obs']
    })

    await roverRow.getByRole('button').click()

    await expect(roverRow.locator('input')).toHaveValue('C:/new-rover/session/rover.obs')
    await expect(output).toHaveValue(expected)
  })
}

test('keeps input and output paths unchanged when switching between engines', async ({ page }) => {
  const panel = await openSolver(page, 'post')
  const rover = panel.locator('.file-row').filter({ hasText: 'RINEX OBS: Rover' }).locator('input')
  const base = panel
    .locator('.file-row')
    .filter({ hasText: 'RINEX OBS: Base station' })
    .locator('input')
  const navigation = panel.locator('.file-row').filter({ hasText: 'NAV' }).locator('input')
  const output = panel.locator('.file-row').filter({ hasText: 'Solution file' }).locator('input')
  await rover.fill('/custom/rover.obs')
  await base.fill('/custom/base.obs')
  await navigation.fill('/custom/rover.nav')
  await output.fill('/custom/solution.pos')
  const engineRow = panel.locator('.file-row').filter({ hasText: 'Processing engine' })

  for (const engine of ['StarRTK', 'RTKLIB-EX', 'OpenGNSS'] as const) {
    await engineRow.locator('.el-select').click()
    await page.getByRole('option', { name: engine, exact: true }).click()
    await expect(rover).toHaveValue('/custom/rover.obs')
    await expect(base).toHaveValue('/custom/base.obs')
    await expect(navigation).toHaveValue('/custom/rover.nav')
    await expect(output).toHaveValue('/custom/solution.pos')
  }
})
