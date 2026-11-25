import { expect, test, type Page } from '@playwright/test'

function nmea(body: string): string {
  const checksum = [...body].reduce((sum, character) => sum ^ character.charCodeAt(0), 0)
  return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`
}

function signalEpoch(second: number, snr: number, talkers = ['GP', 'GA', 'GB']): string {
  const lines: string[] = []
  for (const talker of talkers) {
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

test('puts Sat Num third and restores the selected view after restart', async ({ page }) => {
  await openSignals(page)
  await page.locator('.view-select').click()
  const options = page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
  await expect(options).toHaveText(['Bar Chart View', 'Table View', 'Sat Num', 'Per-Satellite'])
  await options.first().click()
  await expect(page.locator('.signal-bar-wrapper')).toBeVisible()

  await page.reload()
  await expect(page.locator('.view-select')).toContainText('Bar Chart View')
  await expect(page.locator('.signal-bar-wrapper')).toBeVisible()
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('nav-tools:view-selections:v1')!),
  )
  expect(stored['gnss-signal:view']).toBe('chart')
})

test('offers only detected constellations and keeps the table heading on one line', async ({
  page,
}) => {
  await page.setViewportSize({ width: 550, height: 610 })
  await openSignals(page)
  await page.locator('.view-select').click()
  await page.getByRole('option', { name: 'Bar Chart View', exact: true }).click()

  const filter = page.locator('.constellation-filter')
  const options = page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
  await filter.click()
  await expect(options).toHaveText(['All constellations'])
  await options.first().click()

  await page.evaluate(
    async (epoch) => {
      const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
      useNmea().processRawData(epoch)
    },
    signalEpoch(0, 48, ['GP', 'GA']),
  )
  await filter.click()
  await expect(options).toHaveText(['All constellations', 'GPS', 'GALILEO'])
  await options.filter({ hasText: 'GPS' }).click()

  await page.locator('.view-select').click()
  await page.getByRole('option', { name: 'Table View', exact: true }).click()
  const heading = page.locator('.constellation-column-header .cell')
  await expect(heading).toHaveText('Constellation')
  expect(
    await heading.evaluate((cell) => {
      const label = [...cell.childNodes].find(
        (child) => child.textContent?.trim() === 'Constellation',
      )!
      const range = document.createRange()
      range.selectNodeContents(label)
      return { lines: range.getClientRects().length, clipped: cell.scrollWidth > cell.clientWidth }
    }),
  ).toEqual({ lines: 1, clipped: false })

  await page.evaluate(async () => {
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    useNmea().clearData()
  })
  await page.locator('.view-select').click()
  await page.getByRole('option', { name: 'Bar Chart View', exact: true }).click()
  await expect(filter).toContainText('All constellations')
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

async function nsatState(page: Page) {
  return page.locator('.satellite-count-chart').evaluate((element) => {
    const state = Reflect.get(element, '__vueParentComponent')?.setupState
    const unwrap = (value: unknown) =>
      value && typeof value === 'object' && 'value' in value ? Reflect.get(value, 'value') : value
    return {
      viewport: unwrap(state?.viewport),
      range: unwrap(state?.yRangeOverride),
      renderedRange: { min: state?.renderedYMin, max: state?.renderedYMax },
      renderer: element.getAttribute('data-renderer'),
    }
  })
}

test('keeps satellite-count dragging free of zoom and draws thin continuous traces', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === 'webgl' || type === 'webgl2') return null
      return getContext.call(this, type, ...args)
    } as typeof getContext
    Reflect.set(window, '__nsatStrokeWidths', [])
    const clearRect = CanvasRenderingContext2D.prototype.clearRect
    CanvasRenderingContext2D.prototype.clearRect = function (...args: unknown[]) {
      if (this.canvas.classList.contains('satellite-count-plot')) {
        Reflect.set(window, '__nsatStrokeWidths', [])
      }
      clearRect.apply(this, args)
    }
    const stroke = CanvasRenderingContext2D.prototype.stroke
    CanvasRenderingContext2D.prototype.stroke = function () {
      if (this.canvas.classList.contains('satellite-count-plot')) {
        const widths = Reflect.get(window, '__nsatStrokeWidths') as Array<{
          width: number
          color: string
        }>
        widths.push({ width: this.lineWidth, color: String(this.strokeStyle) })
      }
      stroke.call(this)
    }
  })
  await openSignals(page)
  for (let second = 0; second < 5; second += 1) {
    await page.evaluate(
      async (epoch) => {
        const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
        useNmea().processRawData(epoch)
      },
      signalEpoch(second, 45 + second),
    )
  }
  const chart = page.locator('.satellite-count-chart')
  await expect(chart).toHaveAttribute('data-renderer', 'canvas')
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__nsatStrokeWidths').length))
    .toBeGreaterThan(3)
  const widths = await page.evaluate(() => Reflect.get(window, '__nsatStrokeWidths'))
  expect(widths).toHaveLength(7)
  expect(new Set(widths.map((line) => line.color)).size).toBe(7)
  for (const line of widths) expect(line.width).toBeCloseTo(1.85, 6)

  const initial = await nsatState(page)
  const bounds = (await chart.boundingBox())!
  const x = bounds.x + bounds.width * 0.6
  const y = bounds.y + bounds.height * 0.6
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y - 80, { steps: 8 })
  await page.mouse.up()
  const panned = await nsatState(page)
  expect(panned.viewport).toEqual(initial.viewport)
  expect(panned.range?.min).toBe(0)
  expect(panned.range?.max - panned.range?.min).toBeCloseTo(
    initial.renderedRange.max - initial.renderedRange.min,
    8,
  )

  await chart.hover({ position: { x: bounds.width * 0.6, y: bounds.height * 0.6 } })
  await page.mouse.wheel(0, -120)
  await expect.poll(async () => (await nsatState(page)).range).not.toBeNull()
  const zoomed = await nsatState(page)
  expect(
    (zoomed.range?.max - zoomed.range?.min) / (panned.range?.max - panned.range?.min),
  ).toBeCloseTo(1 / 1.15, 6)
  expect(zoomed.viewport).toEqual(initial.viewport)

  await page.getByRole('button', { name: 'Reset Layout', exact: true }).click()
  await expect.poll(async () => (await nsatState(page)).range).toBeNull()
  expect((await nsatState(page)).viewport).toEqual(initial.viewport)
  await expect(page.locator('.view-controls')).toHaveCSS('height', '50px')
  await expect(page.locator('.nsat-reset-btn')).toHaveClass(/control-btn/)
  await expect(page.locator('.nsat-reset-btn')).toHaveCSS('height', '28px')
  await expect(page.locator('.nsat-clear-btn')).toHaveClass(/control-btn/)
  await page.screenshot({ path: 'test-results/gnss-nsat-controls.png' })
})
