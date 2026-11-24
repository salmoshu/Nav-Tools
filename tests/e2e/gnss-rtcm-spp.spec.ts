import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { crc24q } from '../../src/core/gnssraw/RtcmFileAccess'

// Same small observation and broadcast-navigation capture as Open-GNSS's decoder tests.
const capture = [...readFileSync('tests/fixtures/gnss-spp.rtcm3')]

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
    transfer.items.add(new File([new Uint8Array(bytes)], 'receiver.rtcm3', {
      lastModified: Date.UTC(2005, 3, 2),
    }))
    await useDevice().handleDrop(new DragEvent('drop', { dataTransfer: transfer }))
  }, capture)
  await expect(page.getByText('SPP solved 3 epochs')).toBeVisible()
  const result = await page.evaluate(async () => {
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    const nmea = useNmea()
    return {
      positionEpochs: nmea.positionEpochHistory.value.length,
      types: nmea.satelliteSnrData.value.map((sat) => sat.usedInFix === true),
    }
  })
  expect(result.positionEpochs).toBe(3)
  expect(result.types.filter(Boolean).length).toBeGreaterThan(0)
  expect(result.types).toContain(false)

  await signals.locator('.view-select').click()
  await page.getByRole('option', { name: 'Table View', exact: true }).click()
  const rows = signals.locator('.el-table__body tbody tr')
  await expect(rows).toHaveCount(result.types.length)
  await signals.locator('.satellite-scope-select').click()
  await page.getByRole('option', { name: 'Used in fix', exact: true }).click()
  await expect(rows).toHaveCount(result.types.filter(Boolean).length)
})

test('detects the binary network stream and flushes its final SPP epoch on disconnect', async ({ page }) => {
  const reference = new Uint8Array(15)
  reference.set([0xd3, 0, 9])
  let offset = 24
  for (const [value, length] of [[1013, 12], [0, 12], [Date.UTC(2005, 3, 2) / 86400000 + 40587, 16],
    [0, 17], [0, 5], [13, 8]]) {
    for (let bit = length - 1; bit >= 0; bit--, offset++)
      reference[offset >>> 3] |= ((value >>> bit) & 1) << (7 - (offset & 7))
  }
  const crc = crc24q(reference, 0, 12)
  reference.set([crc >>> 16, crc >>> 8, crc], 12)
  await page.evaluate(async (bytes) => {
    const { useDevice } = await import('/src/hooks/useDevice.ts')
    useDevice().globalDevice.value = {
      type: 'network', protocol: 'tcp', host: '127.0.0.1', port: 8123, connected: true,
    }
    const emit = Reflect.get(window, '__emitSppBytes') as (bytes: Uint8Array) => void
    for (let i = 0; i < bytes.length; i += 83) emit(new Uint8Array(bytes.slice(i, i + 83)))
  }, [...reference, ...capture])
  const epochs = () => page.evaluate(async () => {
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    return useNmea().positionEpochHistory.value.length
  })
  await expect.poll(epochs).toBe(2)
  await page.evaluate(async () => {
    const { useDevice } = await import('/src/hooks/useDevice.ts')
    await useDevice().closeCurrDevice()
  })
  await expect.poll(epochs).toBe(3)
})
