import { expect, test } from '@playwright/test'
import { calculateNmeaChecksum } from '../../src/core/data/NmeaStreamParser'

function nmea(body: string): string {
  return `$${body}*${calculateNmeaChecksum(`$${body}`)}\n`
}

test('uses an Element Plus playback-speed select in the toolbar timeline', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: {
        on() {},
        off() {},
        send() {},
        invoke: async () => undefined,
      },
    })
  })
  await page.goto('/#app/gnss')
  await page.evaluate(async (content) => {
    const { useDevice } = await import('/src/hooks/useDevice.ts')
    const transfer = new DataTransfer()
    transfer.items.add(new File([content], 'timeline.log', { type: 'text/plain' }))
    await useDevice().handleDrop(new DragEvent('drop', { dataTransfer: transfer }))
  }, nmea('GPGGA,123500,4807.038,N,01131.000,E,4,18,0.9,545.4,M,46.9,M,,'))

  const speed = page.locator('.file-timeline .timeline-speed')
  await expect(speed).toBeVisible()
  await expect(page.locator('.file-timeline select')).toHaveCount(0)
  await expect(speed.locator('.el-select__wrapper')).toBeVisible()
  await speed.click()
  await page.getByRole('option', { name: '×2', exact: true }).click()
  await expect(speed).toContainText('×2')
  expect(
    await page.evaluate(async () => {
      const { useDevice } = await import('/src/hooks/useDevice.ts')
      return useDevice().fileReplaySpeed.value
    }),
  ).toBe(2)
})
