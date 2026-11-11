import { expect, test } from '@playwright/test'

const frameHex = 'd300133ed00103000000000080000000000000000000a909c3'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
    Reflect.set(window, '__emitSource', (channel: string, ...args: unknown[]) => {
      for (const listener of listeners.get(channel) ?? []) listener({}, ...args)
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
})

test('per-application format preferences are independent and persisted', async ({ page }) => {
  await page.goto('/#app/gnssraw')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Automatic format detection', exact: true }).click()
  const gnss = page.locator('.format-settings-card[data-application-id="gnss"]')
  const raw = page.locator('.format-settings-card[data-application-id="gnssraw"]')
  await expect(gnss.getByLabel('NMEA')).toBeChecked()
  await expect(gnss.getByLabel('RTCM3')).not.toBeChecked()
  await expect(raw.getByLabel('RTCM3')).toBeChecked()
  await page.screenshot({ path: 'test-results/auto-format-settings.png', fullPage: true })
  await raw.locator('.el-checkbox').filter({ hasText: 'RTCM3' }).click()
  await expect(gnss.getByLabel('NMEA')).toBeChecked()
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('nav-tools:auto-format-settings')!).gnssraw,
    ),
  ).toEqual(['rinex'])
  await page.reload()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Automatic format detection', exact: true }).click()
  await expect(
    page.locator('.format-settings-card[data-application-id="gnssraw"]').getByLabel('RTCM3'),
  ).not.toBeChecked()
})

test('identifies RTCM in a .dat file and shows the result without changing auto mode', async ({
  page,
}) => {
  await page.goto('/#app/gnssraw')
  await page.evaluate(async (hex) => {
    const path = '/src/hooks/useDevice.ts'
    const { useDevice } = await import(/* @vite-ignore */ path)
    const bytes = Uint8Array.from((hex + hex).match(/../g)!, (byte) => parseInt(byte, 16))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], 'capture.dat'))
    await useDevice().handleDrop(new DragEvent('drop', { dataTransfer: transfer }))
  }, frameHex)
  await expect(page.locator('.gnssraw-frames tbody')).toContainText('1005')
  await page.getByTitle('Input', { exact: true }).click()
  await expect(page.locator('#pane-file .format-detected')).toHaveText('Detected: RTCM3')
  await expect(page.locator('#pane-file .parser-select input')).toHaveValue('Auto detect')
})

test('detects a generic binary file before confirming the file picker', async ({ page }) => {
  await page.goto('/#app/gnssraw')
  await page.getByTitle('Input', { exact: true }).click()
  const dialog = page.locator('.data-input-dialog')
  const chooser = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: 'Select File', exact: true }).click()
  await (
    await chooser
  ).setFiles({
    name: 'capture.dat',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(frameHex + frameHex, 'hex'),
  })
  await expect(dialog.locator('#pane-file .format-detected')).toHaveText('Detected: RTCM3')
  await dialog.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(page.locator('.gnssraw-frames tbody')).toContainText('1005')
})

test('manual raw format does not silently switch to RTCM', async ({ page }) => {
  await page.goto('/#app/gnssraw')
  await page.evaluate(async (hex) => {
    const devicePath = '/src/hooks/useDevice.ts'
    const settingsPath = '/src/composables/useDataSourceManager.ts'
    const { useDevice } = await import(/* @vite-ignore */ devicePath)
    const { useDataSourceManager } = await import(/* @vite-ignore */ settingsPath)
    useDataSourceManager().settings.file.format = 'raw'
    const transfer = new DataTransfer()
    transfer.items.add(
      new File(
        [Uint8Array.from((hex + hex).match(/../g)!, (byte) => parseInt(byte, 16))],
        'capture.rtcm3',
      ),
    )
    await useDevice().handleDrop(new DragEvent('drop', { dataTransfer: transfer }))
  }, frameHex)
  await expect(page.locator('.gnssraw-frames tbody')).toHaveCount(0)
  await expect(page.locator('.el-message--warning')).toContainText('Binary data was not parsed')
})

test('incrementally identifies and decodes fragmented RTCM network bytes', async ({ page }) => {
  await page.goto('/#app/gnssraw')
  await page.evaluate(async () => {
    const path = '/src/hooks/useDevice.ts'
    const { useDevice } = await import(/* @vite-ignore */ path)
    const device = useDevice()
    device.globalDevice.value = {
      type: 'network',
      path: 'tcp://127.0.0.1:2101',
      protocol: 'tcp',
      host: '127.0.0.1',
      port: 2101,
      connected: false,
    }
    device.openCurrDevice()
  })
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/src/hooks/useDevice.ts'
        const { useDevice } = await import(/* @vite-ignore */ path)
        return useDevice().deviceConnected.value
      }),
    )
    .toBe(true)
  await page.evaluate((hex) => {
    const bytes = Uint8Array.from((hex + hex).match(/../g)!, (byte) => parseInt(byte, 16))
    for (const part of [bytes.slice(0, 7), bytes.slice(7, 31), bytes.slice(31)]) {
      Reflect.get(window, '__emitSource')('source-data-bytes', 'network', part)
      Reflect.get(window, '__emitSource')(
        'network-data-to-renderer',
        new TextDecoder().decode(part),
      )
    }
    Reflect.get(window, '__emitSource')('network-disconnected', {
      protocol: 'tcp',
      host: '127.0.0.1',
      port: 2101,
    })
  }, frameHex)
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/src/composables/useGnssRaw.ts'
        const { useGnssRaw } = await import(/* @vite-ignore */ path)
        return useGnssRaw().dataset.value?.stats.framesOk
      }),
    )
    .toBe(2)
  await expect(page.locator('.gnssraw-frames tbody')).toContainText('1005')
})

test('GNSS-Raw can detect RTCM after an NMEA sentence in a mixed stream', async ({ page }) => {
  await page.goto('/#app/gnssraw')
  await page.evaluate(async () => {
    const path = '/src/hooks/useDevice.ts'
    const { useDevice } = await import(/* @vite-ignore */ path)
    const device = useDevice()
    device.globalDevice.value = {
      type: 'network',
      path: 'tcp://127.0.0.1:2101',
      protocol: 'tcp',
      host: '127.0.0.1',
      port: 2101,
      connected: false,
    }
    device.openCurrDevice()
  })
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/src/hooks/useDevice.ts'
        const { useDevice } = await import(/* @vite-ignore */ path)
        return useDevice().deviceConnected.value
      }),
    )
    .toBe(true)
  await page.evaluate((hex) => {
    const body = 'GNGGA,123500,4807.038,N,01131.000,E,4,18,0.9,545.4,M,46.9,M,,'
    const checksum = [...body]
      .reduce((value, char) => value ^ char.charCodeAt(0), 0)
      .toString(16)
      .toUpperCase()
      .padStart(2, '0')
    const parts = [
      new TextEncoder().encode(`$${body}*${checksum}\r\n`),
      Uint8Array.from((hex + hex).match(/../g)!, (byte) => parseInt(byte, 16)),
    ]
    for (const part of parts) {
      Reflect.get(window, '__emitSource')('source-data-bytes', 'network', part)
      Reflect.get(window, '__emitSource')(
        'network-data-to-renderer',
        new TextDecoder().decode(part),
      )
    }
    Reflect.get(window, '__emitSource')('network-disconnected', {
      protocol: 'tcp',
      host: '127.0.0.1',
      port: 2101,
    })
  }, frameHex)
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/src/composables/useGnssRaw.ts'
        const { useGnssRaw } = await import(/* @vite-ignore */ path)
        return useGnssRaw().dataset.value?.stats.framesOk
      }),
    )
    .toBe(2)
})

test('changing application settings controls actual detection', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('nav-tools:auto-format-settings', JSON.stringify({ gnssraw: ['rinex'] })),
  )
  await page.goto('/#app/gnssraw')
  const drop = async () =>
    page.evaluate(async (hex) => {
      const path = '/src/hooks/useDevice.ts'
      const { useDevice } = await import(/* @vite-ignore */ path)
      const bytes = Uint8Array.from((hex + hex).match(/../g)!, (byte) => parseInt(byte, 16))
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'capture.dat'))
      await useDevice().handleDrop(new DragEvent('drop', { dataTransfer: transfer }))
    }, frameHex)
  await drop()
  await expect(page.locator('.gnssraw-frames tbody')).toHaveCount(0)
  await page.evaluate(async () => {
    const path = '/src/composables/useAutoFormatSettings.ts'
    const { useAutoFormatSettings } = await import(/* @vite-ignore */ path)
    useAutoFormatSettings().setFormats('gnssraw', ['rtcm3'])
  })
  await drop()
  await expect(page.locator('.gnssraw-frames tbody')).toContainText('1005')
})

test('enabling a format restarts detection on an already connected network stream', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('nav-tools:auto-format-settings', JSON.stringify({ gnssraw: ['rinex'] })),
  )
  await page.goto('/#app/gnssraw')
  await page.evaluate(async () => {
    const path = '/src/hooks/useDevice.ts'
    const { useDevice } = await import(/* @vite-ignore */ path)
    const device = useDevice()
    device.globalDevice.value = {
      type: 'network',
      path: 'tcp://127.0.0.1:2101',
      protocol: 'tcp',
      host: '127.0.0.1',
      port: 2101,
      connected: false,
    }
    device.openCurrDevice()
  })
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/src/hooks/useDevice.ts'
        const { useDevice } = await import(/* @vite-ignore */ path)
        return useDevice().deviceConnected.value
      }),
    )
    .toBe(true)
  const send = async () =>
    page.evaluate((hex) => {
      const bytes = Uint8Array.from((hex + hex).match(/../g)!, (byte) => parseInt(byte, 16))
      Reflect.get(window, '__emitSource')('source-data-bytes', 'network', bytes)
      Reflect.get(window, '__emitSource')(
        'network-data-to-renderer',
        new TextDecoder().decode(bytes),
      )
    }, frameHex)
  await send()
  await expect(page.locator('.gnssraw-frames tbody')).toHaveCount(0)
  await page.evaluate(async () => {
    const path = '/src/composables/useAutoFormatSettings.ts'
    const { useAutoFormatSettings } = await import(/* @vite-ignore */ path)
    useAutoFormatSettings().setFormats('gnssraw', ['rtcm3'])
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  await send()
  await expect(page.locator('.gnssraw-frames tbody')).toContainText('1005')
})

test('recognizes split NMEA bytes independently of the HEX display', async ({ page }) => {
  await page.goto('/#app/gnss')
  await page.evaluate(async () => {
    const devicePath = '/src/hooks/useDevice.ts'
    const consolePath = '/src/composables/flow/useConsole.ts'
    const { useDevice } = await import(/* @vite-ignore */ devicePath)
    const { useConsole } = await import(/* @vite-ignore */ consolePath)
    useConsole(true).displayFormat.value = 'hex'
    const device = useDevice()
    device.globalDevice.value = {
      type: 'serial',
      path: 'COM1',
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      connected: false,
    }
    device.openCurrDevice()
  })
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/src/hooks/useDevice.ts'
        const { useDevice } = await import(/* @vite-ignore */ path)
        return useDevice().deviceConnected.value
      }),
    )
    .toBe(true)
  await page.evaluate(() => {
    const body = 'GNGGA,123500,4807.038,N,01131.000,E,4,18,0.9,545.4,M,46.9,M,,'
    const checksum = [...body]
      .reduce((value, char) => value ^ char.charCodeAt(0), 0)
      .toString(16)
      .toUpperCase()
      .padStart(2, '0')
    const bytes = new TextEncoder().encode(`$${body}*${checksum}\r\n`)
    for (const part of [bytes.slice(0, 15), bytes.slice(15)]) {
      Reflect.get(window, '__emitSource')('source-data-bytes', 'serial', part)
      Reflect.get(window, '__emitSource')(
        'serial-data-to-renderer',
        Array.from(part, (byte) => byte.toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase(),
      )
    }
  })
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/src/composables/gnss/useNmea.ts'
        const { useNmea } = await import(/* @vite-ignore */ path)
        return useNmea().positionEpochHistory.value.length
      }),
    )
    .toBe(1)
})
