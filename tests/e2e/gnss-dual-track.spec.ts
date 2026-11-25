import { expect, test, type Page } from '@playwright/test'
import { calculateNmeaChecksum } from '../../src/core/data/NmeaStreamParser'

function nmea(body: string): string {
  return `$${body}*${calculateNmeaChecksum(`$${body}`)}`
}

function coordinate(value: number, longitude = false): string {
  const degrees = Math.floor(Math.abs(value))
  const minutes = (Math.abs(value) - degrees) * 60
  return `${String(degrees).padStart(longitude ? 3 : 2, '0')}${minutes.toFixed(7).padStart(10, '0')}`
}

function nmeaTrack(count = 3): string {
  return Array.from({ length: count }, (_, index) => {
    const time = `03000${index}.00`
    const latitude = coordinate(39.98 + index * 0.00001)
    const longitude = coordinate(116.47 + index * 0.00001, true)
    return [
      nmea(`GPGGA,${time},${latitude},N,${longitude},E,4,18,0.8,61.0,M,46.9,M,,`),
      nmea(`GPRMC,${time},A,${latitude},N,${longitude},E,0.0,0.0,260424,,,R`),
    ].join('\n')
  }).join('\n')
}

function posTrack(year = 2024): string {
  return Array.from(
    { length: 3 },
    (_, index) =>
      `${year}/04/26 03:00:0${index}.000 ${(39.98 + index * 0.00001).toFixed(9)} ${(116.47 + index * 0.00001).toFixed(9)} 61.000 1 18 0.01 0.01 0.02 0 0 0 0 0`,
  ).join('\n')
}

function mainTrack(): string {
  return Array.from(
    { length: 4 },
    (_, index) =>
      `2024/04/26 03:00:0${index}.000 ${(39.98 + index * 0.00001).toFixed(9)} ${(116.47 + index * 0.00001).toFixed(9)} 60.000 1 18`,
  ).join('\n')
}

async function openDeviation(page: Page, mainTrackSource: boolean | string = true): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    const clearRect = CanvasRenderingContext2D.prototype.clearRect
    CanvasRenderingContext2D.prototype.clearRect = function (...args: unknown[]) {
      if (this.canvas.classList.contains('metric-axis')) Reflect.set(this.canvas, '__yTicks', [])
      return Reflect.apply(clearRect, this, args)
    }
    const fillText = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text: string, ...args: unknown[]) {
      if (
        this.canvas.classList.contains('metric-axis') &&
        this.textAlign === 'right' &&
        this.textBaseline === 'middle'
      ) {
        const ticks = (Reflect.get(this.canvas, '__yTicks') ?? []) as number[]
        ticks.push(Number(text))
        Reflect.set(this.canvas, '__yTicks', ticks)
      }
      return Reflect.apply(fillText, this, [text, ...args])
    }
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      const context = Reflect.apply(originalGetContext, this, [type, ...args]) as
        (WebGLRenderingContext & { drawArrays: (...params: unknown[]) => void }) | null
      if (
        context &&
        (type === 'webgl' || type === 'webgl2') &&
        this.dataset.testid === 'comparison-canvas' &&
        !Reflect.get(context, '__comparisonWrapped')
      ) {
        Reflect.set(context, '__comparisonWrapped', true)
        const bufferSubData = context.bufferSubData.bind(context)
        context.bufferSubData = (...params: unknown[]) => {
          const data = params[2] as ArrayLike<number>
          if (data.length >= 6) {
            const colors = (Reflect.get(window, '__comparisonVertexColors') ?? []) as number[][]
            colors.push([data[2], data[3], data[4], data[5]])
            Reflect.set(window, '__comparisonVertexColors', colors)
          }
          return Reflect.apply(bufferSubData, context, params)
        }
        const drawArrays = context.drawArrays.bind(context)
        const uniformMatrix3fv = context.uniformMatrix3fv.bind(context)
        context.uniformMatrix3fv = (...params: unknown[]) => {
          const matrix = params[2] as ArrayLike<number>
          Reflect.set(window, '__comparisonViewportTransform', Array.from(matrix))
          return Reflect.apply(uniformMatrix3fv, context, params)
        }
        context.drawArrays = (...params: unknown[]) => {
          const counts = (Reflect.get(window, '__comparisonDrawCounts') ?? []) as number[]
          counts.push(Number(params[2]))
          Reflect.set(window, '__comparisonDrawCounts', counts)
          const result = Reflect.apply(drawArrays, context, params)
          const pixels = new Uint8Array(context.canvas.width * context.canvas.height * 4)
          context.readPixels(
            0,
            0,
            context.canvas.width,
            context.canvas.height,
            context.RGBA,
            context.UNSIGNED_BYTE,
            pixels,
          )
          let visiblePixels = 0
          for (let index = 3; index < pixels.length; index += 4) {
            if (pixels[index] > 0) visiblePixels += 1
          }
          Reflect.set(window, '__comparisonVisiblePixels', visiblePixels)
          return result
        }
      }
      if (
        context &&
        (type === 'webgl' || type === 'webgl2') &&
        this.classList.contains('metric-plot') &&
        !Reflect.get(context, '__metricWrapped')
      ) {
        Reflect.set(context, '__metricWrapped', true)
        let currentColor: number[] = []
        const uniform4fv = context.uniform4fv.bind(context)
        context.uniform4fv = (...params: unknown[]) => {
          currentColor = Array.from(params[1] as ArrayLike<number>)
          return Reflect.apply(uniform4fv, context, params)
        }
        const drawArrays = context.drawArrays.bind(context)
        context.drawArrays = (mode: number, _first: number, count: number) => {
          if (mode === context.POINTS && count > 0) {
            const draws = (Reflect.get(window, '__metricPointDraws') ?? []) as object[]
            draws.push({ color: [...currentColor], count })
            Reflect.set(window, '__metricPointDraws', draws)
          }
          return drawArrays(mode, _first, count)
        }
      }
      return context
    } as typeof originalGetContext
  })
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.abort())
  await page.setViewportSize({ width: 1100, height: 850 })
  const payload = encodeURIComponent(
    JSON.stringify({ componentName: 'GnssDeviation', windowId: 'gnss-deviation', title: 'GNSS' }),
  )
  await page.goto(`/#card/${payload}`)
  await expect(page.locator('.deviation-container')).toBeVisible()
  await page.evaluate(
    async (source) => {
      const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
      const store = useNmea()
      if (typeof source === 'string') {
        store.processRawData(`${source}\n`)
      } else if (source) {
        const rows = Array.from(
          { length: 4 },
          (_, index) =>
            `2024/04/26 03:00:0${index}.000 ${(39.98 + index * 0.00001).toFixed(9)} ${(116.47 + index * 0.00001).toFixed(9)} 60.000 1 18`,
        )
        store.processRtkLibPosData(`${rows.join('\n')}\n`)
      }
      Reflect.set(window, '__globalTrackBeforeComparison', {
        deviation: store.deviationPoints.value.map((point) => [...point]),
        map: store.mapTrackPoints.value.map((point) => [...point]),
        latitude: store.currentData.value.latitude,
        longitude: store.currentData.value.longitude,
      })
    },
    mainTrackSource,
  )
  await expect(page.locator('.comparison-panel')).toHaveCount(0)
  await expect(page.locator('.comparison-floating')).toHaveCount(0)
}

async function expectGlobalTrackUnchanged(page: Page): Promise<void> {
  const state = await page.evaluate(async () => {
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    const store = useNmea()
    return {
      before: Reflect.get(window, '__globalTrackBeforeComparison'),
      after: {
        deviation: store.deviationPoints.value.map((point) => [...point]),
        map: store.mapTrackPoints.value.map((point) => [...point]),
        latitude: store.currentData.value.latitude,
        longitude: store.currentData.value.longitude,
      },
    }
  })
  expect(state.after).toEqual(state.before)
}

test('keeps the current track as main and loads only a reference for Main minus Reference', async ({
  page,
}) => {
  await openDeviation(page)
  await page.getByTestId('reference-track-input').setInputFiles({
    name: 'track-reference.nmea',
    mimeType: 'text/plain',
    buffer: Buffer.from(nmeaTrack()),
  })
  await expect(page.getByTestId('load-reference-track')).toHaveAttribute(
    'title',
    'track-reference.nmea · NMEA · 3',
  )
  await expect(page.getByTestId('comparison-track-a-input')).toHaveCount(0)
  await expect(page.getByTestId('comparison-canvas')).toBeVisible()
  await expect(page.locator('.comparison-panel')).toHaveCount(0)
  await expect(page.locator('.comparison-floating')).toBeVisible()
  await expect(page.getByTestId('comparison-match-info')).toHaveCount(0)
  await expect(page.getByTestId('show-track-main')).toHaveText('Main')
  await expect(page.getByTestId('show-track-reference')).toHaveText('Ref')
  await expect(page.getByTestId('comparison-stats-select')).toContainText('Main − Ref')
  await page.getByRole('button', { name: 'Show or hide position status' }).click()
  await expect(page.locator('.status-card-metrics')).toContainText('U 1.0000 m')
  await expect(page.locator('.tracking-switch')).not.toHaveClass(/is-disabled/)
  const notification = page.locator('.reference-track-notification')
  await expect(notification).toHaveClass(/right/)
  await expect(notification).toContainText('Reference track loaded: 3 epochs')
  const notificationBounds = (await notification.boundingBox())!
  expect(notificationBounds.y).toBeGreaterThan(850 / 2)
  expect(notificationBounds.x + notificationBounds.width).toBeGreaterThan(1000)
  await expect(page.getByRole('button', { name: 'Map', exact: true })).toBeDisabled()

  await expect
    .poll(() =>
      page.evaluate(() => (Reflect.get(window, '__comparisonDrawCounts') ?? []).slice(-3)),
    )
    .toEqual([4, 3, 3])
  await expect
    .poll(() =>
      page.evaluate(() =>
        (Reflect.get(window, '__comparisonVertexColors') as number[][])
          .slice(-3)
          .map((color) => color.map((value) => Number(value.toFixed(4)))),
      ),
    )
    .toEqual([
      [0, 0.502, 0, 1],
      [0, 0.251, 0.502, 0.9],
      [0.9608, 0.4235, 0.4235, 0.95],
    ])

  await page.getByTestId('show-track-difference').click()
  await expect
    .poll(() =>
      page.evaluate(() => (Reflect.get(window, '__comparisonDrawCounts') ?? []).slice(-2)),
    )
    .toEqual([4, 3])
  await page.getByTestId('comparison-stats-select').click()
  await page.getByRole('option', { name: 'Ref', exact: true }).click()
  await expect(page.locator('.status-card-heading')).toHaveText('Reference track')
  await expect(page.locator('.status-card-indicator')).toHaveCSS(
    'background-color',
    'rgb(0, 64, 128)',
  )
  if ((await page.locator('.tracking-switch').getAttribute('aria-pressed')) === 'true') {
    await page.locator('.tracking-switch').click()
  }
  await expect(page.getByTestId('deviation-bottom-status')).toContainText('N = 3')
  await page.getByTestId('comparison-stats-select').click()
  await page.getByRole('option', { name: 'Main', exact: true }).click()
  await expect(page.getByTestId('deviation-bottom-status')).toContainText('N = 4')
  await expect(page.locator('.status-card-indicator')).toHaveCSS(
    'background-color',
    'rgb(0, 128, 0)',
  )
  await expectGlobalTrackUnchanged(page)

  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(page.locator('.comparison-floating')).toHaveCount(0)
  await expect(page.locator('canvas.chart')).toBeVisible()
  await expect(page.getByTestId('load-reference-track')).toHaveAttribute(
    'title',
    'Load reference track',
  )
  await expectGlobalTrackUnchanged(page)
})

test('reports invalid references and non-overlapping epochs without changing the main track', async ({
  page,
}) => {
  await openDeviation(page)
  await page.getByTestId('reference-track-input').setInputFiles({
    name: 'no-positions.nmea',
    mimeType: 'text/plain',
    buffer: Buffer.from(nmea('GPGSV,1,1,01,01,40,083,42')),
  })
  await expect(page.locator('.el-message--warning')).toContainText(
    'No valid GGA, RMC or RTKLIB POS positioning epochs',
  )
  await expect(page.locator('.comparison-floating')).toHaveCount(0)

  await page.getByTestId('reference-track-input').setInputFiles({
    name: 'other-year.pos',
    mimeType: 'text/plain',
    buffer: Buffer.from(posTrack(2025)),
  })
  await expect(page.getByTestId('comparison-match-info')).toHaveText('No matches')
  await expect(page.getByTestId('comparison-match-info')).toHaveAttribute(
    'title',
    'No matching epochs (±25 ms). Check the tracks’ time ranges.',
  )
  await expect(page.getByTestId('show-track-difference').locator('input')).toBeDisabled()
  await expectGlobalTrackUnchanged(page)
})

test('pairs a reference loaded before the main track when current data arrives', async ({
  page,
}) => {
  await openDeviation(page, false)
  await page.getByTestId('reference-track-input').setInputFiles({
    name: 'reference.pos',
    mimeType: 'text/plain',
    buffer: Buffer.from(posTrack()),
  })
  await expect(page.locator('.comparison-match-info')).toHaveText('Waiting for main track')
  await expect(page.getByTestId('comparison-stats-select')).toContainText('Ref')
  await page.evaluate(async (text) => {
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    useNmea().processRtkLibPosData(`${text}\n`)
  }, mainTrack())
  await expect(page.getByTestId('comparison-match-info')).toHaveCount(0)
  await expect(page.getByTestId('comparison-stats-select')).toContainText('Main − Ref')
  await expect
    .poll(() =>
      page.evaluate(() => (Reflect.get(window, '__comparisonDrawCounts') ?? []).slice(-3)),
    )
    .toEqual([4, 3, 3])
})

test('shows complete reference-only position and speed views without a main track', async ({
  page,
}) => {
  await openDeviation(page, false)
  await page.getByTestId('reference-track-input').setInputFiles({
    name: 'reference-only.pos',
    mimeType: 'text/plain',
    buffer: Buffer.from(posTrack()),
  })
  await expect(page.locator('.comparison-match-info')).toHaveText('Waiting for main track')
  await expect(page.locator('.tracking-switch')).toHaveAttribute('aria-pressed', 'false')

  await page.locator('.view-switch').click()
  await page.getByRole('option', { name: 'Position', exact: true }).click()
  await expect(page.locator('.position-chart-grid .metric-reference-label')).toHaveCount(0)
  await expect
    .poll(() =>
      page.locator('.position-chart-grid .metric-plot').evaluateAll(() => {
        const draws = (Reflect.get(window, '__metricPointDraws') ?? []) as Array<{
          color: number[]
          count: number
        }>
        return [0, 1, 2].map(
          () =>
            draws
              .filter(
                (draw) =>
                  draw.color[0] < 0.1 &&
                  draw.color[1] > 0.2 &&
                  draw.color[1] < 0.3 &&
                  draw.color[2] > 0.45 &&
                  draw.color[2] < 0.55,
              )
              .at(-1)?.count ?? 0,
        )
      }),
    )
    .toEqual([3, 3, 3])
  await expect(page.locator('.position-chart-grid .metric-x-scrollbar')).toHaveCount(0)

  await page.evaluate(() => Reflect.set(window, '__metricPointDraws', []))
  await page.locator('.view-switch').click()
  await page.getByRole('option', { name: 'Speed', exact: true }).click()
  await expect(page.locator('.speed-chart-container .metric-reference-label')).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const draws = (Reflect.get(window, '__metricPointDraws') ?? []) as Array<{
          color: number[]
          count: number
        }>
        return (
          draws
            .filter(
              (draw) =>
                draw.color[0] < 0.1 &&
                draw.color[1] > 0.2 &&
                draw.color[1] < 0.3 &&
                draw.color[2] > 0.45 &&
                draw.color[2] < 0.55,
            )
            .at(-1)?.count ?? 0
        )
      }),
    )
    .toBe(2)
  await expect(page.locator('.speed-chart-container .metric-x-scrollbar')).toHaveCount(0)
  await expectGlobalTrackUnchanged(page)
})

test('overlays reference ENU and derived speed on the metric views', async ({ page }) => {
  await openDeviation(page)
  await page.getByTestId('reference-track-input').setInputFiles({
    name: 'reference.pos',
    mimeType: 'text/plain',
    buffer: Buffer.from(posTrack()),
  })
  await expect(page.getByTestId('comparison-match-info')).toHaveCount(0)
  await page.locator('.view-switch').click()
  await page.getByRole('option', { name: 'Position', exact: true }).click()
  await expect(page.locator('.position-chart-grid .metric-reference-label')).toHaveCount(0)
  await expect(page.locator('.position-chart-grid .metric-heading').first()).toHaveText('East (E)m')
  await expect(
    page.locator('.position-chart-grid .metric-heading').first().locator(':scope > i'),
  ).toHaveCount(1)
  await expect(page.locator('.tracking-switch')).not.toHaveClass(/is-disabled/)
  await expect
    .poll(() =>
      page.locator('.position-chart-grid .metric-plot').evaluateAll(() => {
        const draws = (Reflect.get(window, '__metricPointDraws') ?? []) as Array<{
          color: number[]
          count: number
        }>
        return [0, 1, 2].map(
          () =>
            draws
              .filter(
                (draw) =>
                  draw.color[0] < 0.1 &&
                  draw.color[1] > 0.2 &&
                  draw.color[1] < 0.3 &&
                  draw.color[2] > 0.45 &&
                  draw.color[2] < 0.55,
              )
              .at(-1)?.count ?? 0,
        )
      }),
    )
    .toEqual([3, 3, 3])
  await expect
    .poll(() =>
      page.evaluate(() => {
        const draws = (Reflect.get(window, '__metricPointDraws') ?? []) as Array<{
          color: number[]
          count: number
        }>
        return (
          draws
            .filter(
              (draw) =>
                draw.color[0] < 0.1 &&
                draw.color[1] > 0.45 &&
                draw.color[1] < 0.55 &&
                draw.color[2] < 0.1,
            )
            .at(-1)?.count ?? 0
        )
      }),
    )
    .toBe(4)
  await expect
    .poll(() =>
      page
        .locator('.position-chart-grid .metric-axis')
        .last()
        .evaluate((canvas) => {
          const ticks = (Reflect.get(canvas, '__yTicks') ?? []) as number[]
          return Math.max(...ticks)
        }),
    )
    .toBeGreaterThanOrEqual(1)

  await page.evaluate(() => Reflect.set(window, '__metricPointDraws', []))
  await page.locator('.view-switch').click()
  await page.getByRole('option', { name: 'Speed', exact: true }).click()
  await expect(page.locator('.speed-chart-container .metric-reference-label')).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const draws = (Reflect.get(window, '__metricPointDraws') ?? []) as Array<{
          color: number[]
          count: number
        }>
        return (
          draws
            .filter(
              (draw) =>
                draw.color[0] < 0.1 &&
                draw.color[1] > 0.2 &&
                draw.color[1] < 0.3 &&
                draw.color[2] > 0.45 &&
                draw.color[2] < 0.55,
            )
            .at(-1)?.count ?? 0
        )
      }),
    )
    .toBe(2)
  await expect
    .poll(() =>
      page.locator('.speed-chart-container .metric-axis').evaluate((canvas) => {
        const ticks = (Reflect.get(canvas, '__yTicks') ?? []) as number[]
        return Math.max(...ticks)
      }),
    )
    .toBeGreaterThan(0)
  await expectGlobalTrackUnchanged(page)
})

test('pans the visible comparison canvas without losing the tracks', async ({ page }) => {
  await openDeviation(page)
  await page.getByTestId('reference-track-input').setInputFiles({
    name: 'reference.pos',
    mimeType: 'text/plain',
    buffer: Buffer.from(posTrack()),
  })
  await expect(page.getByTestId('comparison-match-info')).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__comparisonVisiblePixels') ?? 0))
    .toBeGreaterThan(0)
  expect(await page.locator('canvas.chart').evaluate((canvas) => canvas.clientWidth)).toBe(0)
  const beforeTransform = await page.evaluate(
    () => (Reflect.get(window, '__comparisonViewportTransform') ?? []) as number[],
  )

  const bounds = (await page.getByTestId('comparison-canvas').boundingBox())!
  const startX = bounds.x + bounds.width / 2
  const startY = bounds.y + bounds.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 72, startY + 36, { steps: 8 })
  await page.mouse.up()

  await expect
    .poll(() =>
      page.evaluate(() =>
        (Reflect.get(window, '__comparisonViewportTransform') ?? []).every(Number.isFinite),
      ),
    )
    .toBe(true)
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__comparisonVisiblePixels') ?? 0))
    .toBeGreaterThan(0)
  const afterTransform = await page.evaluate(
    () => (Reflect.get(window, '__comparisonViewportTransform') ?? []) as number[],
  )
  expect(afterTransform[0]).toBeCloseTo(beforeTransform[0], 6)
  expect(afterTransform[4]).toBeCloseTo(beforeTransform[4], 6)
  expect(afterTransform[6]).not.toBe(beforeTransform[6])
  expect(afterTransform[7]).not.toBe(beforeTransform[7])
})

test('uses icon-only toolbar buttons without overflow at wide and narrow widths', async ({
  page,
}) => {
  await openDeviation(page)
  for (const width of [980, 760, 560, 360, 280, 240]) {
    await page.locator('.deviation-container').evaluate((element, nextWidth) => {
      ;(element as HTMLElement).style.width = `${nextWidth}px`
    }, width)
    await expect
      .poll(() =>
        page.locator('.controls').evaluate((element) => ({
          client: element.clientWidth,
          scroll: element.scrollWidth,
        })),
      )
      .toEqual({ client: width - (width > 800 ? 24 : 16), scroll: width - (width > 800 ? 24 : 16) })
    const layout = await page.locator('.controls').evaluate((element) => ({
      buttons: [...element.querySelectorAll('.right-buttons .control-btn')].map((button) => {
        const { width, height } = button.getBoundingClientRect()
        return { width, height, text: button.textContent?.trim() }
      }),
    }))
    expect(layout.buttons).toEqual(Array(4).fill({ width: 28, height: 28, text: '' }))
  }
  await expect(page.locator('.tracking-switch')).toBeHidden()
  await expect(page.getByTestId('load-reference-track').locator('.el-icon')).toBeVisible()
})

test('tracks and selects the same epoch across dual-track deviation, position and speed views', async ({
  page,
}) => {
  await openDeviation(page, nmeaTrack(4))
  const referenceText = Array.from(
    { length: 4 },
    (_, index) =>
      `2024/04/26 03:00:0${index}.000 ${(39.98002 + index * 0.00001).toFixed(9)} ${(116.47 + index * 0.00001).toFixed(9)} 61.000 1 18`,
  ).join('\n')
  await page.getByTestId('reference-track-input').setInputFiles({
    name: 'reference-offset.pos',
    mimeType: 'text/plain',
    buffer: Buffer.from(referenceText),
  })
  await expect(page.getByTestId('comparison-match-info')).toHaveCount(0)
  await expect(page.locator('.tracking-switch')).not.toHaveClass(/is-disabled/)

  await page.evaluate(async () => {
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    const { useFileTimeline } = await import('/src/composables/useFileTimeline.ts')
    const data = useNmea()
    useFileTimeline().attachTimeline(data.positionEpochHistory.value, {
      mode: 'loaded',
      speed: 1,
      applyEpoch: data.applyTimelineEpoch,
    })
  })
  await page.locator('.tracking-switch').click()
  await expect(page.locator('.tracking-switch')).toHaveAttribute('aria-pressed', 'true')

  const selectView = async (name: 'Deviation' | 'Position' | 'Speed') => {
    await page.locator('.view-switch').click()
    await page.getByRole('option', { name, exact: true }).click()
  }
  const hoverChart = async (chart: ReturnType<Page['locator']>, horizontalRatio = 0.5) => {
    const bounds = (await chart.locator('.metric-plot').boundingBox())!
    await page.mouse.move(bounds.x + bounds.width * horizontalRatio, bounds.y + bounds.height / 2)
    await expect(chart.locator('.metric-tooltip')).toBeVisible()
  }
  const expectDifferenceHint = async (chart: ReturnType<Page['locator']>, unit: string) => {
    const primary = chart.locator('.metric-tooltip-primary')
    const reference = chart.locator('.metric-tooltip-reference')
    const difference = chart.locator('.metric-tooltip-difference')
    await expect(primary).toContainText('Main track')
    await expect(reference).toContainText('Reference track')
    await expect(difference).toContainText('Main − Ref')
    await expect(difference).toContainText(unit)
    const readValue = async (row: ReturnType<Page['locator']>) =>
      Number.parseFloat(await row.locator('span').last().innerText())
    expect(await readValue(difference)).toBeCloseTo(
      (await readValue(primary)) - (await readValue(reference)),
      2,
    )
  }

  await selectView('Position')
  const position = page.locator('.position-chart-grid .metric-chart').first()
  await hoverChart(position)
  await expectDifferenceHint(position, 'm')
  await expect(page.locator('.position-chart-grid .metric-reference-label')).toHaveCount(0)
  await expect(page.locator('.comparison-floating')).toBeVisible()
  await page.getByRole('button', { name: 'Show or hide position status' }).click()
  await expect(page.getByTestId('deviation-status-card')).toBeVisible()
  await expect(page.getByTestId('show-track-difference')).toBeHidden()
  await expect(page.getByTestId('show-track-main')).toHaveText('Main')
  await expect(page.getByTestId('show-track-reference')).toHaveText('Ref')
  await expect(page.locator('.comparison-match-info')).toHaveCount(0)
  const toolbarBounds = (await page.locator('.comparison-floating').boundingBox())!
  const plotBounds = (await position.locator('.metric-plot').boundingBox())!
  const statsSelectBounds = (await page.getByTestId('comparison-stats-select').boundingBox())!
  expect(toolbarBounds.x).toBeGreaterThanOrEqual(plotBounds.x - 1)
  expect(toolbarBounds.width).toBeLessThan(330)
  expect(statsSelectBounds.width).toBeLessThanOrEqual(84)
  const toolbarFontSize = await page
    .locator('.comparison-floating .el-checkbox__label')
    .first()
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
  expect(toolbarFontSize).toBeLessThanOrEqual(11)

  await page.getByTestId('show-track-main').click()
  await hoverChart(position)
  await expect(position.locator('.metric-tooltip-primary')).toHaveCount(0)
  await expect(position.locator('.metric-tooltip-reference')).toBeVisible()
  await expect(position.locator('.metric-tooltip-difference')).toHaveCount(0)
  await page.getByTestId('show-track-main').click()

  await selectView('Speed')
  const speed = page.locator('.speed-chart-container .metric-chart')
  // The reference POS derives speed between fixes. Hover past the first fix.
  await hoverChart(speed, 0.85)
  await expectDifferenceHint(speed, 'km/h')
  await expect(page.locator('.speed-chart-container .metric-reference-label')).toHaveCount(0)
  await expect(page.locator('.comparison-floating')).toBeVisible()
  await expect(page.getByTestId('deviation-status-card')).toBeVisible()

  await selectView('Deviation')
  await page.evaluate(async () => {
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    const { useFileTimeline } = await import('/src/composables/useFileTimeline.ts')
    const data = useNmea()
    const timeline = useFileTimeline()
    timeline.seekEpoch(data.positionEpochHistory.value, 0)
    timeline.setPlaybackSpeed(2)
    timeline.play()
  })
  const finalEpochTime = await page.evaluate(async (text) => {
    const { parseTrackFile } = await import('/src/core/gnss/DualTrack.ts')
    return parseTrackFile(text)!.points.at(-1)!.timeMs
  }, referenceText)
  await expect
    .poll(() => page.getByTestId('comparison-canvas').getAttribute('data-current-time-ms'))
    .toBe(String(finalEpochTime))
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__comparisonVisiblePixels') ?? 0))
    .toBeGreaterThan(0)

  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.axis-layer')!
    const context = canvas.getContext('2d')!
    const arc = context.arc.bind(context)
    const clearRect = context.clearRect.bind(context)
    context.clearRect = ((x: number, y: number, width: number, height: number) => {
      Reflect.set(window, '__selectedEpochMarkers', [])
      clearRect(x, y, width, height)
    }) as CanvasRenderingContext2D['clearRect']
    context.arc = ((
      x: number,
      y: number,
      radius: number,
      startAngle: number,
      endAngle: number,
      counterclockwise?: boolean,
    ) => {
      const markers = (Reflect.get(window, '__selectedEpochMarkers') ?? []) as object[]
      markers.push({ x, y, color: String(context.fillStyle) })
      Reflect.set(window, '__selectedEpochMarkers', markers)
      arc(x, y, radius, startAngle, endAngle, counterclockwise)
    }) as CanvasRenderingContext2D['arc']
  })

  const target = await page.evaluate(
    async ({ text, index }) => {
      const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
      const { compareTracks, parseTrackFile, readPrimaryTrackEpochs } =
        await import('/src/core/gnss/DualTrack.ts')
      const data = useNmea()
      const main = readPrimaryTrackEpochs(
        data.mapPositionEpochHistory,
        data.positionEpochHistory.value,
        data.statusEpochHistory.value,
      )
      const reference = parseTrackFile(text)!.points
      const comparison = compareTracks(main, reference)!
      const point = comparison.trackB[index]
      const matrix = Reflect.get(window, '__comparisonViewportTransform') as number[]
      const bounds = document
        .querySelector<HTMLCanvasElement>('.comparison-chart')!
        .getBoundingClientRect()
      return {
        timeMs: point.timeMs,
        x: bounds.left + ((point.east * matrix[0] + matrix[6] + 1) / 2) * bounds.width,
        y: bounds.top + (1 - (point.north * matrix[4] + matrix[7] + 1) / 2) * bounds.height,
      }
    },
    { text: referenceText, index: 1 },
  )
  await page.mouse.move(target.x, target.y)
  await expect(page.locator('.deviation-tooltip')).toContainText('Reference track')
  await page.mouse.click(target.x, target.y)
  await expect(page.getByTestId('comparison-canvas')).toHaveAttribute(
    'data-current-time-ms',
    String(target.timeMs),
  )

  const selectedMarkers = await page.evaluate(
    async ({ text, index }) => {
      const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
      const { compareTracks, parseTrackFile, readPrimaryTrackEpochs } =
        await import('/src/core/gnss/DualTrack.ts')
      const data = useNmea()
      const main = readPrimaryTrackEpochs(
        data.mapPositionEpochHistory,
        data.positionEpochHistory.value,
        data.statusEpochHistory.value,
      )
      const comparison = compareTracks(main, parseTrackFile(text)!.points)!
      const matrix = Reflect.get(window, '__comparisonViewportTransform') as number[]
      const canvas = document.querySelector<HTMLCanvasElement>('.axis-layer')!
      const screen = (point: { east: number; north: number }) => ({
        x: ((point.east * matrix[0] + matrix[6] + 1) / 2) * canvas.clientWidth,
        y: (1 - (point.north * matrix[4] + matrix[7] + 1) / 2) * canvas.clientHeight,
      })
      return {
        expected: [screen(comparison.trackA[index]), screen(comparison.trackB[index])],
        markers: (Reflect.get(window, '__selectedEpochMarkers') ?? []) as Array<{
          x: number
          y: number
        }>,
      }
    },
    { text: referenceText, index: 1 },
  )
  for (const expected of selectedMarkers.expected) {
    expect(
      selectedMarkers.markers.some(
        (marker) => Math.abs(marker.x - expected.x) < 1 && Math.abs(marker.y - expected.y) < 1,
      ),
    ).toBe(true)
  }
  await expectGlobalTrackUnchanged(page)
})
