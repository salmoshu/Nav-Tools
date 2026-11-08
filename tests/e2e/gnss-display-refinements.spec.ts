import { expect, test } from '@playwright/test'

function nmea(body: string) {
  const checksum = [...body].reduce((sum, character) => sum ^ character.charCodeAt(0), 0)
  return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`
}

function signalEpoch(second: number, snr: number) {
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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    localStorage.setItem('nav-tools:theme', 'light')
    Reflect.set(window, '__signalText', [])
    const fillText = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (this.canvas.closest('.signal-bar-chart'))
        Reflect.get(window, '__signalText').push(String(text))
      if (maxWidth === undefined) fillText.call(this, text, x, y)
      else fillText.call(this, text, x, y, maxWidth)
    }
  })
})

test('deviation keeps only the current Float status in small windows and restores full statistics when widened', async ({
  page,
}) => {
  const payload = encodeURIComponent(
    JSON.stringify({
      componentName: 'GnssDeviation',
      windowId: 'gnss-deviation',
      title: 'Deviation',
    }),
  )
  await page.setViewportSize({ width: 1000, height: 720 })
  await page.goto(`/#card/${payload}`)
  await expect(page.locator('.deviation-container')).toBeVisible()
  await page.evaluate(
    async (epoch) => {
      const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
      useNmea().processRawData(epoch)
    },
    signalEpoch(0, 45),
  )
  const card = page.locator('.deviation-status-card')
  await expect(card.locator('.status-card-summary')).toHaveText('Float')
  await expect(card.locator('.status-card-metric')).toHaveCount(3)

  for (const size of [
    { width: 500, height: 420 },
    { width: 420, height: 280 },
  ]) {
    await page.setViewportSize(size)
    await expect(card.locator('.status-card-body')).toHaveCount(0)
    await expect(card.getByText('Float', { exact: true })).toHaveCount(1)
  }
  await page.screenshot({ path: 'test-results/gnss-deviation-compact.png' })
  await page.setViewportSize({ width: 1000, height: 720 })
  await expect(card.locator('.status-card-metric')).toHaveCount(3)
  await page.getByRole('button', { name: 'Close position status information' }).click()
  await expect(card).toHaveCount(0)
  await page.getByRole('button', { name: 'Show or hide position status' }).click()
  await expect(card.locator('.status-card-summary')).toHaveText('Float')
})

test('signal bars show grouped horizontal labels, current and peak values, and keep narrow cards scrollable', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const payload = encodeURIComponent(
    JSON.stringify({ componentName: 'GnssSignal', windowId: 'gnss-signal', title: 'Signals' }),
  )
  await page.setViewportSize({ width: 1200, height: 650 })
  await page.goto(`/#card/${payload}`)
  await page.locator('.view-select').click()
  await page.getByRole('option', { name: 'Bar Chart View', exact: true }).click()
  for (const [second, snr] of [
    [0, 55],
    [1, 40],
  ]) {
    await page.evaluate(
      async (epoch) => {
        const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
        useNmea().processRawData(epoch)
      },
      signalEpoch(second, snr),
    )
  }
  await expect(page.locator('.signal-bar-group')).toHaveCount(3)
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__signalText').includes('G01')))
    .toBe(true)
  await expect
    .poll(() =>
      page.evaluate(() =>
        ['C/N₀ (dB-Hz)', '40', '55'].every((value) =>
          Reflect.get(window, '__signalText').includes(value),
        ),
      ),
    )
    .toBe(true)
  await page.screenshot({ path: 'test-results/gnss-signal-bars-wide.png' })
  await page.evaluate(async () => {
    const { useTheme } = await import('/src/composables/useTheme.ts')
    useTheme().setTheme('dark')
  })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.screenshot({ path: 'test-results/gnss-signal-bars-dark.png' })
  await page.setViewportSize({ width: 420, height: 420 })
  await expect
    .poll(() =>
      page
        .locator('.signal-bar-scroll')
        .evaluate((element) => element.scrollWidth > element.clientWidth),
    )
    .toBe(true)
  await page.screenshot({ path: 'test-results/gnss-signal-bars-narrow.png' })
  await page.locator('.constellation-filter').click()
  await page.getByRole('option', { name: 'GPS', exact: true }).click()
  await expect(page.locator('.signal-bar-group')).toHaveCount(1)
  const chart = page.locator('.signal-bar-chart')
  await expect
    .poll(() =>
      chart.evaluate(
        (element) => element.querySelector('canvas')?.style.width === `${element.clientWidth}px`,
      ),
    )
    .toBe(true)
  const bounds = (await chart.boundingBox())!
  await chart.click({
    position: {
      x: 38 + (bounds.width - 52) / 16,
      y: bounds.height - 27 - (bounds.height - 61) / 3,
    },
  })
  await expect(page.locator('.persat-chart-wrapper')).toBeVisible()
  expect(errors).toEqual([])
})
