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

test('renders satellite counts from native rnx2rtkp NMEA in the production bundle', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.addInitScript(() => {
    localStorage.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'gnsslib',
          name: 'GNSS-Lib with Signals',
          description: 'Solver signal integration test',
          icon: 'satellite',
          accent: '#7c3aed',
          windowIds: ['gnsslib-solver', 'raw-messages', 'gnss-deviation', 'gnss-signals'],
        },
      ]),
    )
  })
  const solver = await openSolver(page)
  const signals = page.locator('.snr-container')
  await solver.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__solverPostCalls'))).toBe(1)
  // Captured from rnx2rtkp -n using this repository's RINEX fixture, including a date rollover.
  const nmea =
    [
      '$GPRMC,235947.00,A,3509.6520653,N,13936.8298099,E,0.00,0.00,010405,0.0,E,A,V*4A',
      '$GPGGA,235947.00,3509.6520653,N,13936.8298099,E,1,06,1.0,33.291,M,36.478,M,0.0,0000*74',
      '$GPRMC,000017.00,A,3509.6525645,N,13936.8298207,E,0.00,0.00,020405,0.0,E,A,V*46',
      '$GPGGA,000017.00,3509.6525645,N,13936.8298207,E,1,05,1.0,32.053,M,36.478,M,0.0,0000*75',
      '$GPRMC,000047.00,A,3509.6521737,N,13936.8300863,E,0.00,0.00,020405,0.0,E,A,V*4B',
      '$GPGGA,000047.00,3509.6521737,N,13936.8300863,E,1,05,1.0,32.957,M,36.478,M,0.0,0000*75',
    ].join('\r\n') + '\r\n'
  await page.evaluate(
    (text) => Reflect.get(window, '__solverCompletePost')({ count: 3, text }),
    nmea,
  )
  await expect(solver.locator('.solver-state.success')).toBeVisible()
  await expect(signals.locator('.satellite-count-legend')).toContainText('GGA')
  await expect(signals.locator('.legend-current')).toHaveText('5')
  await signals.locator('.view-select').click()
  await page.getByRole('option', { name: 'Bar Chart View', exact: true }).click()
  await expect(signals.locator('.solver-signal-hint')).toContainText('Per-satellite signal details')
  expect(errors).toEqual([])
})
