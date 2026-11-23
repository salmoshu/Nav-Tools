import { expect, test } from '@playwright/test'

function nmea(body: string) {
  const checksum = [...body].reduce((sum, character) => sum ^ character.charCodeAt(0), 0)
  return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`
}

function satelliteEpoch(second: number, satellites: number, quality: number) {
  return nmea(
    `GNGGA,1235${String(second).padStart(2, '0')},4807.038,N,01131.000,E,${quality},${String(satellites).padStart(2, '0')},0.9,545.4,M,46.9,M,,`,
  )
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    localStorage.setItem('nav-tools:theme', 'light')
    Reflect.set(window, '__satNumRenderSeries', [])
    Reflect.set(window, '__satNumAxisText', [])
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === 'webgl' || type === 'webgl2') return null
      return Reflect.apply(originalGetContext, this, [type, ...args])
    } as typeof originalGetContext
    const fillText = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (this.canvas.closest('[data-testid="sat-num-chart"]')) {
        Reflect.get(window, '__satNumAxisText').push(String(text))
      }
      if (maxWidth === undefined) fillText.call(this, text, x, y)
      else fillText.call(this, text, x, y, maxWidth)
    }
  })
})

test('shows Sat Num last and colors satellite-count points by solution quality', async ({
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
    async (epochs) => {
      const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
      for (const epoch of epochs) useNmea().processRawData(epoch)
      const { CanvasSatelliteTimeSeriesRenderer } =
        await import('/src/core/render/SatelliteTimeSeriesRenderer.ts')
      const render = CanvasSatelliteTimeSeriesRenderer.prototype.render
      CanvasSatelliteTimeSeriesRenderer.prototype.render = function () {
        const series = Reflect.get(this, 'series') as Map<
          string,
          { color: number[]; vertexCount: number }
        >
        Reflect.set(
          window,
          '__satNumRenderSeries',
          [...series.entries()].map(([id, state]) => ({
            id,
            color: state.color,
            count: state.vertexCount,
          })),
        )
        return render.call(this)
      }
    },
    [satelliteEpoch(0, 12, 4), satelliteEpoch(1, 13, 4), satelliteEpoch(2, 15, 5)],
  )

  await page.locator('.view-switch').click()
  const options = page.getByRole('option')
  await expect(options.last()).toHaveText('Sat Num')
  await options.last().click()

  const chart = page.getByTestId('sat-num-chart')
  await expect(chart).toBeVisible()
  await expect(chart.locator('.metric-heading strong')).toHaveText('Sat Num')
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__satNumRenderSeries')))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'quality-4', color: [0, 128 / 255, 0, 1], count: 2 }),
        expect.objectContaining({ id: 'quality-5', color: [1, 165 / 255, 0, 1], count: 2 }),
      ]),
    )
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__satNumAxisText').length))
    .toBeGreaterThan(0)
  const axisText = await page.evaluate(() => Reflect.get(window, '__satNumAxisText') as string[])
  expect(axisText.filter((text) => /^-?\d+\.\d+$/.test(text))).toEqual([])
})
