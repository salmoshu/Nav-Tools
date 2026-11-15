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
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      const context = Reflect.apply(originalGetContext, this, [type, ...args]) as
        | WebGLRenderingContext
        | null
      if (
        context &&
        (type === 'webgl' || type === 'webgl2') &&
        this.classList.contains('chart') &&
        this.closest('.deviation-container') &&
        !Reflect.get(context, '__deviationViewportWrapped')
      ) {
        Reflect.set(context, '__deviationViewportWrapped', true)
        const uniformMatrix3fv = context.uniformMatrix3fv.bind(context)
        context.uniformMatrix3fv = (...params: unknown[]) => {
          const matrix = params[2] as ArrayLike<number>
          Reflect.set(window, '__deviationViewportTransform', Array.from(matrix))
          return Reflect.apply(uniformMatrix3fv, context, params)
        }
      }
      return context
    } as typeof originalGetContext
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
    await expect(page.getByRole('button', { name: 'Reset Layout', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Clear', exact: true })).toBeVisible()
    const buttons = page.locator('.right-buttons .control-btn')
    await expect(buttons).toHaveCount(3)
    const bounds = await buttons.evaluateAll((elements) =>
      elements.map((element) => {
        const { x, width, height } = element.getBoundingClientRect()
        return { x, width, height }
      }),
    )
    for (const button of bounds) {
      expect(button.width).toBe(28)
      expect(button.height).toBe(28)
    }
    for (let index = 1; index < bounds.length; index += 1) {
      expect(bounds[index].x - bounds[index - 1].x - bounds[index - 1].width).toBe(4)
    }
    await expect(card.locator('.status-card-heading > span:last-child')).toBeHidden()
    await expect(card.locator('.status-card-indicator')).toBeVisible()
    await expect(card).toHaveClass(/is-compact/)
    const cardWidth = (await card.boundingBox())?.width ?? Number.POSITIVE_INFINITY
    expect(cardWidth).toBeLessThan(140)
  }
  await page.screenshot({ path: 'test-results/gnss-deviation-compact.png' })
  await page.setViewportSize({ width: 1000, height: 720 })
  await expect(card.locator('.status-card-metric')).toHaveCount(3)
  await page.getByRole('button', { name: 'Close position status information' }).click()
  await expect(card).toHaveCount(0)
  await page.getByRole('button', { name: 'Show or hide position status' }).click()
  await expect(card.locator('.status-card-summary')).toHaveText('Float')
})

test('deviation refits a loaded trajectory when the canvas grows and shrinks', async ({
  page,
}) => {
  const payload = encodeURIComponent(
    JSON.stringify({
      componentName: 'GnssDeviation',
      windowId: 'gnss-deviation',
      title: 'Deviation',
    }),
  )
  await page.setViewportSize({ width: 500, height: 420 })
  await page.goto(`/#card/${payload}`)
  await expect(page.locator('.deviation-container canvas.chart')).toBeVisible()
  await page.evaluate(async () => {
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    const { useFileTimeline } = await import('/src/composables/useFileTimeline.ts')
    useFileTimeline().active.value = true
    const rows = Array.from(
      { length: 3 },
      (_, index) =>
        `2024/04/26 03:00:0${index}.000 ${(39.98 + index * 0.000005).toFixed(9)} ${(116.47 + index * 0.00001).toFixed(9)} 60.000 4 18`,
    )
    useNmea().processRtkLibPosData(`${rows.join('\n')}\n`)
  })

  for (const size of [
    { width: 500, height: 420 },
    { width: 1200, height: 720 },
    { width: 500, height: 420 },
  ]) {
    await page.setViewportSize(size)
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const canvas = document.querySelector<HTMLCanvasElement>(
            '.deviation-container canvas.chart',
          )
          const matrix = Reflect.get(window, '__deviationViewportTransform') as
            | number[]
            | undefined
          if (!canvas || !matrix || canvas.clientHeight === 0) return false
          const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
          const { fitDeviationPoints } = await import(
            '/src/core/deviation/DeviationViewport.ts'
          )
          const expected = fitDeviationPoints(
            useNmea().deviationPoints.value,
            canvas.clientWidth / canvas.clientHeight,
          )
          if (!expected) return false
          const actualXSpan = 2 / matrix[0]
          const actualYSpan = 2 / matrix[4]
          const expectedXSpan = expected.xMax - expected.xMin
          const expectedYSpan = expected.yMax - expected.yMin
          return (
            Math.abs(actualXSpan - expectedXSpan) < 1e-6 &&
            Math.abs(actualYSpan - expectedYSpan) < 1e-6
          )
        }),
      )
      .toBe(true)
  }
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
