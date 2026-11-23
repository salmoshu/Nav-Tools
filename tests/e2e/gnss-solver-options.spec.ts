import { expect, test, type Locator, type Page } from '@playwright/test'
import { openSolver, selectSolverCategory } from './support/gnssSolver'

async function selectField(panel: Locator, key: string, label: string) {
  await panel.locator(`[data-option="${key}"] .el-select`).click()
  await panel.page().getByRole('option', { name: label, exact: true }).click()
}

async function resizeSolver(panel: Locator, width: number, height = 660) {
  await panel.evaluate(
    (element, size) => {
      for (const target of [
        element,
        element.closest<HTMLElement>('.box-card'),
        element.closest<HTMLElement>('.vgl-item'),
      ]) {
        if (!target) continue
        target.style.width = `${size.width}px`
        target.style.height = `${size.height}px`
        target.style.maxWidth = 'none'
      }
    },
    { width, height },
  )
}

async function optionsPanel(page: Page, mode: 'post' | 'realtime' = 'post') {
  const panel = await openSolver(page, mode)
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  return panel
}

test('remembers the selected workspace tab independently for each solver mode', async ({
  page,
}) => {
  const panel = await openSolver(page, 'post')
  const inputs = panel.getByRole('tab', { name: 'Inputs', exact: true })
  const options = panel.getByRole('tab', { name: 'Options', exact: true })
  const realtime = panel.locator('.el-radio-button').filter({ hasText: 'Real-time' })
  const post = panel.locator('.el-radio-button').filter({ hasText: 'Post-processing' })

  await options.click()
  await expect(options).toHaveAttribute('aria-selected', 'true')
  await realtime.click()
  await expect(inputs).toHaveAttribute('aria-selected', 'true')
  await expect(options).toHaveAttribute('aria-selected', 'false')
  await options.click()
  await post.click()
  await expect(options).toHaveAttribute('aria-selected', 'true')
  await inputs.click()
  await realtime.click()
  await expect(options).toHaveAttribute('aria-selected', 'true')
  await post.click()
  await expect(inputs).toHaveAttribute('aria-selected', 'true')
})

test('starts with common settings and provides a single category with collapsible filter groups', async ({
  page,
}) => {
  const panel = await optionsPanel(page)
  await expect(panel.locator('.options-heading h3')).toHaveText('Common')
  await expect(panel.locator('.solver-options .option-field')).toHaveCount(7)
  await expect(panel.locator('[data-option="ratioMin"]')).toHaveCount(0)
  await selectSolverCategory(panel, 'filter')
  await expect(panel.locator('[data-option="phaseErrorM"]')).toBeVisible()
  await expect(panel.locator('[data-option="initialBiasStdM"]')).toHaveCount(0)
  await panel.getByRole('button', { name: 'Initial state', exact: true }).click()
  const initialBias = panel.locator('[data-option="initialBiasStdM"] input')
  await initialBias.fill('45')
  await initialBias.press('Tab')
  await expect(panel.locator('.options-modified')).toHaveText('1 modified')
  await selectSolverCategory(panel, 'common')
  await expect(panel.locator('[data-option="initialBiasStdM"]')).toHaveCount(0)
  await panel.locator('.options-modified').click()
  await expect(panel.locator('.options-heading h3')).toHaveText('Modified parameters')
  await expect(initialBias).toHaveValue('45.000')
})

test('searches Chinese, English and RTKLIB aliases across categories', async ({ page }) => {
  const panel = await optionsPanel(page)
  const search = panel.getByRole('textbox', { name: 'Search parameter names or config keys' })
  await search.fill('周跳')
  await expect(panel.locator('.solver-options .option-field')).toHaveCount(2)
  await expect(panel.locator('[data-option="gfSlipThresholdM"]')).toBeVisible()
  await search.fill('minimum ratio')
  await expect(panel.locator('.solver-options .option-field')).toHaveCount(1)
  await expect(panel.locator('[data-option="ratioMin"]')).toBeVisible()
  await search.fill('pos2-thresdop')
  await expect(panel.locator('[data-option="dopplerSlipThresholdHz"]')).toBeVisible()
  await search.fill('no-such-parameter')
  await expect(panel.locator('.options-empty')).toContainText('No matching parameters')
  await panel.getByRole('button', { name: 'Back to category' }).click()
  await expect(search).toHaveValue('')
  await expect(panel.locator('.options-heading h3')).toHaveText('Common')
  await page.evaluate(async () => {
    const path = '/src/i18n/index.ts'
    const { i18n } = await import(/* @vite-ignore */ path)
    i18n.global.locale.value = 'zh-CN'
  })
  await panel.getByRole('textbox', { name: '搜索参数名称或配置键名' }).fill('minimum ratio')
  await expect(panel.locator('[data-option="ratioMin"] label')).toHaveText('最小 Ratio')
})

test('keeps imported inactive values discoverable and submits them unchanged', async ({ page }) => {
  const panel = await optionsPanel(page)
  await page.evaluate(() =>
    Reflect.set(window.electronAPI, 'rtkPostReadConfig', async () =>
      [
        'pos1-navsys=1',
        'pos2-armode=fix-and-hold',
        'pos2-minholdsats=9',
        'pos2-gloarmode=autocal',
        'pos2-arthres2=0.15',
      ].join('\n'),
    ),
  )
  const config = panel.locator('.config-file-panel input')
  await config.fill('/data/retained.conf')
  await config.press('Enter')
  await expect(panel.locator('.config-status')).toContainText('Loaded 5 parameters')
  await expect(panel.locator('.options-modified')).toHaveText('0 modified')
  await selectSolverCategory(panel, 'ambiguity')
  const editedHold = panel.locator('[data-option="minHoldSats"] input')
  await editedHold.fill('10')
  await editedHold.press('Tab')
  await selectSolverCategory(panel, 'common')
  await selectField(panel, 'ambiguityResolution', 'Continuous')
  await selectSolverCategory(panel, 'ambiguity')
  await expect(panel.locator('[data-option="minHoldSats"]')).toHaveCount(0)
  await expect(panel.locator('.options-retained')).toContainText('1 modified parameters')
  await panel.getByRole('button', { name: 'Review retained values' }).click()
  const hold = panel.locator('[data-option="minHoldSats"] input')
  await expect(hold).toHaveValue('10')
  await expect(hold).toBeDisabled()
  await panel.getByRole('button', { name: 'Back to category' }).click()
  await panel
    .getByRole('textbox', { name: 'Search parameter names or config keys' })
    .fill('pos2-arthres2')
  await expect(panel.locator('[data-option="gloHwBiasM"] input')).toHaveValue('0.1500')
  await panel.getByRole('button', { name: 'Back to category' }).click()
  await selectSolverCategory(panel, 'common')
  await selectField(panel, 'mode', 'Single')
  await expect(panel.locator('[data-option="ambiguityResolution"]')).toHaveCount(0)
  await panel.getByRole('button', { name: 'Confirm', exact: true }).click()
  await panel.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__solverPostCalls'))).toBe(1)
  const request = await page.evaluate(() => Reflect.get(window, '__solverPostRequest'))
  expect(request.options).toMatchObject({
    mode: 0,
    minHoldSats: 10,
    gloArMode: 'autocal',
    gloHwBiasM: 0.15,
  })
  await expect(panel.locator('[data-option="mode"]').getByRole('combobox')).toBeDisabled()
})

test('marks only manual edits and confirms them to the local cache without saving a file', async ({
  page,
}) => {
  const panel = await optionsPanel(page)
  await page.evaluate(() => {
    Reflect.set(window, '__postSaveCalls', 0)
    Reflect.set(window.electronAPI, 'rtkPostSaveConfig', async () => {
      Reflect.set(window, '__postSaveCalls', Reflect.get(window, '__postSaveCalls') + 1)
      return null
    })
    Reflect.set(
      window.electronAPI,
      'rtkPostReadConfig',
      async () => 'pos2-arthres=6\npos2-arthresmin=1.4\nfile-dcbfile=/data/custom.dcb\n',
    )
  })
  const config = panel.locator('.config-file-panel input')
  await config.fill('/data/source.conf')
  await config.press('Enter')
  await expect(panel.locator('.config-status')).toContainText('Loaded 2 parameters')
  await expect(panel.locator('.options-modified')).toHaveText('0 modified')
  await selectSolverCategory(panel, 'ambiguity')
  const ratio = panel.locator('[data-option="ratioThreshold"] input')
  const importedMin = panel.locator('[data-option="ratioMin"]')
  await expect(ratio).toHaveValue('6.00')
  await expect(importedMin.locator('.option-modified-dot')).toHaveCount(0)
  await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
  await panel
    .locator('.file-row')
    .filter({ hasText: 'Solution file' })
    .locator('input')
    .fill('/data/changed.pos')
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('nav-tools:gnssraw-rtkpost-v1')!).options?.ratioMin,
      ),
    )
    .toBe(1)
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('nav-tools:gnssraw-rtkpost-v1')!).configPath,
    ),
  ).toBe('')
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  await ratio.fill('3')
  await ratio.press('Tab')
  await expect(panel.locator('[data-option="ratioThreshold"] .option-modified-dot')).toHaveCount(1)
  await expect(panel.locator('.options-modified')).toHaveText('1 modified')
  await expect(panel.getByRole('button', { name: 'Execute', exact: true })).toBeDisabled()
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('nav-tools:gnssraw-rtkpost-v1')!),
  )
  expect(before.configPath ?? '').toBe('')
  expect(before.options?.ratioMin).toBe(1)
  await panel.getByRole('button', { name: 'Confirm', exact: true }).click()
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('nav-tools:gnssraw-rtkpost-v1')!),
  )
  expect(after.configPath).toBe('/data/source.conf')
  expect(after.options).toMatchObject({ ratioThreshold: 3, ratioMin: 1.4 })
  expect(await page.evaluate(() => Reflect.get(window, '__postSaveCalls'))).toBe(0)
  await expect(panel.getByRole('button', { name: 'Execute', exact: true })).toBeEnabled()

  await page.reload()
  await expect(panel).toBeVisible()
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  await selectSolverCategory(panel, 'ambiguity')
  await expect(panel.locator('[data-option="ratioThreshold"] input')).toHaveValue('3.00')
  await expect(panel.locator('[data-option="ratioThreshold"] .option-modified-dot')).toHaveCount(1)
  await expect(panel.locator('[data-option="ratioMin"] .option-modified-dot')).toHaveCount(0)
  await panel.locator('[data-option="ratioThreshold"] input').fill('6')
  await panel.locator('[data-option="ratioThreshold"] input').press('Tab')
  await expect(panel.locator('[data-option="ratioThreshold"] .option-modified-dot')).toHaveCount(0)
})

test('saves through the chosen file and leaves the draft untouched when save is cancelled', async ({
  page,
}) => {
  const panel = await optionsPanel(page)
  await page.evaluate(() => {
    Reflect.set(window, '__postSaveRequests', [])
    Reflect.set(window, '__postSavePath', null)
    Reflect.set(
      window.electronAPI,
      'rtkPostReadConfig',
      async () => '# source comment\npos2-arthres=6\nfile-dcbfile=/data/custom.dcb\n',
    )
    Reflect.set(window.electronAPI, 'rtkPostSaveConfig', async (request: unknown) => {
      Reflect.get(window, '__postSaveRequests').push(request)
      return Reflect.get(window, '__postSavePath')
    })
  })
  const config = panel.locator('.config-file-panel input')
  await config.fill('/data/source.conf')
  await config.press('Enter')
  await expect(panel.locator('.config-status')).toContainText('Loaded 1 parameters')
  await selectSolverCategory(panel, 'ambiguity')
  const ratio = panel.locator('[data-option="ratioThreshold"] input')
  await ratio.fill('4.2')
  await ratio.press('Tab')
  await panel.getByRole('button', { name: 'Save config file', exact: true }).click()
  await expect(panel.locator('.options-modified')).toHaveText('1 modified')
  await expect(panel.getByRole('button', { name: 'Execute', exact: true })).toBeDisabled()
  const first = await page.evaluate(() => Reflect.get(window, '__postSaveRequests')[0])
  expect(first.defaultPath).toBe('/data/source.conf')
  expect(first.content).toContain('pos2-arthres=4.2')
  expect(first.content).toContain('file-dcbfile=/data/custom.dcb')
  expect(first.protectedPaths).toEqual(
    expect.arrayContaining(['/data/rover.obs', '/data/base.obs', '/data/rover.nav']),
  )
  await page.evaluate(() => Reflect.set(window, '__postSavePath', '/data/saved.conf'))
  await panel.getByRole('button', { name: 'Save config file', exact: true }).click()
  await expect(config).toHaveValue('/data/saved.conf')
  await expect(panel.locator('.options-modified')).toHaveText('0 modified')
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('nav-tools:gnssraw-rtkpost-v1')!),
  )
  expect(saved.configPath).toBe('/data/saved.conf')
  expect(saved.options.ratioThreshold).toBe(4.2)
})

test('discarding a loaded and edited draft restores the confirmed options', async ({ page }) => {
  const panel = await optionsPanel(page)
  await page.evaluate(() =>
    Reflect.set(window.electronAPI, 'rtkPostReadConfig', async () => 'pos2-arthres=6\n'),
  )
  const config = panel.locator('.config-file-panel input')
  await config.fill('/data/unconfirmed.conf')
  await config.press('Enter')
  await expect(panel.locator('.config-status')).toContainText('Loaded 1 parameters')
  await selectSolverCategory(panel, 'ambiguity')
  const ratio = panel.locator('[data-option="ratioThreshold"] input')
  await ratio.fill('4')
  await ratio.press('Tab')
  await expect(panel.locator('.options-modified')).toHaveText('1 modified')
  await panel.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(config).toHaveValue('')
  await expect(ratio).toHaveValue('3.00')
  await expect(panel.locator('.options-modified')).toHaveText('0 modified')
  await expect(panel.getByRole('button', { name: 'Execute', exact: true })).toBeEnabled()
})

test('adapts to component width and supports category keyboard navigation without overflowing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 1000 })
  const panel = await optionsPanel(page)
  await page.locator('.box-card').filter({ has: panel }).locator('.fullscreen-btn').click()
  await resizeSolver(panel, 940)
  await expect(panel.locator('.options-categories')).toBeVisible()
  const common = panel.locator('[data-category="common"]')
  await common.focus()
  await common.press('ArrowDown')
  await expect(panel.locator('[data-category="ambiguity"]')).toBeFocused()
  await expect(panel.locator('.options-heading h3')).toHaveText('Ambiguity fixing')
  await panel.screenshot({
    path: 'test-results/gnss-solver-options-wide.png',
    animations: 'disabled',
  })
  await resizeSolver(panel, 390)
  await expect(panel.locator('.options-categories')).toBeHidden()
  await expect(panel.locator('.options-category-picker')).toBeVisible()
  await selectSolverCategory(panel, 'common')
  await expect(panel.locator('[data-option="mode"]')).toBeVisible()
  expect(
    await panel
      .locator('.solver-options')
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true)
  const modeBox = await panel.locator('[data-option="mode"]').boundingBox()
  const frequencyBox = await panel.locator('[data-option="frequency"]').boundingBox()
  expect(frequencyBox!.y).toBeGreaterThan(modeBox!.y)
  await page.evaluate(async () => {
    const path = '/src/i18n/index.ts'
    const { i18n } = await import(/* @vite-ignore */ path)
    i18n.global.locale.value = 'zh-CN'
  })
  await expect(panel.locator('.options-heading h3')).toHaveText('常用')
  await panel.screenshot({
    path: 'test-results/gnss-solver-options-narrow.png',
    animations: 'disabled',
  })
})

test('uses the same layout for live processing with only supported categories and retains manual base coordinates', async ({
  page,
}) => {
  const panel = await optionsPanel(page, 'realtime')
  await expect(panel.locator('.options-categories [role="tab"]')).toHaveCount(5)
  await selectField(panel, 'mode', 'Kinematic RTK')
  await selectSolverCategory(panel, 'ambiguity')
  const ratio = panel.locator('[data-option="ratioThreshold"] input')
  await ratio.fill('4.2')
  await ratio.press('Tab')
  await selectSolverCategory(panel, 'filter')
  const phaseError = panel.locator('[data-option="phaseErrorM"] input')
  await phaseError.fill('0.012')
  await phaseError.press('Tab')
  await selectSolverCategory(panel, 'base')
  await selectField(panel, 'basePositionMode', 'Manual LLH')
  const latitude = panel.locator('[data-option="baseLatitudeDeg"] input')
  await latitude.fill('31.12345678')
  await latitude.press('Tab')
  await selectField(panel, 'basePositionMode', 'RTCM station position')
  await expect(latitude).toHaveCount(0)
  await selectField(panel, 'basePositionMode', 'Manual LLH')
  await expect(latitude).toHaveValue('31.12345678')
  await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
  const base = panel.locator('.stream-section').nth(1)
  await base.locator('.el-switch').click()
  await base.locator('.stream-path input').fill('caster.example:2101/base')
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  await panel.getByRole('button', { name: 'Start', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, '__solverLiveRequest')?.options.baseLatitudeDeg),
    )
    .toBe(31.12345678)
  const request = await page.evaluate(() => Reflect.get(window, '__solverLiveRequest'))
  expect(request.options).toMatchObject({ ratioThreshold: 4.2, phaseErrorM: 0.012 })
  expect(request.advancedOptionOverrides).toEqual(
    expect.arrayContaining(['ratioThreshold', 'phaseErrorM']),
  )
  await expect(latitude).toBeDisabled()
})

test('synchronizes basic real-time controls from an rtkrcv configuration file', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'nav-tools:gnsslib-rtknavi-v1',
      JSON.stringify({
        options: { mode: 2, baseConfigPath: '/data/single.conf' },
        inputs: [
          {
            type: 'file',
            enabled: true,
            path: '/data/rover.rtcm3',
            format: 'rtcm3',
            timeTag: false,
            replaySpeed: 1,
          },
        ],
      }),
    )
  })
  const panel = await optionsPanel(page, 'realtime')
  await page.evaluate(() =>
    Reflect.set(window.electronAPI, 'rtkPostReadConfig', async () =>
      [
        'pos1-posmode=single',
        'pos1-frequency=l1+l2',
        'pos1-elmask=17.5',
        'pos1-navsys=9',
        'pos2-armode=off',
        'ant2-postype=llh',
      ].join('\n'),
    ),
  )

  await panel.getByRole('button', { name: 'Reload configuration file' }).click()

  await expect(panel.locator('.base-config-status')).toContainText(
    'Configuration values synchronized',
  )
  await selectSolverCategory(panel, 'common')
  await expect(panel.locator('[data-option="mode"] .el-select')).toHaveText('Single')
  await expect(panel.locator('[data-option="frequency"] .el-select')).toHaveText('L1 + L2')
  await expect(panel.locator('[data-option="elevationMaskDeg"] input')).toHaveValue('17.5')
  const options = await page.evaluate(async () => {
    const { useRtkNavi } = await import('/src/composables/useRtkNavi.ts')
    const value = useRtkNavi().settings.options
    return {
      mode: value.mode,
      frequency: value.frequency,
      elevationMaskDeg: value.elevationMaskDeg,
      ambiguityResolution: value.ambiguityResolution,
      constellations: [...value.constellations],
      basePositionMode: value.basePositionMode,
    }
  })
  expect(options).toEqual({
    mode: 0,
    frequency: 2,
    elevationMaskDeg: 17.5,
    ambiguityResolution: 'off',
    constellations: ['G', 'E'],
    basePositionMode: 'llh',
  })
})

test('imports legacy base config parameters while preserving explicit real-time edits', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'nav-tools:gnsslib-rtknavi-v1',
      JSON.stringify({
        options: { mode: 0, baseConfigPath: '/data/legacy.conf' },
        inputs: [
          {
            type: 'file',
            enabled: true,
            path: '/data/rover.rtcm3',
            format: 'rtcm3',
            timeTag: false,
            replaySpeed: 1,
          },
        ],
      }),
    )
  })
  const panel = await optionsPanel(page, 'realtime')
  await page.evaluate(() =>
    Reflect.set(
      window.electronAPI,
      'rtkPostReadConfig',
      async () => 'pos2-arthres=6\npos2-thresdop=0.7\nstats-errphase=0.02\n',
    ),
  )
  const config = panel.locator('.base-config-row input')
  await panel.getByRole('button', { name: 'Reload configuration file' }).click()
  await expect(panel.locator('.base-config-status')).toContainText(
    'Configuration values synchronized',
  )
  await selectSolverCategory(panel, 'ambiguity')
  // Single positioning hides ambiguity controls; switch to kinematic to inspect them.
  await selectSolverCategory(panel, 'common')
  await selectField(panel, 'mode', 'Kinematic RTK')
  await selectSolverCategory(panel, 'ambiguity')
  const ratio = panel.locator('[data-option="ratioThreshold"] input')
  await expect(ratio).toHaveValue('6.00')
  await ratio.fill('3')
  await ratio.press('Tab')
  await selectSolverCategory(panel, 'quality')
  await expect(panel.locator('[data-option="dopplerSlipThresholdHz"] input')).toHaveValue('0.700')
  await selectSolverCategory(panel, 'filter')
  await expect(panel.locator('[data-option="phaseErrorM"] input')).toHaveValue('0.0200')
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('nav-tools:gnsslib-rtknavi-v1')!),
  )
  expect(saved.advancedOptionOverrides).toEqual(['ratioThreshold'])
  await config.fill('/data/updated.conf')
  await config.press('Enter')
  await expect(panel.locator('.base-config-status')).toContainText(
    'Configuration values synchronized',
  )
  await selectSolverCategory(panel, 'ambiguity')
  await expect(ratio).toHaveValue('3.00')
  await panel.getByRole('button', { name: 'Restore advanced values from file' }).click()
  await expect(ratio).toHaveValue('6.00')
})

test('waits for a pending configuration read and cancels startup when stopped', async ({
  page,
}) => {
  const panel = await optionsPanel(page, 'realtime')
  await page.evaluate(() => {
    Reflect.set(window, '__liveConfigReads', 0)
    Reflect.set(window.electronAPI, 'rtkPostReadConfig', () => {
      Reflect.set(window, '__liveConfigReads', Reflect.get(window, '__liveConfigReads') + 1)
      return new Promise((resolve) => Reflect.set(window, '__resolveLiveConfig', resolve))
    })
  })
  const config = panel.locator('.base-config-row input')
  await config.fill('/data/slow.conf')
  await config.press('Enter')
  await expect(panel.locator('.base-config-status')).toContainText('Loading')
  await panel.getByRole('button', { name: 'Start', exact: true }).click()
  await panel.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.evaluate(() => Reflect.get(window, '__resolveLiveConfig')('pos2-arthres=6\n'))
  await expect(panel.locator('.base-config-status')).toContainText(
    'Configuration values synchronized',
  )
  await expect(panel.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, '__solverLiveRequest'))).toBeUndefined()
  expect(await page.evaluate(() => Reflect.get(window, '__liveConfigReads'))).toBe(1)

  await panel.getByRole('button', { name: 'Reload configuration file' }).click()
  await expect(panel.locator('.base-config-status')).toContainText('Loading')
  await panel.getByRole('button', { name: 'Start', exact: true }).click()
  await page.evaluate(() => Reflect.get(window, '__resolveLiveConfig')('pos2-arthres=5\n'))
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, '__solverLiveRequest')?.options.ratioThreshold),
    )
    .toBe(5)
  expect(await page.evaluate(() => Reflect.get(window, '__liveConfigReads'))).toBe(2)
})
