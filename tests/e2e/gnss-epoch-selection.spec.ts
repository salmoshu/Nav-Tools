import { expect, test, type Page } from '@playwright/test'
import { openSolver } from './support/gnssSolver'

function sentence(body: string): string {
  const checksum = [...body].reduce((value, char) => value ^ char.charCodeAt(0), 0)
  return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`
}

async function fitGrid(page: Page) {
  const deviation = page.locator('.deviation-container')
  const tracking = deviation.locator('.tracking-switch')
  if (await tracking.evaluate((element) => element.classList.contains('is-checked')))
    await tracking.click()
  await deviation.getByRole('button', { name: 'Reset Layout', exact: true }).click()
  const canvas = deviation.locator('canvas.chart')
  await canvas.scrollIntoViewIfNeeded()
  await page.waitForTimeout(100)
  return canvas
}

for (const mode of ['loaded', 'replay'] as const) {
  test(`double-clicking a ${mode} trajectory point selects messages, satellites and status at that epoch`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.addInitScript(() => {
      localStorage.setItem('nav-tools:locale', 'en-US')
      Reflect.set(window, 'ipcRenderer', {
        invoke: async () => undefined,
        send: () => undefined,
        on: () => undefined,
        off: () => undefined,
      })
    })
    await page.route('https://*.tile.openstreetmap.org/**', (route) => route.abort())
    await page.goto('/#app/gnss')
    await expect(page.locator('.deviation-container')).toBeVisible()
    const text = [1, 7, 12]
      .map(
        (prn, index) =>
          sentence(`GPGSV,1,1,01,${String(prn).padStart(2, '0')},40,083,${[46, 38, 50][index]}`) +
          sentence(
            `GPGGA,12350${index}.00,48${(7.038 + index * 0.001).toFixed(6).padStart(9, '0')},N,011${(31 + index * 0.001).toFixed(6).padStart(9, '0')},E,${[4, 5, 1][index]},01,1.0,10.0,M,20.0,M,,`,
          ),
      )
      .join('')
    await page.evaluate(
      async ({ text, mode }) => {
        const devicePath = '/src/hooks/useDevice.ts'
        const timelinePath = '/src/composables/useFileTimeline.ts'
        const consolePath = '/src/composables/flow/useConsole.ts'
        const { useDevice } = await import(/* @vite-ignore */ devicePath)
        const { useFileTimeline } = await import(/* @vite-ignore */ timelinePath)
        const { useConsole } = await import(/* @vite-ignore */ consolePath)
        useDevice().fileTimeTag.value = mode === 'replay'
        const transfer = new DataTransfer()
        transfer.items.add(new File([text], 'epoch-selection.nmea', { type: 'text/plain' }))
        await useDevice().handleDrop(new DragEvent('drop', { dataTransfer: transfer }))
        useFileTimeline().seekElapsedTime(useFileTimeline().durationMilliseconds.value)
        useConsole(true).dataAutoScroll.value = false
      },
      { text, mode },
    )
    await expect(page.locator('.timeline-epoch')).toHaveText('3 / 3')
    const canvas = await fitGrid(page)
    const box = (await canvas.boundingBox())!
    await canvas.dblclick({ position: { x: box.width / 2, y: box.height / 2 } })
    await expect(page.locator('.timeline-epoch')).toHaveText('2 / 3')
    await expect(page.locator('.flow-console-virtual .timeline-current')).toContainText(
      'GPGGA,123501.00',
    )
    await expect(page.locator('.flow-console-virtual .timeline-current')).toBeInViewport()
    await expect(page.locator('.snr-value')).toHaveText('38 dB')
    await expect(page.locator('.gnss-sky-container svg[baseProfile="full"]')).toContainText('G7')
    const snapshot = await page.evaluate(async () => {
      const gnssPath = '/src/stores/gnss.ts'
      const timelinePath = '/src/composables/useFileTimeline.ts'
      const { useGnssStore } = await import(/* @vite-ignore */ gnssPath)
      const { useFileTimeline } = await import(/* @vite-ignore */ timelinePath)
      return { quality: useGnssStore().status.quality, playing: useFileTimeline().playing.value }
    })
    expect(snapshot).toEqual({ quality: 5, playing: false })
    if (mode === 'loaded') {
      await page.locator('.timeline-slider').focus()
      await page.locator('.timeline-slider').press('End')
      await page.locator('.deviation-container .layer-icon-button').nth(1).click()
      const map = page.locator('.map-view')
      await expect(map).toBeVisible()
      await page.waitForTimeout(150)
      const mapBox = (await map.boundingBox())!
      await map.dblclick({ position: { x: mapBox.width / 2, y: mapBox.height / 2 } })
      await expect(page.locator('.timeline-epoch')).toHaveText('2 / 3')
    }
    expect(errors).toEqual([])
  })
}

test('post-processing publishes its own toolbar timeline and links the selected record and deviation point', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const panel = await openSolver(page)
  await panel.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__solverPostCalls'))).toBe(1)
  await page.evaluate(() => Reflect.get(window, '__solverCompletePost')({ count: 1205 }))
  await expect(panel.locator('.solver-state.success')).toBeVisible()
  await expect(page.locator('.timeline-epoch')).toHaveText('1205 / 1205')
  await page.locator('.timeline-slider').focus()
  await page.locator('.timeline-slider').press('Home')
  await expect(page.locator('.timeline-epoch')).toHaveText('1 / 1205')
  await expect(page.locator('.flow-console-virtual .timeline-current')).toContainText(
    '2024/07/30 00:00:00.000',
  )
  await expect(panel.locator('.solver-latest')).toContainText('2024/07/30 00:00:00.000')
  const canvas = await fitGrid(page)
  const box = (await canvas.boundingBox())!
  await canvas.dblclick({ position: { x: box.width / 2, y: box.height / 2 } })
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const path = '/src/composables/useGnssSolverSession.ts'
        const { useGnssSolverSession } = await import(/* @vite-ignore */ path)
        return useGnssSolverSession().display.timeline.cursorIndex.value
      }),
    )
    .toBeGreaterThan(599)
  const selectedTime = await page.evaluate(async () => {
    const path = '/src/composables/useGnssSolverSession.ts'
    const { useGnssSolverSession } = await import(/* @vite-ignore */ path)
    const session = useGnssSolverSession()
    if (session.display.timeline.cursorIndex.value > 604)
      throw new Error('Picked point is outside the center of the track')
    return session.currentSolution.value.time
  })
  await expect(page.locator('.flow-console-virtual .timeline-current')).toContainText(selectedTime)
  await expect(page.locator('.flow-console-virtual .timeline-current')).toBeInViewport()
  await expect(panel.locator('.solver-latest')).toContainText(selectedTime)
  await page.screenshot({ path: 'test-results/gnss-solver-epoch-selection.png', fullPage: true })
})

for (const source of ['serial', 'network'] as const) {
  test(`${source} history supports stop, linked inspection, reconnect and unexpected disconnection`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.addInitScript(() => {
      localStorage.setItem('nav-tools:locale', 'en-US')
      const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
      Reflect.set(window, '__emitReceiver', (channel: string, payload: unknown) => {
        for (const listener of listeners.get(channel) ?? []) listener({}, payload)
      })
      Reflect.set(window, 'ipcRenderer', {
        on(channel: string, listener: (...args: unknown[]) => void) {
          const entries = listeners.get(channel) ?? new Set()
          entries.add(listener)
          listeners.set(channel, entries)
        },
        off(channel: string, listener: (...args: unknown[]) => void) {
          listeners.get(channel)?.delete(listener)
        },
        invoke: async (channel: string) => (channel === 'search-serial-ports' ? [] : undefined),
        send: () => undefined,
      })
    })
    await page.route('https://*.tile.openstreetmap.org/**', (route) => route.abort())
    await page.goto('/#app/gnss')
    await expect(page.locator('.deviation-container')).toBeVisible()
    await page.evaluate(async (source) => {
      const devicePath = '/src/hooks/useDevice.ts'
      const managerPath = '/src/composables/useDataSourceManager.ts'
      const { useDevice } = await import(/* @vite-ignore */ devicePath)
      const { useDataSourceManager } = await import(/* @vite-ignore */ managerPath)
      const settings = useDataSourceManager().settings
      settings.serial.parser = 'nmea'
      settings.network.parser = 'nmea'
      const device = useDevice()
      device.networkLoop.value = false
      device.globalDevice.value =
        source === 'serial'
          ? {
              type: 'serial',
              path: 'COM1',
              baudRate: 115200,
              dataBits: 8,
              stopBits: 1,
              parity: 'none',
              connected: false,
            }
          : {
              type: 'network',
              path: 'tcp://127.0.0.1:2101',
              protocol: 'tcp',
              host: '127.0.0.1',
              port: 2101,
              connected: false,
            }
      device.openCurrDevice()
    }, source)
    const connected = () =>
      page.evaluate(async () => {
        const path = '/src/hooks/useDevice.ts'
        const { useDevice } = await import(/* @vite-ignore */ path)
        return useDevice().deviceConnected.value
      })
    await expect.poll(connected).toBe(true)
    const packet = (index: number) =>
      sentence(`GPGSV,1,1,01,${[1, 7, 12, 17][index]},40,083,${[46, 38, 50, 42][index]}`) +
      sentence(
        `GPGGA,12350${index}.00,48${(7.038 + index * 0.001).toFixed(6).padStart(9, '0')},N,011${(31 + index * 0.001).toFixed(6).padStart(9, '0')},E,${[4, 5, 1, 4][index]},01,1.0,10.0,M,20.0,M,,`,
      )
    const channel = source === 'serial' ? 'serial-data-to-renderer' : 'network-data-to-renderer'
    await page.evaluate(
      ({ channel, text }) => Reflect.get(window, '__emitReceiver')(channel, text),
      { channel, text: packet(0) + packet(1) + packet(2) },
    )
    await expect(page.locator('.file-timeline')).toHaveCount(0)
    await page.evaluate(async () => {
      const path = '/src/hooks/useDevice.ts'
      const { useDevice } = await import(/* @vite-ignore */ path)
      useDevice().closeCurrDevice()
    })
    await expect.poll(connected).toBe(false)
    await expect(page.locator('.timeline-epoch')).toHaveText('3 / 3')
    const canvas = await fitGrid(page)
    const box = (await canvas.boundingBox())!
    await canvas.dblclick({ position: { x: box.width / 2, y: box.height / 2 } })
    await expect(page.locator('.timeline-epoch')).toHaveText('2 / 3')
    await expect(page.locator('.flow-console-virtual .timeline-current')).toContainText(
      'GPGGA,123501.00',
    )
    await expect(page.locator('.snr-value')).toHaveText('38 dB')
    await expect(page.locator('.gnss-sky-container svg[baseProfile="full"]')).toContainText('G7')
    await page.locator('.file-timeline .timeline-button').first().click()
    expect(await connected()).toBe(false)
    await page.evaluate(async () => {
      const timelinePath = '/src/composables/useFileTimeline.ts'
      const devicePath = '/src/hooks/useDevice.ts'
      const { useFileTimeline } = await import(/* @vite-ignore */ timelinePath)
      const { useDevice } = await import(/* @vite-ignore */ devicePath)
      useFileTimeline().pause()
      useFileTimeline().seekElapsedTime(1000)
      useDevice().openCurrDevice()
    })
    await expect.poll(connected).toBe(true)
    await expect(page.locator('.file-timeline')).toHaveCount(0)
    const snapshot = await page.evaluate(async () => {
      const path = '/src/stores/gnss.ts'
      const { useGnssStore } = await import(/* @vite-ignore */ path)
      return useGnssStore().status.quality
    })
    expect(snapshot).toBe(1)
    await page.evaluate(
      ({ channel, text }) => {
        Reflect.get(window, '__emitReceiver')(channel, text)
        const foreign =
          channel === 'serial-data-to-renderer'
            ? 'network-data-to-renderer'
            : 'serial-data-to-renderer'
        Reflect.get(window, '__emitReceiver')(foreign, text)
      },
      { channel, text: packet(3) },
    )
    await page.evaluate((source) => {
      Reflect.get(window, '__emitReceiver')(
        source === 'serial' ? 'serial-disconnected' : 'network-disconnected',
        source === 'serial' ? { path: 'COM1' } : { protocol: 'tcp', host: '127.0.0.1', port: 2101 },
      )
    }, source)
    await expect.poll(connected).toBe(false)
    await expect(page.locator('.timeline-epoch')).toHaveText('4 / 4')
    await page.locator('.timeline-slider').focus()
    await page.locator('.timeline-slider').press('Home')
    await expect(page.locator('.flow-console-virtual .timeline-current')).toContainText(
      'GPGGA,123500.00',
    )
    await expect(page.locator('.snr-value')).toHaveText('46 dB')
    await expect(page.locator('.gnss-sky-container svg[baseProfile="full"]')).toContainText('G1')
    await page.evaluate(async () => {
      const path = '/src/hooks/useDevice.ts'
      const { useDevice } = await import(/* @vite-ignore */ path)
      useDevice().removeCurrDevice()
    })
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const path = '/src/hooks/useDevice.ts'
          const { useDevice } = await import(/* @vite-ignore */ path)
          return useDevice().globalDevice.value.connected
        }),
      )
      .toBeNull()
    await expect(page.locator('.timeline-epoch')).toHaveText('1 / 4')
    await page.evaluate(async (source) => {
      const path = '/src/hooks/useDevice.ts'
      const { useDevice } = await import(/* @vite-ignore */ path)
      const device = useDevice()
      device.globalDevice.value =
        source === 'serial'
          ? {
              type: 'serial',
              path: 'COM2',
              baudRate: 115200,
              dataBits: 8,
              stopBits: 1,
              parity: 'none',
              connected: false,
            }
          : {
              type: 'network',
              path: 'tcp://127.0.0.1:2102',
              protocol: 'tcp',
              host: '127.0.0.1',
              port: 2102,
              connected: false,
            }
      device.openCurrDevice()
    }, source)
    await expect.poll(connected).toBe(true)
    await expect(page.locator('.file-timeline')).toHaveCount(0)
    await page.evaluate((source) => {
      Reflect.get(window, '__emitReceiver')(
        source === 'serial' ? 'serial-disconnected' : 'network-disconnected',
        source === 'serial' ? { path: 'COM1' } : { protocol: 'tcp', host: '127.0.0.1', port: 2101 },
      )
    }, source)
    expect(await connected()).toBe(true)
    await page.evaluate(
      ({ channel, text }) => Reflect.get(window, '__emitReceiver')(channel, text),
      { channel, text: packet(0) },
    )
    await page.evaluate(async () => {
      const path = '/src/hooks/useDevice.ts'
      const { useDevice } = await import(/* @vite-ignore */ path)
      useDevice().closeCurrDevice()
    })
    await expect(page.locator('.timeline-epoch')).toHaveText('1 / 1')
    expect(errors).toEqual([])
  })
}
