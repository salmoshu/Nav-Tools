import { expect, test, type Locator } from '@playwright/test'
import { parse as parseYaml } from 'yaml'
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
  min_snr_dbhz: 25
  frequencies:
    gps: [false, true, true]
    beidou: [true, true, false]
    glonass: [true, false, true]
    galileo: [false, false, true]
    qzss: [true, false, false]
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
    window.electronAPI.rtkPostSaveConfig = async (request) => {
      Reflect.set(window, '__exportStarRtkPost', request.content)
      return 'C:/yaml/exported-post.yaml'
    }
  })
  await expect(panel.getByRole('button', { name: 'Load YAML', exact: true })).toHaveCSS('font-size', '12px')
  await expect(panel.getByRole('button', { name: 'Save YAML', exact: true })).toHaveCSS('font-size', '12px')
  await panel.getByRole('button', { name: 'Load YAML', exact: true }).click()
  await selectStarCategory(panel, 'observations', 'Observations & signals')
  await expect(panel.getByRole('checkbox', { name: 'QZSS Frequency 1' })).toBeChecked()
  await expect(panel.getByRole('checkbox', { name: 'GPS Frequency 1' })).not.toBeChecked()
  await expect(panel.getByTestId('starrtk-min-snr').locator('input')).toHaveValue('25')
  await selectStarCategory(panel, 'output', 'Output & diagnostics')
  await expect(panel.getByTestId('starrtk-trace-directory')).toHaveValue('C:/yaml/diagnostics')

  await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
  const after = await panel
    .locator('.processing-view .file-row input')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))
  expect(after.slice(0, -1)).toEqual(before.slice(0, -1))
  expect(after.at(-1)).toBe('/data/rover.starrtk.nmea')

  const base = panel
    .locator('.processing-view .file-row')
    .filter({ hasText: 'RINEX OBS: Base station' })
  await expect(base.locator('input')).toHaveValue('/data/base.obs')
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  await selectStarCategory(panel, 'positioning', 'Positioning & stations')
  await panel.getByTestId('starrtk-positioning-mode').click()
  await page.getByRole('option', { name: 'SPP (single point)', exact: true }).click()
  await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
  await expect(base).toHaveCount(0)
  await expect(panel.locator('.nav-hint')).toContainText('No base OBS is needed')
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  await selectStarCategory(panel, 'positioning', 'Positioning & stations')
  await panel.getByTestId('starrtk-positioning-mode').click()
  await page.getByRole('option', { name: 'RTD (pseudorange differential)', exact: true }).click()
  await expect(panel.locator('.star-options [data-category="ambiguity"]')).toHaveCount(0)
  await expect(panel.locator('.star-options [data-category="filtering"]')).toHaveCount(0)
  await selectStarCategory(panel, 'quality_control', 'Quality control')
  await expect(panel.getByTestId('starrtk-dgnss-max-rms').locator('input')).toBeEnabled()
  await expect(panel.getByTestId('starrtk-dgnss')).toHaveCount(0)
  await panel.getByRole('button', { name: 'Save YAML', exact: true }).click()
  const exported = parseYaml(await page.evaluate(() => Reflect.get(window, '__exportStarRtkPost')))
  expect(exported).toMatchObject({
    processing: {
      positioning: { positioning_mode: 'rtd' },
      observations: { min_snr_dbhz: 25 },
      output: { trace_directory: 'C:/yaml/diagnostics' },
    },
    post: { base_observations: '/data/base.obs', solution_format: 'nmea' },
  })
  await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
  await expect(base.locator('input')).toHaveValue('/data/base.obs')
})

test('round trips StarRTK realtime NMEA and processing options', async ({ page }) => {
  const panel = await openSolver(page, 'realtime')
  const engineRow = panel.locator('.file-row').filter({ hasText: 'Real-time engine' })
  await engineRow.locator('.el-select').click()
  await page.getByRole('option', { name: 'StarRTK', exact: true }).click()
  await panel.getByLabel('.pos', { exact: true }).fill('/data/live.pos')
  const streamPaths = panel.locator('.stream-section .stream-path input')
  const before = await streamPaths.evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  )
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  await page.evaluate(async () => {
    const { parseStarRtkConfig } = await import('/src/core/gnsslib/StarRtkConfig.ts')
    const config = parseStarRtkConfig(`
processing:
  positioning: { base_static: false, rover_static: true, single_epoch: false }
  observations:
    combine_frequencies: false
    weighting: signal_strength
    min_snr_dbhz: 27
    frequencies:
      gps: [false, true, false]
      beidou: [true, false, false]
      glonass: [false, false, false]
      galileo: [true, false, false]
      qzss: [true, true, false]
  ambiguity:
    fix_hold: { variance_cycles: 1e-9 }
    ratio: { nominal: 1.05, minimum: 1.001, maximum: 3.125 }
  quality_control:
    dgnss: { enabled: true, max_float_rms_m: 0.004, max_dgnss_rms_m: 0.051 }
  filtering:
    float_hold: { max_duration_s: 0.04 }
    spp_filter: { enabled: true, acceleration_noise_mps2: 0.8, max_gap_s: 6.5 }
  output: { trace_directory: "C:/yaml/realtime-log" }
realtime:
  rover: { type: file, path: "C:/changed/rover.rtcm3::T::x20" }
  base: { type: tcp_client, path: "127.0.0.1:9999" }
  solution_file: C:/changed/live.nmea
  solution_format: nmea
  cycle_ms: 250
  max_base_age_s: 2.5
`)
    window.electronAPI.openFileDialog = async () => ['C:/yaml/realtime.yaml']
    window.electronAPI.starRtkReadConfig = async () => config
    window.electronAPI.rtkPostSaveConfig = async (request) => {
      Reflect.set(window, '__exportStarRtkRealtime', request.content)
      return 'C:/yaml/exported.yaml'
    }
  })
  await panel.getByRole('button', { name: 'Load YAML', exact: true }).click()
  await selectStarCategory(panel, 'output', 'Output & diagnostics')
  await expect(panel.getByTestId('starrtk-trace-directory')).toHaveValue('C:/yaml/realtime-log')
  await selectStarCategory(panel, 'observations', 'Observations & signals')
  await expect(panel.getByRole('checkbox', { name: 'QZSS Frequency 1' })).toBeChecked()
  await expect(panel.getByRole('checkbox', { name: 'GPS Frequency 1' })).not.toBeChecked()
  const snrLimit = panel.getByTestId('starrtk-min-snr').locator('input')
  await expect(snrLimit).toHaveValue('27')
  await snrLimit.fill('0')
  await snrLimit.press('Tab')
  await selectStarCategory(panel, 'filtering', 'Filtering & continuity')
  const sppFilter = panel.getByTestId('starrtk-spp-filter')
  const maximumGap = panel.getByTestId('starrtk-spp-filter-max_gap_s').locator('input')
  await expect(sppFilter.getByRole('switch')).toBeChecked()
  await expect(maximumGap).toHaveValue('6.5')
  await sppFilter.click()
  await expect(maximumGap).toBeDisabled()
  await sppFilter.click()
  await expect(maximumGap).toBeEnabled()
  await maximumGap.fill('7.25')
  await maximumGap.press('Tab')
  await selectStarCategory(panel, 'positioning', 'Positioning & stations')
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
  await selectStarCategory(panel, 'ambiguity', 'Ambiguity fixing')
  await expect(panel.getByTestId('starrtk-ratio-nominal').locator('input')).toHaveValue('1.05')
  await expect(panel.getByTestId('starrtk-variance-cycles').locator('input')).toHaveValue('1e-9')
  await panel.getByRole('button', { name: 'Save YAML', exact: true }).click()
  const exported = parseYaml(
    await page.evaluate(() => Reflect.get(window, '__exportStarRtkRealtime')),
  )
  expect(exported).toMatchObject({
    processing: {
      observations: {
        min_snr_dbhz: 0,
        frequencies: { gps: [false, true, false], qzss: [true, true, false] },
      },
      ambiguity: {
        fix_hold: { variance_cycles: 1e-9 },
        ratio: { nominal: 1.05, minimum: 1.001, maximum: 3.125 },
      },
      quality_control: {
        dgnss: { enabled: true, max_float_rms_m: 0.004, max_dgnss_rms_m: 0.051 },
      },
      filtering: {
        float_hold: { max_duration_s: 0.04 },
        spp_filter: { enabled: true, acceleration_noise_mps2: 0.8, max_gap_s: 7.25 },
      },
    },
    realtime: {
      solution_file: '/data/live.nmea',
      solution_format: 'nmea',
      cycle_ms: 250,
      max_base_age_s: 2.5,
      rover: { type: 'tcp_client', path: before[0] },
      base: { type: 'tcp_client', path: before[1] },
    },
  })

  await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
  await expect(panel.getByLabel('.nmea', { exact: true })).toHaveValue('/data/live.nmea')
  const after = await streamPaths.evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  )
  expect(after).toEqual(before)

  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  await selectStarCategory(panel, 'positioning', 'Positioning & stations')
  await panel.getByTestId('starrtk-positioning-mode').click()
  await page.getByRole('option', { name: 'SPP (single point)', exact: true }).click()
  await expect(panel.locator('.star-options [data-category="quality_control"]')).toHaveCount(0)
  await expect(panel.locator('.star-options [data-category="filtering"]')).toHaveCount(1)
  await panel.getByRole('button', { name: 'Save YAML', exact: true }).click()
  const sppExport = parseYaml(
    await page.evaluate(() => Reflect.get(window, '__exportStarRtkRealtime')),
  )
  expect(sppExport.processing.positioning.positioning_mode).toBe('spp')
  expect(sppExport.realtime.rover.path).toBe(before[0])
  expect(sppExport.realtime.base).toBeUndefined()
  await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
  await expect(streamPaths).toHaveCount(1)
  await expect(streamPaths.first()).toHaveValue(before[0])
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
  await search.fill('processing.trace_directory')
  await expect(options.locator('.options-heading h3')).toHaveText('Search results · 1')
  await expect(panel.getByTestId('starrtk-trace-directory')).toBeVisible()
  await search.fill('processing.filtering.spp_filter.max_gap_s')
  await expect(options.locator('.options-heading h3')).toHaveText('Search results · 1')
  await expect(panel.getByTestId('starrtk-spp-filter-max_gap_s')).toBeVisible()
  await search.fill('processing.observations.frequencies.galileo')
  await expect(options.locator('.options-heading h3')).toHaveText('Search results · 1')
  await expect(panel.getByRole('row', { name: /Galileo/ })).toBeVisible()
  await expect(panel.getByRole('checkbox', { name: 'Galileo Frequency 1' })).toBeChecked()
  await options.getByRole('button', { name: 'Back to category', exact: true }).click()

  await selectStarCategory(panel, 'ambiguity', 'Ambiguity fixing')
  await expect(panel.getByTestId('starrtk-ambiguity-mode')).toBeVisible()
  for (const [field, value] of [
    ['starrtk-min-fixed-epochs', '1'],
    ['starrtk-min-elevation', '15'],
  ]) {
    const control = panel.getByTestId(field)
    await expect(control.locator('input')).toHaveValue(value)
    const spacing = await control.evaluate((element) => {
      const input = element.querySelector('input')!.getBoundingClientRect()
      const decrease = element.querySelector('.el-input-number__decrease')!.getBoundingClientRect()
      const increase = element.querySelector('.el-input-number__increase')!.getBoundingClientRect()
      return { left: input.left - decrease.right, right: increase.left - input.right }
    })
    expect(spacing.left).toBeGreaterThanOrEqual(4)
    expect(spacing.right).toBeGreaterThanOrEqual(4)
    await control.locator('.el-input-number__increase').click()
    await expect(control.locator('input')).toHaveValue(String(Number(value) + 1))
    await control.locator('.el-input-number__decrease').click()
    await expect(control.locator('input')).toHaveValue(value)
  }
  const ratioGroup = options.locator('.options-group').filter({ hasText: 'Ratio options' })
  await ratioGroup.locator('.options-group-toggle').click()
  await expect(panel.getByTestId('starrtk-ratio-nominal')).toHaveCount(0)
  await ratioGroup.locator('.options-group-toggle').click()
  await expect(panel.getByTestId('starrtk-ratio-nominal')).toBeVisible()
})
