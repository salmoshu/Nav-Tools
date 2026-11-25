import { expect, test } from '@playwright/test'
import { openSolver } from './support/gnssSolver'

test('offers RTKLIB-EX first and remembers the selected engine across restarts', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const key = 'nav-tools:gnssraw-rtkpost-v1'
    if (localStorage.getItem(key) === null) localStorage.setItem(key, '{}')
  })
  const panel = await openSolver(page)
  const engine = panel
    .locator('.file-row')
    .filter({ hasText: 'Processing engine' })
    .locator('.el-select')
  await expect(engine).toContainText('OpenGNSS')
  await engine.click()
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
    'RTKLIB-EX',
    'OpenGNSS',
    'StarRTK',
  ])
  await page.getByRole('option', { name: 'StarRTK', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('nav-tools:gnssraw-rtkpost-v1') ?? '{}').engine,
      ),
    )
    .toBe('starrtk')
  await page.reload()
  await expect(engine).toContainText('StarRTK')
})

test('shares one responsive options layout across the three post engines', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 })
  const panel = await openSolver(page)
  const engine = panel
    .locator('.file-row')
    .filter({ hasText: 'Processing engine' })
    .locator('.el-select')
  let fieldTypography: { family: string; size: string; weight: string } | undefined
  for (const name of ['OpenGNSS', 'RTKLIB-EX', 'StarRTK']) {
    await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
    await engine.click()
    await page.getByRole('option', { name, exact: true }).click()
    await panel.getByRole('tab', { name: 'Options', exact: true }).click()
    const heading = panel.locator('.solver-config-heading')
    await expect(heading.locator('strong')).toHaveText(name)
    await expect(heading.locator('code')).toHaveText(name === 'StarRTK' ? 'YAML' : '.conf')
    const editor = panel.locator('.solver-option-editor')
    await expect(editor.locator('.options-search')).toBeVisible()
    await expect(editor.locator('.options-category-picker')).toBeVisible()
    await expect(editor.locator('.options-form')).toHaveCSS('border-top-left-radius', '9px')
    const actions = panel.locator('.solver-config-actions')
    await expect(actions.getByRole('button')).toHaveCount(2)
    for (const button of await actions.getByRole('button').all()) {
      await expect(button).toHaveCSS('font-size', '12px')
    }
    const fieldName = editor
      .locator(
        '.options-field-grid .option-field > label:visible, .options-field-grid > label:visible > span:first-child',
      )
      .first()
    await expect(fieldName).toBeVisible()
    const typography = await fieldName.evaluate((label) => {
      const { fontFamily, fontSize, fontWeight } = getComputedStyle(label)
      return { family: fontFamily, size: fontSize, weight: fontWeight }
    })
    fieldTypography ??= typography
    expect(typography).toEqual(fieldTypography)
    expect(await editor.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  }
})

test('loads, edits and saves independent RTKLIB-EX options', async ({ page }) => {
  const panel = await openSolver(page)
  const engine = panel
    .locator('.file-row')
    .filter({ hasText: 'Processing engine' })
    .locator('.el-select')
  const executable = panel.locator('.file-row').filter({ hasText: 'Executable' }).locator('input')
  const config = 'pos1-posmode=single\npos1-soltype=3\nstats-prnpos=0.02\nout-solformat=nmea\n'
  const configPath = 'C:/ex/native.conf'
  const exPath = 'C:/ex/rnx2rtkp.exe'
  await page.evaluate(
    ({ config, configPath }) => {
      const ipc = Reflect.get(window, 'ipcRenderer')
      const invoke = ipc.invoke.bind(ipc)
      ipc.invoke = async (channel: string, value?: { scope?: string }) =>
        channel === 'open-file-dialog' && value?.scope === 'rtklib-ex-config'
          ? [configPath]
          : invoke(channel, value)
      window.electronAPI.rtkPostReadConfig = async (path) => {
        if (path !== configPath) throw new Error('Unexpected config file')
        return config
      }
      window.electronAPI.rtkPostSaveConfig = async (request) => {
        Reflect.set(window, '__rtklibExSaved', request)
        return 'C:/ex/export.conf'
      }
    },
    { config, configPath },
  )

  async function selectEngine(name: string) {
    await engine.click()
    await page.getByRole('option', { name, exact: true }).click()
  }

  await expect(engine).toContainText('OpenGNSS')
  await expect(executable).toHaveValue('/tools/rnx2rtkp')
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  await expect(
    panel.getByText('Load .conf parameters; current form values take priority.', { exact: true }),
  ).toHaveCount(0)
  await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
  await selectEngine('RTKLIB-EX')
  await expect(executable).toHaveValue('')
  await executable.fill(exPath)
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  await panel.getByRole('button', { name: 'Load .conf', exact: true }).click()
  await expect(panel.locator('.ex-config-path')).toHaveText(configPath)
  const search = panel.getByPlaceholder('Search RTKLIB-EX parameters')
  await search.fill('pos1-soltype')
  await expect(panel.locator('[data-ex-option="pos1-soltype"]')).toContainText(
    'combined-nophasereset',
  )
  await search.fill('stats-prnpos')
  const noise = panel.locator('[data-ex-option="stats-prnpos"] input')
  await expect(noise).toHaveValue('0.02')
  await noise.fill('0.03')
  await noise.press('Tab')
  await panel.getByRole('button', { name: 'Save .conf', exact: true }).click()
  await expect(panel.locator('.ex-config-path')).toHaveText('C:/ex/export.conf')
  expect(await page.evaluate(() => Reflect.get(window, '__rtklibExSaved'))).toMatchObject({
    defaultPath: configPath,
    content: expect.stringContaining('stats-prnpos=0.03\n'),
    protectedPaths: expect.arrayContaining([exPath]),
  })

  await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
  await expect(
    panel.locator('.file-row').filter({ hasText: 'RINEX OBS: Base station' }),
  ).toBeHidden()
  await selectEngine('OpenGNSS')
  await expect(executable).toHaveValue('/tools/rnx2rtkp')
  await selectEngine('RTKLIB-EX')
  await expect(executable).toHaveValue(exPath)
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  await expect(panel.locator('.ex-config-path')).toHaveText('C:/ex/export.conf')
})
