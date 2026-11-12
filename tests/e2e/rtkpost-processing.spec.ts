import { expect, test } from '@playwright/test'
import { openSolver, solverSnapshot } from './support/gnssSolver'

test('merges legacy engine entries and imports complete post-processing results into isolated messages and Deviation', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const panel = await openSolver(page)
  await expect(panel).toHaveCount(1)
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('nav-tools:custom-applications')!).find(
          (app: { id: string }) => app.id === 'gnsslib',
        ).windowIds,
    ),
  ).toEqual(['gnsslib-solver', 'raw-messages', 'gnss-deviation'])
  await page.evaluate(async () => {
    const nmeaPath = '/src/composables/gnss/useNmea.ts'
    const consolePath = '/src/composables/flow/useConsole.ts'
    const { useNmea } = await import(/* @vite-ignore */ nmeaPath)
    const { useConsole } = await import(/* @vite-ignore */ consolePath)
    useNmea().clearData()
    useNmea().processRtkLibPosData('2024/07/30 00:00:00.000 35 139 10 5 12\n')
    useConsole(true).addMessage('receiver-only-record\n')
  })
  await panel.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__solverPostCalls'))).toBe(1)
  await expect(panel.getByRole('radio', { name: 'Real-time', exact: true })).toBeDisabled()
  await page.evaluate(() => Reflect.get(window, '__solverEmitPost')(50))
  await expect(panel.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  await expect(panel.locator('.processing-message')).toHaveText(
    'processing : 2024/07/30 00:00:30 Q=2',
  )
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  await expect(panel.getByRole('progressbar')).toBeInViewport({ ratio: 1 })
  const statusbar = panel.locator('.solver-statusbar')
  await panel.locator('.solver-form').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(statusbar.getByRole('progressbar')).toBeInViewport({ ratio: 1 })
  const solverBox = (await panel.boundingBox())!
  const statusBox = (await statusbar.boundingBox())!
  expect(
    Math.abs(statusBox.y + statusBox.height - solverBox.y - solverBox.height),
  ).toBeLessThanOrEqual(1)
  await page.evaluate(() => Reflect.get(window, '__solverCompletePost')({ count: 1205 }))
  await expect(panel.locator('.solver-state.success')).toBeVisible()
  await expect(panel.getByRole('tab', { name: 'Summary', exact: true })).toHaveCount(0)
  await expect(panel.getByRole('tab', { name: 'Options', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(panel.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  await expect.poll(async () => (await solverSnapshot(page)).positions).toBe(1205)
  await expect.poll(async () => (await solverSnapshot(page)).messages).toBe(1206)
  expect((await solverSnapshot(page)).points).toBe(1205)
  await expect(page.locator('.deviation-status-card')).toContainText('Fixed')
  await expect(page.locator('.flow-console-virtual')).not.toContainText('receiver-only-record')
  expect(
    await page.evaluate(async () => {
      const path = '/src/composables/gnss/useNmea.ts'
      const { useNmea } = await import(/* @vite-ignore */ path)
      return useNmea().positionEpochHistory.value.length
    }),
  ).toBe(1)
  await page.screenshot({ path: 'test-results/gnss-solver-post.png', fullPage: true })
  expect(errors).toEqual([])
})

test('loads NMEA selected by a config file into messages and Deviation with LLH still selected in the UI', async ({
  page,
}) => {
  const panel = await openSolver(page)
  await expect(panel.locator('.solver-statusbar')).toContainText('Idle')
  await panel.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__solverPostCalls'))).toBe(1)
  expect(
    await page.evaluate(() => Reflect.get(window, '__solverPostRequest').options.outputFormat),
  ).toBe('llh')
  await page.evaluate(() => {
    const sentence = (body: string) => {
      let checksum = 0
      for (const char of body) checksum ^= char.charCodeAt(0)
      return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`
    }
    const text =
      sentence('GPRMC,000000.00,A,3100.0000,N,12100.0000,E,0,0,300724,,,A') +
      [4, 5, 1]
        .map((quality, index) =>
          sentence(
            `GPGGA,00000${index}.00,3100.0000,N,12100.0000,E,${quality},12,1.0,10.0,M,20.0,M,,`,
          ),
        )
        .join('')
    Reflect.get(window, '__solverCompletePost')({ count: 3, text })
  })
  await expect(panel.locator('.solver-statusbar .solver-state.success')).toBeVisible()
  await expect.poll(async () => (await solverSnapshot(page)).positions).toBe(3)
  await expect(page.locator('.deviation-status-card')).toContainText('Single')
  await expect(page.locator('.flow-console-virtual')).toContainText('$GPGGA')
})

test('shows native errors in the unified status and message log even for exit code zero', async ({
  page,
}) => {
  const panel = await openSolver(page)
  await panel.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__solverPostCalls'))).toBe(1)
  await page.evaluate(() => {
    Reflect.get(window, '__solverEmitPost')(25)
    Reflect.get(
      window,
      '__solverCompletePost',
    )({ ok: false, error: 'error : no nav data', log: 'error : no nav data\n' })
  })
  await expect(panel.locator('.solver-error')).toHaveText('error : no nav data')
  await expect(panel.locator('.solver-state.error')).toBeVisible()
  await expect(page.locator('.flow-console-virtual')).toContainText('error : no nav data')
  await expect(panel.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
  expect((await solverSnapshot(page)).positions).toBe(0)
})

test('validates navigation inputs before calling the engine', async ({ page }) => {
  const panel = await openSolver(page)
  await panel.locator('input[placeholder="NAV / CLK / SP3 / FCB / IONEX / SBAS"]').fill('')
  await panel.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect(panel.locator('.solver-error')).toContainText('Select at least one navigation file')
  expect(await page.evaluate(() => Reflect.get(window, '__solverPostCalls'))).toBe(0)
  await expect(page.locator('.flow-console-virtual')).toContainText(
    'Select at least one navigation file',
  )
})

test('keeps modes locked while cancellation awaits the native exit and supports indeterminate progress', async ({
  page,
}) => {
  const panel = await openSolver(page)
  await panel.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__solverPostCalls'))).toBe(1)
  await page.evaluate(() => Reflect.get(window, '__solverEmitPost')(null))
  await expect(panel.locator('.el-progress-bar__inner--indeterminate')).toBeVisible()
  await panel.getByRole('button', { name: 'Abort', exact: true }).click()
  await expect(panel.locator('.solver-state.stopping')).toBeVisible()
  await expect(panel.getByRole('radio', { name: 'Real-time', exact: true })).toBeDisabled()
  await page.evaluate(() =>
    Reflect.get(window, '__solverCompletePost')({ ok: false, cancelled: true }),
  )
  await expect(panel.locator('.solver-state.cancelled')).toBeVisible()
  await expect(panel.getByRole('radio', { name: 'Real-time', exact: true })).toBeEnabled()
  await expect(panel.locator('.el-progress-bar__inner--indeterminate')).toHaveCount(0)
})

test('keeps keyboard navigation, the base marker and controls usable in a narrow solver', async ({
  page,
}) => {
  const panel = await openSolver(page)
  const options = panel.getByRole('tab', { name: 'Options', exact: true })
  await options.click()
  await options.press('End')
  await expect(options).toBeFocused()
  await options.press('ArrowRight')
  await expect(panel.getByRole('tab', { name: 'Inputs', exact: true })).toBeFocused()
  const label = panel.locator('.file-row > label').filter({ hasText: 'RINEX OBS: Base station' })
  const star = await label.locator('.required').boundingBox()
  const text = await label.boundingBox()
  expect(star!.y + star!.height / 2).toBeGreaterThanOrEqual(text!.y)
  expect(star!.y + star!.height / 2).toBeLessThanOrEqual(text!.y + text!.height)
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 390, height: 844 })
  await panel.evaluate((element) => {
    element.style.width = '390px'
    element.style.maxWidth = '390px'
  })
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  )
})

test('reattaches to an active post-processing task after a page reload and imports its final file once', async ({
  page,
}) => {
  const panel = await openSolver(page)
  await panel.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__solverPostCalls'))).toBe(1)
  const runId = (await solverSnapshot(page)).runId
  await page.reload()
  await expect(panel.locator('.solver-state.running')).toBeVisible()
  expect((await solverSnapshot(page)).runId).toBe(runId)
  await expect(panel.getByRole('radio', { name: 'Real-time', exact: true })).toBeDisabled()
  await page.evaluate(() => {
    Reflect.get(window, '__solverEmitPost')(80)
    Reflect.get(window, '__solverCompletePost')({ count: 1205 })
  })
  await expect(panel.locator('.solver-state.success')).toBeVisible()
  await expect.poll(async () => (await solverSnapshot(page)).positions).toBe(1205)
  await expect(panel.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  await expect(panel.getByRole('radio', { name: 'Real-time', exact: true })).toBeEnabled()
})

test('loads a configuration into the visible form and executes the edited values', async ({
  page,
}) => {
  const panel = await openSolver(page)
  await panel.screenshot({ path: 'test-results/gnss-solver-inputs.png' })
  await page.evaluate(() => {
    Reflect.set(window.electronAPI, 'rtkPostReadConfig', async () =>
      [
        'pos1-posmode=static',
        'pos1-frequency=l1+l2+l5',
        'pos2-arthresmin=1.3',
        'pos2-minfixsats=8',
        'stats-eratio1=250',
        'out-solformat=nmea',
      ].join('\n'),
    )
  })
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  const configInput = panel.locator('.config-file-panel input')
  await configInput.fill('/data/rover-es.conf')
  await configInput.press('Enter')
  await expect(panel.locator('.config-status')).toContainText('Loaded 6 parameters')
  await expect(
    panel
      .locator('.option-field')
      .filter({ hasText: 'Positioning mode' })
      .locator('.el-select__placeholder'),
  ).toHaveText('Static RTK')
  await expect(
    panel.locator('.option-field').filter({ hasText: 'Min satellites to fix' }).locator('input'),
  ).toHaveValue('8')
  await expect(
    panel
      .locator('.option-field')
      .filter({ hasText: 'Coordinate / protocol format' })
      .locator('.el-select__placeholder'),
  ).toHaveText('NMEA-0183 GGA')
  await expect(panel.locator('.options-section')).not.toContainText('Start time (GPST)')
  await expect(panel.locator('.options-section')).not.toContainText('End time (GPST)')

  const ratio = panel.locator('.option-field').filter({ hasText: 'Minimum ratio' }).locator('input')
  await ratio.fill('2.2')
  await ratio.press('Enter')
  await panel.locator('.config-file-panel').scrollIntoViewIfNeeded()
  await panel.screenshot({ path: 'test-results/gnss-solver-options-top.png' })
  await panel.locator('.advanced-options').scrollIntoViewIfNeeded()
  await panel.screenshot({ path: 'test-results/gnss-solver-options-advanced.png' })
  expect(
    await panel
      .locator('.file-row input')
      .evaluateAll((inputs) =>
        inputs.every((input) => input.getAttribute('spellcheck') === 'false'),
      ),
  ).toBe(true)

  await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
  await panel.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__solverPostCalls'))).toBe(1)
  const request = await page.evaluate(() => Reflect.get(window, '__solverPostRequest'))
  expect(request.options).toMatchObject({
    mode: 3,
    frequency: 3,
    ratioMin: 2.2,
    minFixSats: 8,
    errorRatioL1: 250,
    outputFormat: 'nmea',
  })
  expect(request.configContent).toContain('pos1-posmode=static')
})

test('keeps the empty Deviation status concise in normal and pure-content modes', async ({
  page,
}) => {
  await openSolver(page)
  const status = page.locator('.deviation-status-card')
  await expect(status.locator('.status-card-summary')).toHaveText('No positioning data')
  await expect(status.locator('.status-card-heading')).toHaveCount(0)
  await expect(status.locator('.status-card-body')).toHaveCount(0)

  const card = page.locator('.box-card').filter({ hasText: 'GNSS Deviation' }).first()
  await card.locator('.panel-actions-trigger').click()
  await page.getByRole('menuitem', { name: 'Pure content', exact: true }).last().click()
  await expect(card).toHaveClass(/pure-content-card/)
  await expect(status.locator('.status-card-summary')).toHaveText('No positioning data')
  await expect(status.locator('.status-card-heading')).toHaveCount(0)
  await expect(status.locator('.status-card-body')).toHaveCount(0)
})
