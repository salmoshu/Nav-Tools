import { expect, test, type Locator } from '@playwright/test'
import { openSolver } from './support/gnssSolver'

async function selectStarCategory(panel: Locator, category: string, label: string) {
  const navigation = panel.locator(`.options-category[data-category="${category}"]`)
  if (await navigation.isVisible()) {
    await navigation.click()
    return
  }
  await panel.locator('.options-category-picker .el-select').click()
  await panel.page().getByRole('option', { name: label, exact: true }).click()
}

test('loads StarRTK post options without changing input or output paths', async ({ page }) => {
  const panel = await openSolver(page, 'post')
  const engineRow = panel.locator('.file-row').filter({ hasText: 'Processing engine' })
  await engineRow.locator('.el-select').click()
  await page.getByRole('option', { name: 'StarRTK', exact: true }).click()
  const before = await panel
    .locator('.processing-view .file-row input')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  await page.evaluate(async () => {
    const { parseStarRtkConfig } = await import('/src/core/gnsslib/StarRtkConfig.ts')
    const config = parseStarRtkConfig(`
processing:
  base_static: false
  rover_static: true
  single_epoch: true
  combine_frequencies: true
  weighting: signal_strength
  frequencies:
    gps: [false, true, true]
    beidou: [true, true, false]
    glonass: [true, false, true]
    galileo: [false, false, true]
  trace_directory: C:/yaml/diagnostics
post:
  base_observations: C:/changed/base.obs
  rover_observations: C:/changed/rover.obs
  navigation: C:/changed/rover.nav
  solution_file: C:/changed/output.nmea
  solution_format: nmea
`)
    window.electronAPI.openFileDialog = async () => ['C:/yaml/starrtk.yaml']
    window.electronAPI.starRtkReadConfig = async () => config
  })
  await panel.getByRole('button', { name: 'Load YAML', exact: true }).click()
  await selectStarCategory(panel, 'output', 'Output & diagnostics')
  await expect(panel.getByTestId('starrtk-trace-directory')).toHaveValue('C:/yaml/diagnostics')

  await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
  const after = await panel
    .locator('.processing-view .file-row input')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))
  expect(after.slice(0, -1)).toEqual(before.slice(0, -1))
  expect(after.at(-1)).toBe('/data/rover.starrtk.nmea')
})

test('loads StarRTK realtime options without changing input streams or output path', async ({
  page,
}) => {
  const panel = await openSolver(page, 'realtime')
  const engineRow = panel.locator('.file-row').filter({ hasText: 'Real-time engine' })
  await engineRow.locator('.el-select').click()
  await page.getByRole('option', { name: 'StarRTK', exact: true }).click()
  const before = await panel
    .locator('.navi-configuration .file-row input')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  await page.evaluate(async () => {
    const { parseStarRtkConfig } = await import('/src/core/gnsslib/StarRtkConfig.ts')
    const config = parseStarRtkConfig(`
processing:
  base_static: false
  rover_static: true
  single_epoch: false
  combine_frequencies: false
  weighting: signal_strength
  frequencies:
    gps: [false, true, false]
    beidou: [true, false, false]
    glonass: [false, false, false]
    galileo: [true, false, false]
  trace_directory: C:/yaml/realtime-log
realtime:
  rover: { type: file, path: "C:/changed/rover.rtcm3::T::x20" }
  base: { type: tcp_client, path: "127.0.0.1:9999" }
  solution_file: C:/changed/live.pos
  solution_format: pos
  cycle_ms: 250
  max_base_age_s: 2.5
`)
    window.electronAPI.openFileDialog = async () => ['C:/yaml/realtime.yaml']
    window.electronAPI.starRtkReadConfig = async () => config
  })
  await panel.getByRole('button', { name: 'Load YAML', exact: true }).click()
  await selectStarCategory(panel, 'output', 'Output & diagnostics')
  await expect(panel.getByTestId('starrtk-trace-directory')).toHaveValue('C:/yaml/realtime-log')
  await selectStarCategory(panel, 'common', 'Common')
  await expect(
    panel
      .locator('.options-field-grid > label')
      .filter({ hasText: 'Read cycle (ms)' })
      .locator('input'),
  ).toHaveValue('250')
  await expect(
    panel
      .locator('.options-field-grid > label')
      .filter({ hasText: 'Maximum base age (s)' })
      .locator('input'),
  ).toHaveValue('2.5')

  await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
  const after = await panel
    .locator('.navi-configuration .file-row input')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))
  expect(after).toEqual(before)
})

test('organizes StarRTK options with search, categories, and collapsible groups', async ({
  page,
}) => {
  const panel = await openSolver(page, 'post')
  const engineRow = panel.locator('.file-row').filter({ hasText: 'Processing engine' })
  await engineRow.locator('.el-select').click()
  await page.getByRole('option', { name: 'StarRTK', exact: true }).click()
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  const options = panel.locator('.star-options')
  const search = options.getByRole('textbox', { name: 'Search parameter names or config keys' })
  await search.fill('trace_directory')
  await expect(options.locator('.options-heading h3')).toHaveText('Search results · 1')
  await expect(panel.getByTestId('starrtk-trace-directory')).toBeVisible()
  await options.getByRole('button', { name: 'Back to category', exact: true }).click()

  await selectStarCategory(panel, 'ambiguity', 'Ambiguity fixing')
  await expect(panel.getByTestId('starrtk-ambiguity-mode')).toBeVisible()
  const ratioGroup = options.locator('.options-group').filter({ hasText: 'Ratio options' })
  await ratioGroup.locator('.options-group-toggle').click()
  await expect(panel.getByTestId('starrtk-ratio-nominal')).toHaveCount(0)
  await ratioGroup.locator('.options-group-toggle').click()
  await expect(panel.getByTestId('starrtk-ratio-nominal')).toBeVisible()
})
