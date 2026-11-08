import { expect, test, type Page } from '@playwright/test'

function nmeaEpoch(second: number): string {
  const body = `GNGGA,1235${String(second).padStart(2, '0')},4807.038,N,01131.000,E,4,18,0.9,545.4,M,46.9,M,,`
  const checksum = [...body].reduce((sum, character) => sum ^ character.charCodeAt(0), 0)
  return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`
}

function posEpoch(second: number): string {
  return `2024/04/26 03:21:${String(second).padStart(2, '0')}.000 39.980744192 116.476662780 63.7868 1 37 0.01 0.01 0.01\n`
}

async function dropText(page: Page, name: string, text: string) {
  return page.evaluate(
    async ({ name, text }) => {
      const { useDevice } = await import('/src/hooks/useDevice.ts')
      const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
      const { useFileTimeline } = await import('/src/composables/useFileTimeline.ts')
      const transfer = new DataTransfer()
      transfer.items.add(new File([text], name, { type: 'text/plain' }))
      await useDevice().handleDrop(new DragEvent('drop', { dataTransfer: transfer }))
      return {
        epochs: useNmea().positionEpochHistory.value.length,
        timelineActive: useFileTimeline().active.value,
      }
    },
    { name, text },
  )
}

test.beforeEach(async ({ page }) => {
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
  await page.goto('/')
  await page.locator('.application-card[data-application-id="gnss"]').click()
  await expect(page.locator('.deviation-container')).toBeVisible()
})

test('detects each file independently when alternating NMEA and RTKLIB POS content', async ({
  page,
}) => {
  for (const file of [
    { name: 'first.nmea', text: nmeaEpoch(0) + nmeaEpoch(1), epochs: 2 },
    { name: 'second.pos', text: posEpoch(0) + posEpoch(1) + posEpoch(2), epochs: 3 },
    { name: 'nmea-named-as-pos.pos', text: nmeaEpoch(0) + nmeaEpoch(1), epochs: 2 },
    { name: 'pos-named-as-nmea.nmea', text: posEpoch(0), epochs: 1 },
    { name: 'third.backup', text: nmeaEpoch(0), epochs: 1 },
  ]) {
    expect(await dropText(page, file.name, file.text), file.name).toEqual({
      epochs: file.epochs,
      timelineActive: true,
    })
  }
})

test('loads GNSS text with a non-standard suffix through the file dialog', async ({ page }) => {
  await page.getByTitle('Input', { exact: true }).click()
  const dialog = page.locator('.data-input-dialog')
  await page.getByRole('tab', { name: /File Input/ }).click()
  const fileChooser = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: 'Select File', exact: true }).click()
  await (
    await fileChooser
  ).setFiles({
    name: 'receiver.capture',
    mimeType: 'text/plain',
    buffer: Buffer.from(posEpoch(0) + posEpoch(1)),
  })
  await dialog.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.file-timeline')).toBeVisible()
  await expect(page.locator('.timeline-epoch')).toContainText('/ 2')
})
