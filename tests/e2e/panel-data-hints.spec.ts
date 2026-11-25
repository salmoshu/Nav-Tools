import { expect, test, type Page } from '@playwright/test'
import { calculateNmeaChecksum } from '../../src/core/data/NmeaStreamParser'

function nmea(body: string): string {
  return `$${body}*${calculateNmeaChecksum(`$${body}`)}\n`
}

async function openApplication(page: Page, windowIds: string[]): Promise<void> {
  await page.addInitScript((ids) => {
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: {
        on() {},
        off() {},
        send() {},
        invoke: async () => undefined,
      },
    })
    localStorage.setItem('nav-tools:locale', 'en-US')
    localStorage.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'data-hints',
          name: 'Data Hints',
          description: '',
          icon: 'data',
          accent: '#2563eb',
          windowIds: ids,
        },
      ]),
    )
    localStorage.setItem('nav-tools:selected-application', 'data-hints')
  }, windowIds)
  await page.goto('/#app/data-hints')
}

async function dropText(page: Page, text: string, name: string): Promise<void> {
  await page.evaluate(
    async ({ content, fileName }) => {
      const { useDevice } = await import('/src/hooks/useDevice.ts')
      const transfer = new DataTransfer()
      transfer.items.add(new File([content], fileName, { type: 'text/plain' }))
      await useDevice().handleDrop(new DragEvent('drop', { dataTransfer: transfer }))
    },
    { content: text, fileName: name },
  )
}

function hint(page: Page, panelId: string) {
  return page.locator(`[id^="grid-item-${panelId}-"] .panel-data-hint`)
}

test('shows no-data hints per panel and clears them when compatible data arrives', async ({
  page,
}) => {
  await openApplication(page, [
    'plot',
    'sky-plot',
    'gnss-deviation',
    'raw-messages',
    'camera-video',
    'motor-parameters',
  ])
  const nmeaText = `${nmea('GPGSV,1,1,01,01,40,083,46')}${nmea('GPGGA,123500,4807.038,N,01131.000,E,4,18,0.9,545.4,M,46.9,M,,')}`
  await dropText(page, nmeaText, 'sample.log')

  await expect(hint(page, 'plot')).toBeVisible({ timeout: 6000 })
  await expect(hint(page, 'plot')).toHaveText('No valid data')
  await expect(hint(page, 'sky-plot')).toHaveCount(0)
  await expect(hint(page, 'gnss-deviation')).toHaveCount(0)
  await expect(hint(page, 'raw-messages')).toHaveCount(0)
  await expect(hint(page, 'camera-video')).toHaveCount(0)
  await expect(hint(page, 'motor-parameters')).toHaveCount(0)

  await page.locator('.flow-console-virtual').getByTitle('Clear console', { exact: true }).click()
  await expect(page.locator('.flow-console-virtual')).toContainText('Total 0 messages')
  await expect(hint(page, 'raw-messages')).toHaveCount(0)
  await expect(hint(page, 'plot')).toHaveText('No valid data')

  await dropText(page, nmeaText, 'sample.log')
  await page.waitForTimeout(3500)
  await expect(hint(page, 'sky-plot')).toHaveCount(0)
  await expect(hint(page, 'gnss-deviation')).toHaveCount(0)
  await expect(hint(page, 'raw-messages')).toHaveCount(0)

  await dropText(page, '{"time":1,"speed":2}\n{"time":2,"speed":3}\n', 'records.log')
  await expect(hint(page, 'plot')).toHaveCount(0)
  await expect(hint(page, 'raw-messages')).toHaveCount(0)
  // The GNSS plots retain their data when the new file feeds the record panels.
  await page.waitForTimeout(3500)
  await expect(hint(page, 'sky-plot')).toHaveCount(0)
  await expect(hint(page, 'gnss-deviation')).toHaveCount(0)
  await expect(hint(page, 'camera-video')).toHaveCount(0)
  await expect(hint(page, 'motor-parameters')).toHaveCount(0)
})

test('never shows primary-source hints for solver-scoped panels', async ({ page }) => {
  await openApplication(page, ['gnsslib-solver', 'raw-messages', 'gnss-deviation'])
  await dropText(page, 'not a supported receiver stream\n', 'unknown.log')
  await expect(page.locator('.gnss-solver')).toBeVisible()
  await page.waitForTimeout(3500)
  await expect(page.locator('.panel-data-hint')).toHaveCount(0)
})
