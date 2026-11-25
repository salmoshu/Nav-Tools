import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { crc24q } from '../../src/core/gnssraw/RtcmFileAccess'

// Same small observation and broadcast-navigation capture as Open-GNSS's decoder tests.
const capture = [...readFileSync('tests/fixtures/gnss-spp.rtcm3')]
const multipleBands = [...readFileSync('tests/fixtures/gnss-spp-multifrequency.rtcm3')]
// Final GGA latitude from the reference EKF run, in decimal degrees.
const finalEkfLatitude = 35 + 9.6526074 / 60

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    localStorage.setItem('nav-tools:selected-application', 'gnss')
    const listeners = new Map<string, Set<(event: unknown, ...args: unknown[]) => void>>()
    Reflect.set(window, 'ipcRenderer', {
      on(channel: string, listener: (event: unknown, ...args: unknown[]) => void) {
        if (!listeners.has(channel)) listeners.set(channel, new Set())
        listeners.get(channel)!.add(listener)
      },
      off(channel: string, listener: (event: unknown, ...args: unknown[]) => void) {
        listeners.get(channel)?.delete(listener)
      },
      send() {},
      invoke: async () => undefined,
    })
    Reflect.set(window, '__emitSppBytes', (bytes: Uint8Array) => {
      for (const listener of listeners.get('source-data-bytes') ?? [])
        listener(null, 'network', bytes)
    })
  })
  await page.goto('/#app/gnss')
  await expect(page.locator('.snr-container')).toBeVisible()
})

test('imports raw RTCM3 into GNSS, emits NMEA and filters used satellites', async ({ page }) => {
  const signals = page.locator('.snr-container')
  await page.evaluate(async (bytes) => {
    const { useDevice } = await import('/src/hooks/useDevice.ts')
    const transfer = new DataTransfer()
    transfer.items.add(
      new File([new Uint8Array(bytes)], 'receiver.rtcm3', {
        lastModified: Date.UTC(2005, 3, 2),
      }),
    )
    await useDevice().handleDrop(new DragEvent('drop', { dataTransfer: transfer }))
  }, capture)
  await expect(page.getByText('SPP solved 3 epochs')).toBeVisible()
  const messages = page.locator('.flow-console-virtual')
  await expect(messages.locator('.data-parser-badge')).toHaveText('RTCM3')
  await expect(messages.locator('.message-content').first()).toContainText(/^D3 /)
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useConsole } = await import('/src/composables/flow/useConsole.ts')
        return useConsole(true)
          .messages.value.map(({ raw }) => raw.replace(/ /g, ''))
          .join('')
      }),
    )
    .toBe(Buffer.from(capture).toString('hex').toUpperCase())
  const result = await page.evaluate(async () => {
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    const nmea = useNmea()
    return {
      positionEpochs: nmea.positionEpochHistory.value.length,
      latitude: nmea.latestGgaPosition.value?.latitude,
      types: nmea.satelliteSnrData.value.map((sat) => sat.usedInFix === true),
    }
  })
  expect(result.positionEpochs).toBe(3)
  expect(result.latitude).toBeCloseTo(finalEkfLatitude, 6)
  expect(result.types.filter(Boolean).length).toBeGreaterThan(0)
  expect(result.types).toContain(false)

  await signals.locator('.view-select').click()
  await page.getByRole('option', { name: 'Table View', exact: true }).click()
  const rows = signals.locator('.el-table__body tbody tr')
  await expect(rows).toHaveCount(result.types.length)
  await signals.locator('.satellite-scope-select').click()
  await page.getByRole('option', { name: 'Used Satellites', exact: true }).click()
  await expect(rows).toHaveCount(result.types.filter(Boolean).length)
})

test('detects the binary network stream and flushes its final SPP epoch on disconnect', async ({
  page,
}) => {
  const reference = new Uint8Array(15)
  reference.set([0xd3, 0, 9])
  let offset = 24
  for (const [value, length] of [
    [1013, 12],
    [0, 12],
    [Date.UTC(2005, 3, 2) / 86400000 + 40587, 16],
    [0, 17],
    [0, 5],
    [13, 8],
  ]) {
    for (let bit = length - 1; bit >= 0; bit--, offset++)
      reference[offset >>> 3] |= ((value >>> bit) & 1) << (7 - (offset & 7))
  }
  const crc = crc24q(reference, 0, 12)
  reference.set([crc >>> 16, crc >>> 8, crc], 12)
  await page.evaluate(
    async (bytes) => {
      const { useDevice } = await import('/src/hooks/useDevice.ts')
      useDevice().globalDevice.value = {
        type: 'network',
        protocol: 'tcp',
        host: '127.0.0.1',
        port: 8123,
        connected: true,
      }
      const emit = Reflect.get(window, '__emitSppBytes') as (bytes: Uint8Array) => void
      for (let i = 0; i < bytes.length; i += 83) emit(new Uint8Array(bytes.slice(i, i + 83)))
    },
    [...reference, ...capture],
  )
  const snapshot = () =>
    page.evaluate(async () => {
      const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
      const nmea = useNmea()
      return {
        epochs: nmea.positionEpochHistory.value.length,
        latitude: nmea.latestGgaPosition.value?.latitude,
        bands: nmea.satelliteSnrData.value
          .find((satellite) => Number(satellite.prn) === 3)
          ?.signals?.map(({ band }) => band),
      }
    })
  await expect.poll(async () => (await snapshot()).epochs).toBe(2)
  expect((await snapshot()).bands).toEqual(['L1', 'L2'])
  await page.evaluate(async () => {
    const { useDevice } = await import('/src/hooks/useDevice.ts')
    await useDevice().closeCurrDevice()
  })
  await expect.poll(async () => (await snapshot()).epochs).toBe(3)
  expect((await snapshot()).latitude).toBeCloseTo(finalEkfLatitude, 6)
  await expect(page.locator('.flow-console-virtual .data-parser-badge')).toHaveText('RTCM3')
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useConsole } = await import('/src/composables/flow/useConsole.ts')
        return useConsole(true)
          .messages.value.map(({ raw }) => raw.replace(/ /g, ''))
          .join('')
      }),
    )
    .toBe(
      Buffer.from([...reference, ...capture])
        .toString('hex')
        .toUpperCase(),
    )
})

test('shows precise bands and angle diagrams from an RTCM3 replay epoch', async ({ page }) => {
  const signals = page.locator('.snr-container')
  await page.evaluate(async (bytes) => {
    const { useDevice } = await import('/src/hooks/useDevice.ts')
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    const { useFileTimeline } = await import('/src/composables/useFileTimeline.ts')
    const transfer = new DataTransfer()
    transfer.items.add(
      new File([new Uint8Array(bytes)], 'dual-band.rtcm3', {
        lastModified: Date.UTC(2020, 5, 25),
      }),
    )
    await useDevice().handleDrop(new DragEvent('drop', { dataTransfer: transfer }))
    useFileTimeline().seekEpoch(useNmea().statusEpochHistory.value, 0)
  }, multipleBands)
  await expect(signals.locator('.view-select')).toContainText('Sat Num')
  await expect(signals.locator('.satellite-scope-select')).toContainText('All Satellites')
  await signals.locator('.view-select').click()
  await page.getByRole('option', { name: 'Table View', exact: true }).click()

  const row = signals
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: '5', exact: true }) })
  await expect(row.locator('.signal-reading')).toHaveText([
    /L1 C\/A\s*48\.25/,
    /L2 P\(Y\)\s*51\.75/,
  ])
  const otherRow = signals
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: '7', exact: true }) })
  const elevationSector = row.locator('.sat-angle-diagram--elevation .sat-angle-sector')
  await expect(elevationSector).toHaveCSS('width', '16px')
  await expect(elevationSector).toHaveCSS('height', '16px')
  await expect(elevationSector).toHaveCSS('border-top-right-radius', '100%')
  await expect(elevationSector).toHaveCSS('border-bottom-right-radius', '0px')
  for (const kind of ['elevation', 'azimuth']) {
    const selector = `.sat-angle-diagram--${kind} .sat-angle-sector`
    const sector = row.locator(selector)
    const otherSector = otherRow.locator(selector)
    await expect(sector).toBeVisible()
    await expect(sector).toHaveCSS('background-image', /^conic-gradient/)
    await expect(otherSector).toHaveCSS('background-image', /^conic-gradient/)
    await expect(row.locator(`.sat-angle-diagram--${kind} .sat-angle-ray`)).not.toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    )
    const fill = await sector.evaluate((element) => getComputedStyle(element).backgroundImage)
    await expect(otherSector).not.toHaveCSS('background-image', fill)
  }

  await signals.locator('.view-select').click()
  await page.getByRole('option', { name: 'Bar Chart View', exact: true }).click()
  const chartFilters = signals.getByRole('button', { name: 'Chart filters', exact: true })
  await chartFilters.click()
  await page.getByRole('radio', { name: 'L2', exact: true }).check()
  await expect(chartFilters.locator('.chart-filter-indicator')).toBeVisible()
  await chartFilters.click()
  const bar = () =>
    page.evaluate(() => {
      const chart = document.querySelector('.signal-bar-chart') as HTMLElement & {
        __vueParentComponent?: { setupState?: { chartInstance?: { getOption(): any } } }
      }
      const option = chart.__vueParentComponent?.setupState?.chartInstance?.getOption()
      return option?.series[0].data.find((sample) => Number(sample.prn) === 5)?.value
    })
  await expect.poll(bar).toBe(51.75)

  await signals.locator('.view-select').click()
  await page.getByRole('option', { name: 'Per-Satellite', exact: true }).click()
  await signals.locator('.persat-select').click()
  await page.getByRole('option', { name: 'G5 · GPS', exact: true }).click()
  const lines = () =>
    page.evaluate(() => {
      const chart = document.querySelector('.persat-chart') as HTMLElement & {
        __vueParentComponent?: { setupState?: { perSatChartInstance?: { getOption(): any } } }
      }
      return chart.__vueParentComponent?.setupState?.perSatChartInstance
        ?.getOption()
        ?.series.map((series) => [series.name, series.data])
    })
  await expect.poll(lines).toEqual([
    ['G5 · L1 C/A (1C)', [48.25]],
    ['G5 · L2 P(Y) (2W)', [51.75]],
  ])
})
