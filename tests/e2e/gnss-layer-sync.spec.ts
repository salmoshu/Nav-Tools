import { expect, test, type Page } from '@playwright/test'

function gga(second: number, longitudeMinutes = 31, latitudeMinutes = 7.038): string {
  const longitude = `011${longitudeMinutes.toFixed(6).padStart(9, '0')}`
  const latitude = `48${latitudeMinutes.toFixed(6).padStart(9, '0')}`
  const body = `GNGGA,1235${String(second).padStart(2, '0')},${latitude},N,${longitude},E,4,18,0.9,545.4,M,46.9,M,,`
  const checksum = [...body].reduce((sum, character) => sum ^ character.charCodeAt(0), 0)
  return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`
}

async function inject(page: Page, sentence: string): Promise<void> {
  await page.evaluate(async (sentence) => {
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    useNmea().processRawData(sentence)
  }, sentence)
}

async function scaleReadout(page: Page) {
  return page.locator('.scale-readout-container').evaluate((element) => ({
    label: element.querySelector('.scale-readout-label')!.textContent,
    width: element.querySelector('.scale-readout-line')!.getBoundingClientRect().width,
  }))
}

async function currentMarker(page: Page, layer: 'grid' | 'map') {
  if (layer === 'map') {
    const marker = await page.locator('.map-view path[stroke-width="2"]').boundingBox()
    const plot = await page.locator('.deviation-visual-container').boundingBox()
    if (!marker || !plot) return undefined
    return { x: marker.x + marker.width / 2 - plot.x, y: marker.y + marker.height / 2 - plot.y }
  }
  return page.evaluate((): { x: number; y: number } | undefined => {
    return Reflect.get(window, '__gnssGridMarker')
  })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    localStorage.setItem('nav-tools:theme', 'light')
    const { arc } = CanvasRenderingContext2D.prototype
    CanvasRenderingContext2D.prototype.arc = function (x, y, radius, start, end, anticlockwise) {
      const plot = this.canvas.closest('.deviation-visual-container')
      if (plot && this.canvas.classList.contains('axis-layer')) {
        const transform = this.getTransform()
        const bounds = this.canvas.getBoundingClientRect()
        const plotBounds = plot.getBoundingClientRect()
        if (bounds.width > 0 && bounds.height > 0) {
          Reflect.set(window, '__gnssGridMarker', {
            x:
              bounds.left -
              plotBounds.left +
              ((transform.a * x + transform.c * y + transform.e) * bounds.width) /
                this.canvas.width,
            y:
              bounds.top -
              plotBounds.top +
              ((transform.b * x + transform.d * y + transform.f) * bounds.height) /
                this.canvas.height,
          })
        }
      }
      arc.call(this, x, y, radius, start, end, anticlockwise)
    }
  })
  // Geometry and scale do not depend on the external tile service.
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.abort())
  await page.setViewportSize({ width: 1000, height: 720 })
  const payload = encodeURIComponent(
    JSON.stringify({
      componentName: 'GnssDeviation',
      windowId: 'gnss-deviation',
      title: 'Deviation',
    }),
  )
  await page.goto(`/#card/${payload}`)
  await expect(page.locator('.deviation-container')).toBeVisible()
  await inject(page, gga(0))
  await expect(page.locator('.status-card-summary')).toHaveText('Fixed')
})

test('keeps the scale unchanged when switching repeatedly between grid and map', async ({
  page,
}) => {
  const grid = await scaleReadout(page)
  for (let index = 0; index < 3; index += 1) {
    await page.locator('.layer-icon-button').nth(1).click()
    await expect(page.locator('.map-view')).toBeVisible()
    await expect.poll(async () => (await scaleReadout(page)).label).toBe(grid.label)
    await expect
      .poll(async () => Math.abs((await scaleReadout(page)).width - grid.width))
      .toBeLessThan(1)
    await page.locator('.layer-icon-button').nth(0).click()
    await expect(page.locator('.chart-container')).toBeVisible()
    await expect.poll(async () => (await scaleReadout(page)).label).toBe(grid.label)
    await expect
      .poll(async () => Math.abs((await scaleReadout(page)).width - grid.width))
      .toBeLessThan(1)
  }
})

test('preserves map zoom through live updates and restores it on the grid', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.locator('.layer-icon-button').nth(1).click()
  const initial = await scaleReadout(page)
  await page.locator('.leaflet-control-zoom-out').click()
  await expect.poll(async () => (await scaleReadout(page)).width).not.toBe(initial.width)
  const zoomed = await scaleReadout(page)
  await inject(page, gga(1, 31.00001))
  await expect(page.locator('.status-card-stat').first()).toContainText('2')
  await expect.poll(async () => (await scaleReadout(page)).label).toBe(zoomed.label)
  await expect
    .poll(async () => Math.abs((await scaleReadout(page)).width - zoomed.width))
    .toBeLessThan(1)
  await page.locator('.layer-icon-button').nth(0).click()
  await expect.poll(async () => (await scaleReadout(page)).label).toBe(zoomed.label)
  await expect
    .poll(async () => Math.abs((await scaleReadout(page)).width - zoomed.width))
    .toBeLessThan(1)
  expect(errors).toEqual([])
})

test('keeps a dragged tracking offset through live updates and a layer switch', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect
    .poll(async () => Math.abs(((await currentMarker(page, 'map'))?.x ?? 0) - 500))
    .toBeLessThan(2)
  const plot = (await page.locator('.map-view').boundingBox())!
  await page.mouse.move(plot.x + plot.width * 0.7, plot.y + plot.height * 0.6)
  await page.mouse.down()
  await page.mouse.move(plot.x + plot.width * 0.7 + 100, plot.y + plot.height * 0.6 + 60, {
    steps: 10,
  })
  // Hold the pointer still before release so Leaflet does not add inertia.
  await page.waitForTimeout(100)
  await page.mouse.up()
  await expect
    .poll(async () => Math.abs(((await currentMarker(page, 'map'))?.x ?? 0) - 600))
    .toBeLessThan(2)
  const dragged = (await currentMarker(page, 'map'))!
  await inject(page, gga(1, 31.0006))
  await expect(page.locator('.status-card-stat').first()).toContainText('2')
  await expect
    .poll(async () => Math.abs((await currentMarker(page, 'map'))!.x - dragged.x))
    .toBeLessThan(2)
  await page.getByRole('button', { name: 'Grid', exact: true }).click()
  for (const axis of ['x', 'y'] as const) {
    await expect
      .poll(async () => Math.abs((await currentMarker(page, 'grid'))![axis] - dragged[axis]))
      .toBeLessThan(2)
  }
})

test('keeps both layers aligned when resizing while the grid is hidden', async ({ page }) => {
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await page.setViewportSize({ width: 420, height: 420 })
  await expect.poll(async () => (await currentMarker(page, 'map'))?.x).toBeCloseTo(210, 0)
  const map = await scaleReadout(page)
  await page.getByRole('button', { name: 'Grid', exact: true }).click()
  await expect.poll(async () => (await scaleReadout(page)).label).toBe(map.label)
  await expect
    .poll(async () => Math.abs((await scaleReadout(page)).width - map.width))
    .toBeLessThan(1)
  await expect.poll(async () => (await currentMarker(page, 'grid'))?.x).toBeCloseTo(210, 0)
  await expect(page.locator('.status-card-body')).toHaveCount(0)
})

test('holds the viewport fixed when tracking is disabled on the map', async ({ page }) => {
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await page.locator('.tracking-switch .el-switch__core').click()
  await expect(page.getByRole('switch')).not.toBeChecked()
  await inject(page, gga(1, 31.0006))
  await expect.poll(async () => (await currentMarker(page, 'map'))?.x).toBeGreaterThan(520)
  const map = (await currentMarker(page, 'map'))!
  await page.getByRole('button', { name: 'Grid', exact: true }).click()
  await expect
    .poll(async () => Math.abs((await currentMarker(page, 'grid'))!.x - map.x))
    .toBeLessThan(2)
})

test('centers the map on the file cursor when viewing an earlier epoch', async ({ page }) => {
  await inject(page, gga(1, 31.0006) + gga(2, 31.0012))
  await page.evaluate(async () => {
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    const { useFileTimeline } = await import('/src/composables/useFileTimeline.ts')
    const nmea = useNmea()
    useFileTimeline().attachTimeline(nmea.statusEpochHistory.value, {
      mode: 'loaded',
      speed: 1,
      applyEpoch: nmea.applyTimelineEpoch,
    })
    useFileTimeline().stepEpoch(-2)
  })
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect
    .poll(async () => Math.abs(((await currentMarker(page, 'map'))?.x ?? 0) - 500))
    .toBeLessThan(2)
  await page.getByRole('button', { name: 'Grid', exact: true }).click()
  await expect.poll(async () => (await currentMarker(page, 'grid'))?.x).toBeCloseTo(500, 0)
})

for (const mode of ['loaded', 'replay'] as const) {
  test(`moves the current map marker with centimeter ${mode} file epochs`, async ({ page }) => {
    await inject(page, gga(1, 31.000006))
    await page.evaluate(async (mode) => {
      const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
      const { useFileTimeline } = await import('/src/composables/useFileTimeline.ts')
      const nmea = useNmea()
      nmea.prepareTimelineProjection(mode)
      const timeline = useFileTimeline()
      timeline.attachTimeline(nmea.statusEpochHistory.value, {
        mode,
        speed: 1,
        applyEpoch: nmea.applyTimelineEpoch,
      })
      timeline.pause()
      timeline.stepEpoch(1)
    }, mode)
    await page.locator('canvas.chart').evaluate((canvas) => {
      for (let index = 0; index < 4; index += 1) {
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -1200, cancelable: true }))
      }
    })
    await page.getByRole('button', { name: 'Map', exact: true }).click()
    await expect
      .poll(async () => Math.abs(((await currentMarker(page, 'map'))?.x ?? 0) - 500))
      .toBeLessThan(2)
    await page.evaluate(async () => {
      const { useFileTimeline } = await import('/src/composables/useFileTimeline.ts')
      useFileTimeline().stepEpoch(-1)
    })
    await expect
      .poll(async () => Math.abs(((await currentMarker(page, 'map'))?.x ?? 0) - 500))
      .toBeLessThan(2)
    await page.evaluate(async () => {
      const { useFileTimeline } = await import('/src/composables/useFileTimeline.ts')
      useFileTimeline().stepEpoch(1)
    })
    await expect
      .poll(async () => Math.abs(((await currentMarker(page, 'map'))?.x ?? 0) - 500))
      .toBeLessThan(2)
  })
}

test('keeps the current fix in place while a live track backlog is rendered', async ({ page }) => {
  await page.locator('canvas.chart').evaluate((canvas) => {
    for (let index = 0; index < 4; index += 1) {
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -1200, cancelable: true }))
    }
  })
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await page.locator('.tracking-switch .el-switch__core').click()
  const positions = await page.evaluate(
    async (data) => {
      const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
      useNmea().processRawData(data)
      // Vue publishes the latest fix before the history is drawn over several frames.
      await new Promise<void>((resolve) => queueMicrotask(resolve))
      const readPosition = () => {
        const bounds = document
          .querySelector('.map-view path[stroke-width="2"]')!
          .getBoundingClientRect()
        return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
      }
      const positions = [readPosition()]
      for (let frame = 0; frame < 4; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        positions.push(readPosition())
      }
      return positions
    },
    Array.from({ length: 30 }, (_, index) => gga(index + 1, 31 + (index + 1) * 0.000006)).join(''),
  )
  for (const position of positions.slice(1)) {
    expect(
      Math.hypot(position.x - positions[0].x, position.y - positions[0].y),
      'Drawing older historical samples must not move the white current-position marker',
    ).toBeLessThan(1)
  }
})

for (const mode of ['loaded', 'replay'] as const) {
  test(`retains map tiles while following nearby ${mode} file epochs`, async ({ page }) => {
    await page.route('https://*.tile.openstreetmap.org/**', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e4e8de"/></svg>',
      }),
    )
    await inject(
      page,
      Array.from({ length: 15 }, (_, index) =>
        gga(index + 1, 31 + (index + 1) * 0.000006, 7.038 + (index + 1) * 0.000006),
      ).join(''),
    )
    await page.evaluate(async (mode) => {
      const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
      const { useFileTimeline } = await import('/src/composables/useFileTimeline.ts')
      const nmea = useNmea()
      nmea.prepareTimelineProjection(mode)
      const timeline = useFileTimeline()
      timeline.attachTimeline(nmea.statusEpochHistory.value, {
        mode,
        speed: 1,
        applyEpoch: nmea.applyTimelineEpoch,
      })
      timeline.pause()
      if (mode === 'loaded') timeline.stepEpoch(-15)
    }, mode)
    await page.getByRole('button', { name: 'Map', exact: true }).click()
    await expect.poll(() => page.locator('.leaflet-tile-loaded').count()).toBeGreaterThan(0)
    const initialScale = await scaleReadout(page)
    await page.locator('.leaflet-tile-loaded').evaluateAll((tiles) => {
      Reflect.set(window, '__playbackTiles', tiles)
    })

    // Step the real file timeline and let marker/track animation frames finish.
    for (let index = 0; index < 10; index += 1) {
      await page.evaluate(async () => {
        const { useFileTimeline } = await import('/src/composables/useFileTimeline.ts')
        useFileTimeline().stepEpoch(1)
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        )
      })
      expect(
        await page.evaluate(() =>
          Reflect.get(window, '__playbackTiles').every((tile: Element) => tile.isConnected),
        ),
        'Nearby file epochs must keep the displayed tiles instead of blanking the map',
      ).toBe(true)
    }
    expect(
      await page.evaluate(async () => {
        const { useFileTimeline } = await import('/src/composables/useFileTimeline.ts')
        return useFileTimeline().cursorIndex.value
      }),
    ).toBe(10)
    await expect
      .poll(async () => Math.abs(((await currentMarker(page, 'map'))?.x ?? 0) - 500))
      .toBeLessThan(2)
    expect((await scaleReadout(page)).label).toBe(initialScale.label)
    expect(Math.abs((await scaleReadout(page)).width - initialScale.width)).toBeLessThan(1)
  })
}

test('limits the GNSS deviation ruler to 5 mm at maximum zoom', async ({ page }) => {
  await page.locator('canvas.chart').evaluate((canvas) => {
    for (let index = 0; index < 20; index += 1) {
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -1200, cancelable: true }))
    }
  })
  const grid = await scaleReadout(page)
  expect(grid.label).toBe('5 mm')
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect.poll(async () => (await scaleReadout(page)).label).toBe(grid.label)
  await expect
    .poll(async () => Math.abs((await scaleReadout(page)).width - grid.width))
    .toBeLessThan(1)
})
