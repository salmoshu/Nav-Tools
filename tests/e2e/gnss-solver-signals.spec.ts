import { expect, test } from '@playwright/test'
import { openSolver } from './support/gnssSolver'

test.beforeEach(async ({ page }) => {
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
})

test('shows the GGA satellite counts from the solver and follows its timeline', async ({
  page,
}) => {
  const solver = await openSolver(page)
  const signals = page.locator('.snr-container')
  await expect(signals).toBeVisible()
  await page.evaluate(async () => {
    const modulePath = '/src/composables/gnss/useNmea.ts'
    const { useNmea } = await import(/* @vite-ignore */ modulePath)
    // An unrelated receiver has satellite details; the solver must not display them.
    const body = 'GPGSV,1,1,01,03,45,123,42'
    let checksum = 0
    for (const character of body) checksum ^= character.charCodeAt(0)
    useNmea().parseNmea(`$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}`)
  })

  await solver.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__solverPostCalls'))).toBe(1)
  await page.evaluate(() => {
    const sentence = (body: string) => {
      let checksum = 0
      for (const character of body) checksum ^= character.charCodeAt(0)
      return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`
    }
    const text =
      sentence('GPRMC,000000.00,A,3100.0000,N,12100.0000,E,0,0,300724,,,A') +
      [7, 12, 8]
        .map((count, index) =>
          sentence(
            `GPGGA,00000${index}.00,3100.0000,N,12100.0000,E,4,${count},1.0,10.0,M,20.0,M,,`,
          ),
        )
        .join('')
    Reflect.get(window, '__solverCompletePost')({ count: 3, text })
  })
  await expect(solver.locator('.solver-state.success')).toBeVisible()
  await expect(signals.locator('.satellite-count-legend')).toContainText('GGA')
  await expect(signals.locator('.legend-current')).toHaveText('8')

  await page.evaluate(async () => {
    const modulePath = '/src/composables/useGnssSolverSession.ts'
    const { useGnssSolverSession } = await import(/* @vite-ignore */ modulePath)
    useGnssSolverSession().display.timeline.seekElapsedTime(0)
  })
  await expect(signals.locator('.legend-current')).toHaveText('7')

  await signals.locator('.view-select').click()
  await page.getByRole('option', { name: 'Bar Chart View', exact: true }).click()
  await expect(signals.locator('.signal-bar-empty')).toBeVisible()
  await expect(signals.locator('.solver-signal-hint')).toContainText('Per-satellite signal details')
  await signals.locator('.view-select').click()
  await page.getByRole('option', { name: 'Satellite Count', exact: true }).click()
  await signals.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(signals.locator('.legend-current')).toHaveCount(0)
  const globalSatellites = await page.evaluate(async () => {
    const modulePath = '/src/composables/gnss/useNmea.ts'
    const { useNmea } = await import(/* @vite-ignore */ modulePath)
    return useNmea().satelliteSnrData.value.length
  })
  expect(globalSatellites).toBeGreaterThan(0)
})

test('shows RTKLIB POS ns counts in the same solver component', async ({ page }) => {
  const solver = await openSolver(page)
  const signals = page.locator('.snr-container')
  await solver.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__solverPostCalls'))).toBe(1)
  await page.evaluate(() => {
    const text =
      '% GPST latitude(deg) longitude(deg) height(m) Q ns\n' +
      '2024/07/30 00:00:00.000 31.0 121.0 10.0 1 9\n' +
      '2024/07/30 00:00:01.000 31.0 121.0 10.0 1 11\n'
    Reflect.get(window, '__solverCompletePost')({ count: 2, text })
  })
  await expect(solver.locator('.solver-state.success')).toBeVisible()
  await expect(signals.locator('.satellite-count-legend')).toContainText('RTKLIB POS ns')
  await expect(signals.locator('.legend-current')).toHaveText('11')
})

test('keeps real-time satellite counts available after stopping', async ({ page }) => {
  const solver = await openSolver(page, 'realtime')
  const signals = page.locator('.snr-container')
  await solver.getByRole('button', { name: 'Start', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__solverLiveRequest')))
    .toBeTruthy()
  await page.evaluate(() => Reflect.get(window, '__solverEmitLive')(0, 3))
  await expect(signals.locator('.legend-current')).toHaveText('12')
  await solver.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.evaluate(() => Reflect.get(window, '__solverFinishLiveStop')())
  await expect(solver.locator('.solver-state.stopped')).toBeVisible()
  await expect(signals.locator('.legend-current')).toHaveText('12')
})
