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
    Reflect.set(window, '__satNumViewport', null)
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

test('fits Sat Num initially and on reset, with manual Y zoom bounded at ±80', async ({
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
  await page.locator('.tracking-switch').click()
  await expect(page.getByRole('switch', { name: 'Track', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await page.evaluate(
    async (epochs) => {
      const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
      for (const epoch of epochs) useNmea().processRawData(epoch)
      const { CanvasSatelliteTimeSeriesRenderer } =
        await import('/src/core/render/SatelliteTimeSeriesRenderer.ts')
      const render = CanvasSatelliteTimeSeriesRenderer.prototype.render
      CanvasSatelliteTimeSeriesRenderer.prototype.render = function () {
        const canvas = Reflect.get(this, 'canvas') as HTMLCanvasElement | null
        if (!canvas?.closest('[data-testid="sat-num-chart"]')) return render.call(this)
        Reflect.set(window, '__satNumViewport', { ...Reflect.get(this, 'viewport') })
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
  const renderedViewport = () =>
    page.evaluate(
      () =>
        Reflect.get(window, '__satNumViewport') as {
          minX: number
          maxX: number
          minY: number
          maxY: number
        } | null,
    )
  await expect.poll(renderedViewport).toEqual({ minX: -0.5, maxX: 2.5, minY: 11.76, maxY: 15.24 })
  await expect(chart.getByRole('scrollbar')).toHaveCount(0)
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
  expect(axisText).toEqual(expect.arrayContaining(['12', '13', '14', '15']))

  await page.evaluate(
    async (epoch) => {
      const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
      useNmea().processRawData(epoch)
    },
    satelliteEpoch(3, 17, 5),
  )
  const full = { minX: -0.5, maxX: 3.5, minY: 11.6, maxY: 17.4 }
  await expect.poll(renderedViewport).toEqual(full)

  await chart.hover()
  await page.mouse.wheel(0, -120)
  await expect
    .poll(async () => {
      const viewport = await renderedViewport()
      return viewport ? viewport.maxY - viewport.minY : Infinity
    })
    .toBeLessThan(full.maxY - full.minY)
  expect(await renderedViewport()).toMatchObject({ minX: full.minX, maxX: full.maxX })
  await chart.locator('.metric-chart').evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    for (let i = 0; i < 40; i++) {
      element.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: 120,
          clientY: bounds.top + bounds.height / 2,
          cancelable: true,
        }),
      )
    }
  })
  await expect.poll(renderedViewport).toEqual({ ...full, minY: -80, maxY: 80 })
  await page.getByRole('button', { name: 'Reset Layout', exact: true }).click()
  await expect.poll(renderedViewport).toEqual(full)
})
