import { expect, test } from '@playwright/test'

test('opens RTKPOST and persists processing inputs and output options', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const application = {
    id: 'rtkpost-e2e',
    name: 'RTKPOST E2E',
    description: 'GNSS post-processing UI regression',
    icon: 'satellite',
    accent: '#6366f1',
    windowIds: ['gnsslib-rtkpost'],
  }
  await page.addInitScript((value) => {
    localStorage.setItem('nav-tools:locale', 'zh-CN')
    localStorage.setItem('nav-tools:custom-applications', JSON.stringify([value]))
    localStorage.setItem('nav-tools:selected-application', value.id)
  }, application)
  await page.goto('/#app/rtkpost-e2e')

  const panel = page.locator('.rtkpost')
  await expect(panel).toBeVisible({ timeout: 20_000 })
  await expect(panel.locator('.engine-name')).toHaveText('Robo-GNSS · rnx2rtkp')
  await expect(panel.locator('.desktop-alert')).toBeVisible()

  await panel.getByRole('button', { name: '处理选项', exact: true }).click()
  await expect(panel.locator('.options-section')).toBeVisible()
  const roverInput = panel
    .locator('.file-row')
    .filter({ hasText: 'RINEX OBS：流动站' })
    .locator('input')
  await roverInput.fill('/tmp/rover.obs')
  await roverInput.press('Tab')
  const outputInput = panel
    .locator('.file-row')
    .filter({ hasText: '解决方案文件' })
    .locator('input')
  await expect(outputInput).toHaveValue('/tmp/rover.pos')

  await panel.locator('.add-nav').click()
  await expect(
    panel.locator('input[placeholder="NAV / CLK / SP3 / FCB / IONEX / SBAS"]'),
  ).toHaveCount(2)

  const outputFormat = panel.locator('.option-field').filter({ hasText: '坐标 / 协议格式' })
  await outputFormat.locator('.el-select').click()
  await page.getByRole('option', { name: 'NMEA-0183 GGA', exact: true }).click()
  await expect(outputInput).toHaveValue('/tmp/rover.nmea')
  await panel.evaluate((element) => {
    element.scrollTop = 0
  })
  await page.screenshot({ path: 'test-results/rtkpost-options.png', fullPage: true })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 390, height: 844 })
  await panel.evaluate((element) => {
    element.style.width = '390px'
    element.style.maxWidth = '390px'
    element.scrollTop = 0
  })
  await expect(page.locator('html')).toHaveClass(/dark/)
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  )

  await page.reload()
  await expect(panel).toBeVisible({ timeout: 20_000 })
  await expect(roverInput).toHaveValue('/tmp/rover.obs')
  await expect(outputInput).toHaveValue('/tmp/rover.nmea')
  expect(pageErrors).toEqual([])
})
