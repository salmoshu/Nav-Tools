import { expect, test, type Locator, type Page } from '@playwright/test'

async function yTicks(chart: Locator): Promise<number[]> {
  return chart.locator('.metric-axis').evaluate((canvas) => Reflect.get(canvas, '__yTicks') ?? [])
}

async function xTicks(chart: Locator): Promise<string[]> {
  return chart.locator('.metric-axis').evaluate((canvas) => Reflect.get(canvas, '__xTicks') ?? [])
}

async function drag(page: Page, chart: Locator, dx: number, dy: number, button: 'left' | 'right') {
  const bounds = (await chart.locator('.metric-plot').boundingBox())!
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down({ button })
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
  await page.mouse.up({ button })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    const { clearRect, fillText } = CanvasRenderingContext2D.prototype
    CanvasRenderingContext2D.prototype.clearRect = function (x, y, width, height) {
      if (this.canvas.classList.contains('metric-axis')) {
        Reflect.set(this.canvas, '__yTicks', [])
        Reflect.set(this.canvas, '__xTicks', [])
      }
      clearRect.call(this, x, y, width, height)
    }
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (this.canvas.classList.contains('metric-axis') && this.textBaseline === 'top') {
        Reflect.get(this.canvas, '__xTicks').push(text)
      }
      if (
        this.canvas.classList.contains('metric-axis') &&
        this.textAlign === 'right' &&
        this.textBaseline === 'middle'
      ) {
        Reflect.get(this.canvas, '__yTicks').push(Number(text))
      }
      if (maxWidth === undefined) fillText.call(this, text, x, y)
      else fillText.call(this, text, x, y, maxWidth)
    }
  })
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.abort())
  await page.setViewportSize({ width: 1000, height: 900 })
  const payload = encodeURIComponent(
    JSON.stringify({ componentName: 'GnssDeviation', windowId: 'gnss-deviation', title: 'GNSS' }),
  )
  await page.goto(`/#card/${payload}`)
  await expect(page.locator('.deviation-container')).toBeVisible()
  await page.evaluate(async () => {
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    const rows = Array.from({ length: 200 }, (_, index) => {
      const minute = String(Math.floor(index / 60)).padStart(2, '0')
      const second = String(index % 60).padStart(2, '0')
      return `2024/04/26 03:${minute}:${second}.000 ${39.98 + index * 0.00001} ${116.47 + index * 0.00001} ${60 + index / 10} 1 18`
    })
    useNmea().processRtkLibPosData(`${rows.join('\n')}\n`)
  })
  await page.locator('.view-switch').click()
  await page.getByRole('option', { name: 'Position', exact: true }).click()
  await expect(page.locator('.position-chart-grid')).toBeVisible()
  await expect
    .poll(
      async () => (await yTicks(page.locator('.position-chart-grid .metric-chart').first())).length,
    )
    .toBeGreaterThan(2)
  await expect
    .poll(() =>
      page
        .locator('.position-chart-grid .metric-plot')
        .first()
        .evaluate((canvas) => canvas.clientWidth),
    )
    .toBeGreaterThan(500)
})

test('fits each position Y axis when switching from deviation after data arrives', async ({
  page,
}) => {
  const ranges = await page.evaluate(async () => {
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    const store = useNmea().positionEpochHistory.value
    return ['E', 'N', 'U'].map((field) => store.getRange(field, 160, 199))
  })
  for (const [index, range] of ranges.entries()) {
    const ticks = await yTicks(page.locator('.position-chart-grid .metric-chart').nth(index))
    expect(Math.min(...ticks)).toBeLessThanOrEqual(range!.min + 0.01)
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(range!.max - 0.01)
  }
})

test('places one shared position scrollbar below the three axes with a usable hit area', async ({
  page,
}) => {
  const grid = page.locator('.position-chart-grid')
  await expect(grid.locator('.metric-x-scrollbar')).toHaveCount(1)
  const lastChart = grid.locator('.metric-chart').last()
  const scrollbar = lastChart.locator('.metric-x-scrollbar')
  await expect(scrollbar).toBeVisible()
  const track = (await scrollbar.boundingBox())!
  const plot = (await lastChart.locator('.metric-plot').boundingBox())!
  expect(track.y).toBeGreaterThan(plot.y + plot.height)
  expect(track.height).toBeGreaterThanOrEqual(16)
})

for (const view of ['Position', 'Speed']) {
  test(`pans ${view} horizontally with the scrollbar wheel without changing Y`, async ({
    page,
  }) => {
    if (view === 'Speed') {
      await page.evaluate(async () => {
        const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
        const sentences = Array.from({ length: 200 }, (_, index) => {
          const minute = String(Math.floor(index / 60)).padStart(2, '0')
          const second = String(index % 60).padStart(2, '0')
          const body = `GPRMC,03${minute}${second}.00,A,3958.8,N,11628.2,E,${5 + index / 10},0.0,260424,,,R`
          const checksum = [...body].reduce((sum, character) => sum ^ character.charCodeAt(0), 0)
          return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`
        })
        useNmea().processRawData(sentences.join(''))
      })
      await page.locator('.view-switch').click()
      await page.getByRole('option', { name: 'Speed', exact: true }).click()
    }
    await page.locator('.tracking-switch').click()
    await page.getByRole('button', { name: 'Reset Layout' }).click()
    const container = page.locator(
      view === 'Position' ? '.position-chart-grid' : '.speed-chart-container',
    )
    const chart = container.locator('.metric-chart').last()
    await drag(page, chart, 160, 0, 'right')
    const scrollbar = chart.locator('.metric-x-scrollbar')
    await expect(scrollbar).toBeVisible()
    const charts = await container.locator('.metric-chart').all()
    const originalY = await Promise.all(charts.map(yTicks))
    const expectLinkedAxes = async () => {
      const timelineTicks = await xTicks(chart)
      for (const [index, axis] of charts.entries()) {
        expect(await yTicks(axis)).toEqual(originalY[index])
        await expect.poll(() => xTicks(axis)).toEqual(timelineTicks)
      }
    }
    const start = Number(await scrollbar.getAttribute('aria-valuenow'))
    await scrollbar.hover()
    await page.mouse.wheel(0, 120)
    await expect
      .poll(async () => Number(await scrollbar.getAttribute('aria-valuenow')))
      .toBeGreaterThan(start)
    await expectLinkedAxes()
    await page.mouse.wheel(0, -120)
    await expect(scrollbar).toHaveAttribute('aria-valuenow', String(start))
    await page.mouse.wheel(-120, 0)
    await expect
      .poll(async () => Number(await scrollbar.getAttribute('aria-valuenow')))
      .toBeLessThan(start)
    await expectLinkedAxes()

    const track = (await scrollbar.boundingBox())!
    await scrollbar.click({ position: { x: 1, y: track.height / 2 } })
    await expect(scrollbar).toHaveAttribute('aria-valuenow', '0')
    await scrollbar.click({ position: { x: track.width - 1, y: track.height / 2 } })
    await expect
      .poll(async () => Number(await scrollbar.getAttribute('aria-valuenow')))
      .toBeGreaterThan(start)
    const thumb = (await scrollbar.locator('.metric-x-scrollbar-thumb').boundingBox())!
    await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2)
    await page.mouse.down()
    await page.mouse.move(track.x, thumb.y + thumb.height / 2, { steps: 8 })
    await page.mouse.up()
    await expect(scrollbar).toHaveAttribute('aria-valuenow', '0')
    await expectLinkedAxes()
  })
}

test('keeps Y independent during linked X zoom, diagonal pan and scrollbar dragging', async ({
  page,
}) => {
  await page.locator('.tracking-switch').click()
  await expect(page.getByRole('switch')).not.toBeChecked()
  await page.getByRole('button', { name: 'Reset Layout' }).click()
  const charts = page.locator('.position-chart-grid .metric-chart')
  const east = charts.nth(0)
  const north = charts.nth(1)
  const scrollbar = charts.last().locator('.metric-x-scrollbar')
  await expect(scrollbar).toBeHidden()
  await expect.poll(async () => Math.min(...(await yTicks(east)))).toBeLessThan(0)
  const originalY = await yTicks(east)
  const northY = await yTicks(north)
  await drag(page, east, 160, 0, 'right')
  await expect(scrollbar).toBeVisible()
  expect(await yTicks(east)).toEqual(originalY)
  expect(await yTicks(north)).toEqual(northY)
  const start = Number(await scrollbar.getAttribute('aria-valuenow'))
  await drag(page, east, -60, 30, 'left')
  await expect
    .poll(async () => Number(await scrollbar.getAttribute('aria-valuenow')))
    .toBeGreaterThan(start)
  await expect.poll(() => yTicks(east)).not.toEqual(originalY)
  expect(await yTicks(north)).toEqual(northY)
  const pannedY = await yTicks(east)
  const thumb = (await scrollbar.locator('.metric-x-scrollbar-thumb').boundingBox())!
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2)
  await page.mouse.down()
  await page.mouse.move(thumb.x + thumb.width / 2 - 80, thumb.y + thumb.height / 2)
  await page.mouse.up()
  await expect
    .poll(async () => Number(await scrollbar.getAttribute('aria-valuenow')))
    .toBeLessThan(start)
  expect(await yTicks(east)).toEqual(pannedY)
  const eastTicks = await xTicks(east)
  for (let index = 1; index < 3; index += 1) {
    await expect.poll(() => xTicks(charts.nth(index))).toEqual(eastTicks)
  }
})

test('scales the hovered Y axis independently and preserves it during X zoom', async ({ page }) => {
  const charts = page.locator('.position-chart-grid .metric-chart')
  const east = charts.nth(0)
  const north = charts.nth(1)
  const originalY = await yTicks(east)
  const northY = await yTicks(north)
  await east.locator('.metric-plot').hover()
  await page.mouse.wheel(0, -240)
  await expect.poll(() => yTicks(east)).not.toEqual(originalY)
  expect(await yTicks(north)).toEqual(northY)
  const scaledY = await yTicks(east)
  await drag(page, east, 160, 0, 'right')
  expect(await yTicks(east)).toEqual(scaledY)
  expect(await yTicks(north)).toEqual(northY)
})

test('scrolls to both ends when the visible timeline is narrower than the minimum thumb size', async ({
  page,
}) => {
  await page.locator('.tracking-switch').click()
  const east = page.locator('.position-chart-grid .metric-chart').first()
  await drag(page, east, 400, 0, 'right')
  await drag(page, east, 400, 0, 'right')
  const scrollbar = page.locator('.position-chart-grid .metric-x-scrollbar')
  for (const [edge, start] of [
    ['left', '0'],
    ['right', '198'],
  ] as const) {
    const track = (await scrollbar.boundingBox())!
    const thumb = (await scrollbar.locator('.metric-x-scrollbar-thumb').boundingBox())!
    await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2)
    await page.mouse.down()
    const targetX =
      edge === 'left' ? track.x + thumb.width / 2 : track.x + track.width - thumb.width / 2
    await page.mouse.move(targetX, thumb.y + thumb.height / 2, { steps: 8 })
    await page.mouse.up()
    await expect(scrollbar).toHaveAttribute('aria-valuenow', start)
  }
})
