import { expect, test, type Page } from '@playwright/test'

function nmea(body: string): string {
  const checksum = [...body].reduce((sum, character) => sum ^ character.charCodeAt(0), 0)
  return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`
}

function signalEpoch(second: number, snr: number): string {
  const lines: string[] = []
  for (const talker of ['GP', 'GA', 'GB']) {
    for (let part = 1; part <= 2; part += 1) {
      const fields = Array.from({ length: 4 }, (_, index) => [
        String((part - 1) * 4 + index + 1).padStart(2, '0'),
        '45',
        '120',
        String(snr - index),
      ]).flat()
      lines.push(nmea(`${talker}GSV,2,${part},08,${fields.join(',')}`))
    }
  }
  lines.push(
    nmea(
      `GNGGA,1235${String(second).padStart(2, '0')},4807.038,N,01131.000,E,5,18,0.9,545.4,M,46.9,M,,`,
    ),
  )
  return lines.join('')
}

async function openSignals(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('nav-tools:locale', 'en-US'))
  const payload = encodeURIComponent(
    JSON.stringify({ componentName: 'GnssSignal', windowId: 'gnss-signal', title: 'Signals' }),
  )
  await page.goto(`/#card/${payload}`)
}

async function perSatOption(page: Page) {
  return page.evaluate(() => {
    const element = document.querySelector('.persat-chart') as HTMLElement & {
      __vueParentComponent?: {
        setupState?: {
          perSatChartInstance?: { getOption(): any } | { value: { getOption(): any } }
        }
      }
    }
    const state = element.__vueParentComponent?.setupState?.perSatChartInstance
    const instance = state && 'getOption' in state ? state : state?.value
    if (!instance) return { widths: [], zoom: [] }
    const option = instance.getOption()
    return {
      widths: option.series.map((series) => series.lineStyle?.width),
      zoom: option.dataZoom.map((zoom) => ({ start: zoom.start, end: zoom.end })),
    }
  })
}

test('orders Bar Chart above Table View and restores it after restart', async ({ page }) => {
  await openSignals(page)
  await page.locator('.view-select').click()
  const options = page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
  await expect(options.nth(0)).toHaveText('Bar Chart View')
  await expect(options.nth(1)).toHaveText('Table View')
  await options.nth(0).click()
  await expect(page.locator('.signal-bar-wrapper')).toBeVisible()

  await page.reload()
  await expect(page.locator('.view-select')).toContainText('Bar Chart View')
  await expect(page.locator('.signal-bar-wrapper')).toBeVisible()
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('nav-tools:view-selections:v1')!),
  )
  expect(stored['gnss-signal:view']).toBe('chart')
})

test('thickens per-satellite lines and supports right-drag zoom, wheel zoom and reset', async ({
  page,
}) => {
  await openSignals(page)
  for (const [second, snr] of [
    [0, 48],
    [1, 42],
    [2, 55],
  ]) {
    await page.evaluate(
      async (epoch) => {
        const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
        useNmea().processRawData(epoch)
      },
      signalEpoch(second, snr),
    )
  }
  await page.locator('.view-select').click()
  await page.getByRole('option', { name: 'Per-Satellite', exact: true }).click()
  await page.locator('.persat-select').click()
  await page.getByRole('option', { name: 'G1 · GPS', exact: true }).evaluate((element) => {
    ;(element as HTMLElement).click()
  })
  await page.screenshot({ path: 'test-results/gnss-per-satellite.png' })
  await expect.poll(async () => (await perSatOption(page)).widths.length).toBeGreaterThan(0)
  expect((await perSatOption(page)).widths[0]).toBe(2.6)
  const chart = page.locator('.persat-chart-wrapper')
  const bounds = (await chart.boundingBox())!
  const startX = bounds.x + bounds.width / 2
  const startY = bounds.y + bounds.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(startX + 100, startY, { steps: 8 })
  await page.mouse.up({ button: 'right' })
  await expect
    .poll(async () => {
      const [x] = (await perSatOption(page)).zoom
      return x.start !== 0 || x.end !== 100
    })
    .toBe(true)

  await chart.hover()
  await page.mouse.wheel(0, -240)
  await expect
    .poll(async () => {
      const [, y] = (await perSatOption(page)).zoom
      return y.start !== 0 || y.end !== 100
    })
    .toBe(true)

  await chart.dblclick()
  expect((await perSatOption(page)).zoom).toEqual([
    { start: 0, end: 100 },
    { start: 0, end: 100 },
  ])
  await page.screenshot({ path: 'test-results/gnss-per-satellite-interactions.png' })
})
