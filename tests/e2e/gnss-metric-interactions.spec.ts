import { expect, test, type Locator, type Page } from '@playwright/test'

async function yTicks(chart: Locator): Promise<number[]> {
  return chart.locator('.metric-axis').evaluate((canvas) => Reflect.get(canvas, '__yTicks') ?? [])
}

async function xTicks(chart: Locator): Promise<string[]> {
  return chart.locator('.metric-axis').evaluate((canvas) => Reflect.get(canvas, '__xTicks') ?? [])
}

interface GridLine {
  x0: number
  y0: number
  x1: number
  y1: number
}

async function gridLines(chart: Locator): Promise<GridLine[]> {
  return chart
    .locator('.metric-axis')
    .evaluate((canvas) => Reflect.get(canvas, '__gridLines') ?? [])
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

async function dragFraction(page: Page, chart: Locator, fraction: number) {
  const bounds = (await chart.locator('.metric-plot').boundingBox())!
  await drag(page, chart, bounds.width * fraction, 0, 'left')
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    const { clearRect, fillText, moveTo, lineTo, stroke } = CanvasRenderingContext2D.prototype
    CanvasRenderingContext2D.prototype.clearRect = function (x, y, width, height) {
      if (this.canvas.classList.contains('metric-axis')) {
        Reflect.set(this.canvas, '__yTicks', [])
        Reflect.set(this.canvas, '__xTicks', [])
        Reflect.set(this.canvas, '__gridLines', [])
      }
      clearRect.call(this, x, y, width, height)
    }
    CanvasRenderingContext2D.prototype.moveTo = function (x, y) {
      if (this.canvas.classList.contains('metric-axis')) {
        Reflect.set(this.canvas, '__gridStart', { x, y })
      }
      moveTo.call(this, x, y)
    }
    CanvasRenderingContext2D.prototype.lineTo = function (x, y) {
      if (this.canvas.classList.contains('metric-axis')) {
        Reflect.set(this.canvas, '__gridEnd', { x, y })
      }
      lineTo.call(this, x, y)
    }
    CanvasRenderingContext2D.prototype.stroke = function (...args) {
      if (this.canvas.classList.contains('metric-axis')) {
        const start = Reflect.get(this.canvas, '__gridStart')
        const end = Reflect.get(this.canvas, '__gridEnd')
        if (start && end) {
          Reflect.get(this.canvas, '__gridLines').push({
            x0: start.x,
            y0: start.y,
            x1: end.x,
            y1: end.y,
          })
        }
      }
      stroke.apply(this, args)
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

test('shows the complete loaded position and speed tracks with Track off by default', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    const { useFileTimeline } = await import('/src/composables/useFileTimeline.ts')
    const data = useNmea()
    const sentences = Array.from({ length: 200 }, (_, index) => {
      const minute = String(Math.floor(index / 60)).padStart(2, '0')
      const second = String(index % 60).padStart(2, '0')
      const body = `GPRMC,03${minute}${second}.00,A,3958.8,N,11628.2,E,${5 + index / 10},0.0,260424,,,R`
      const checksum = [...body].reduce((sum, character) => sum ^ character.charCodeAt(0), 0)
      return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`
    })
    data.processRawData(sentences.join(''))
    useFileTimeline().attachTimeline(data.statusEpochHistory.value, {
      mode: 'loaded',
      speed: 1,
      applyEpoch: data.applyTimelineEpoch,
    })
  })

  const position = page.locator('.position-chart-grid .metric-chart').first()
  await expect(page.locator('.tracking-switch')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.position-chart-grid .metric-x-scrollbar')).toHaveCount(0)
  await expect.poll(async () => (await xTicks(position)).at(0)).toBe('03:00:00.000')
  await expect.poll(async () => (await xTicks(position)).at(-1)).toBe('03:03:19.000')

  await page.locator('.view-switch').click()
  await page.getByRole('option', { name: 'Speed', exact: true }).click()
  const speed = page.locator('.speed-chart-container .metric-chart')
  await expect(speed).toBeVisible()
  await expect(page.locator('.speed-chart-container .metric-x-scrollbar')).toHaveCount(0)
  await expect.poll(async () => (await xTicks(speed)).at(0)).toBe('03:00:00.000')
  await expect.poll(async () => (await xTicks(speed)).at(-1)).toBe('03:03:19.000')

  await page.evaluate(async () => {
    const { useFileTimeline } = await import('/src/composables/useFileTimeline.ts')
    useFileTimeline().clearTimeline()
  })
  await expect(page.locator('.tracking-switch')).toHaveAttribute('aria-pressed', 'true')
})

test('double-clicks the trajectory size slider button to restore the default size', async ({
  page,
}) => {
  const slider = page.locator('.control-panel .point-slider')
  const runway = slider.locator('.el-slider__runway')
  const bounds = (await runway.boundingBox())!
  await runway.click({ position: { x: bounds.width - 1, y: bounds.height / 2 } })
  await expect(page.locator('.control-panel .size-value')).toHaveText('20')

  await slider.locator('.el-slider__button').dblclick()
  await expect(page.locator('.control-panel .size-value')).toHaveText('10')
})

test('draws dense x/y gridlines inside position and speed charts', async ({ page }) => {
  const position = page.locator('.position-chart-grid .metric-chart').first()
  await expect
    .poll(async () => (await gridLines(position)).filter((line) => line.x0 === line.x1).length)
    .toBe(7)
  await expect
    .poll(async () => (await gridLines(position)).filter((line) => line.y0 === line.y1).length)
    .toBe(7)
  expect(await yTicks(position)).toHaveLength(7)

  await page.evaluate(async () => {
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    const sentences = Array.from({ length: 3 }, (_, index) => {
      const body = `GPRMC,12350${index}.00,A,3958.8,N,11628.2,E,${5 + index},0.0,260424,,,R`
      const checksum = [...body].reduce((sum, character) => sum ^ character.charCodeAt(0), 0)
      return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`
    })
    useNmea().processRawData(sentences.join(''))
  })
  await page.locator('.view-switch').click()
  await page.getByRole('option', { name: 'Speed', exact: true }).click()
  const speed = page.locator('.speed-chart-container .metric-chart')
  await expect
    .poll(async () => (await gridLines(speed)).filter((line) => line.x0 === line.x1).length)
    .toBe(7)
  await expect
    .poll(async () => (await gridLines(speed)).filter((line) => line.y0 === line.y1).length)
    .toBe(7)
  expect(await yTicks(speed)).toHaveLength(7)
})

test('allows first and last epochs to stop at the center after panning and zooming', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { subscribeMetricViewport } =
      await import('/src/components/windows/gnss/metricViewportSync.ts')
    subscribeMetricViewport(({ start, end }) => {
      Reflect.set(window, '__lastMetricViewport', { start, end })
    })
  })
  const readViewport = () => page.evaluate(() => Reflect.get(window, '__lastMetricViewport'))
  const expectViewport = async (start: number, end: number) => {
    const actual = await readViewport()
    expect(actual.start).toBeCloseTo(start, 0)
    expect(actual.end).toBeCloseTo(end, 0)
  }
  await page.locator('.tracking-switch').click()
  await page.getByRole('button', { name: 'Reset Layout' }).click()
  const position = page.locator('.position-chart-grid .metric-chart').first()

  await dragFraction(page, position, 0.5 - 1 / 400)
  await expectViewport(-99.5, 100.5)
  await page.getByRole('button', { name: 'Reset Layout' }).click()
  await dragFraction(page, position, -(0.5 - 1 / 400))
  await expectViewport(99.5, 299.5)

  await page.getByRole('button', { name: 'Reset Layout' }).click()
  await drag(page, position, 160, 0, 'right')
  await dragFraction(page, position, 1 - 1 / 200)
  await expectViewport(-49.5, 50.5)

  await page.evaluate(async () => {
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    const sentences = Array.from({ length: 3 }, (_, index) => {
      const body = `GPRMC,12350${index}.00,A,3958.8,N,11628.2,E,${5 + index},0.0,260424,,,R`
      const checksum = [...body].reduce((sum, character) => sum ^ character.charCodeAt(0), 0)
      return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`
    })
    useNmea().processRawData(sentences.join(''))
  })
  await page.locator('.view-switch').click()
  await page.getByRole('option', { name: 'Speed', exact: true }).click()
  const speed = page.locator('.speed-chart-container .metric-chart')
  await dragFraction(page, speed, 1 / 3)
  await expectViewport(-1, 2)
  await page.getByRole('button', { name: 'Reset Layout' }).click()
  await dragFraction(page, speed, -1 / 3)
  await expectViewport(1, 4)
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

test('maximizes each position axis into the three-axis area and restores the grid', async ({
  page,
}) => {
  const grid = page.locator('.position-chart-grid')
  const charts = grid.locator('.metric-chart')
  await expect(charts).toHaveCount(3)
  await expect(grid.getByTestId('expand-axis-view')).toHaveCount(3)
  const initial = await charts.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
    }),
  )

  for (let index = 0; index < 3; index += 1) {
    const expandButton = charts.nth(index).getByTestId('expand-axis-view')
    const buttonBounds = (await expandButton.boundingBox())!
    const titleBounds = (await charts.nth(index).locator('.metric-heading strong').boundingBox())!
    expect(buttonBounds.x).toBeGreaterThan(titleBounds.x + titleBounds.width)
    await expandButton.click()
    await expect(grid).toHaveClass(/is-expanded/)
    for (let other = 0; other < 3; other += 1) {
      if (other === index) await expect(charts.nth(other)).toBeVisible()
      else await expect(charts.nth(other)).toBeHidden()
    }
    const expanded = (await charts.nth(index).boundingBox())!
    expect(expanded.y).toBeCloseTo(initial[0].top, 0)
    expect(expanded.y + expanded.height).toBeCloseTo(initial[2].bottom, 0)
    expect(expanded.width).toBeCloseTo(initial[index].width, 0)
    expect(expanded.height).toBeGreaterThan(initial[index].height * 2)

    if (index < 2) {
      await charts.nth(index).getByTestId('collapse-axis-view').click()
      await expect(grid).not.toHaveClass(/is-expanded/)
      await expect(grid.getByTestId('expand-axis-view')).toHaveCount(3)
    }
  }

  await page.getByRole('button', { name: 'Reset Layout', exact: true }).click()
  await expect(grid).not.toHaveClass(/is-expanded/)
  await expect(grid.getByTestId('expand-axis-view')).toHaveCount(3)
  for (let index = 0; index < 3; index += 1) await expect(charts.nth(index)).toBeVisible()
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
    await expect(scrollbar).toHaveAttribute('aria-valuenow', '-50')
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
  await expect(page.locator('.tracking-switch')).toHaveAttribute('aria-pressed', 'false')
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
