import { expect, test } from '@playwright/test'

function nmea(body: string): string {
  const checksum = [...body].reduce((sum, character) => sum ^ character.charCodeAt(0), 0)
  return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`
}

test('Serial application shows routed NMEA fields and icons in Status View', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    localStorage.setItem(
      'nav-tools:data-source-settings',
      JSON.stringify({ activeSource: 'serial', serial: { parser: 'nmea' } }),
    )
  })
  await page.goto('/')
  await page.locator('.application-card[data-application-id="serial"]').click()
  await expect(page.locator('.statusbar')).toBeVisible()

  const sentence = nmea('GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,')
  await page.evaluate(async (data) => {
    const { routeDataToWindow, useDevice } = await import('/src/hooks/useDevice.ts')
    useDevice().globalDevice.value = { type: 'serial', connected: true }
    routeDataToWindow(data, 'raw-messages')
  }, sentence)

  const longitude = page.locator('.status-item').filter({
    has: page.locator('.status-label', { hasText: 'GNSS · Longitude' }),
  })
  const latitude = page.locator('.status-item').filter({
    has: page.locator('.status-label', { hasText: 'GNSS · Latitude' }),
  })
  await expect(longitude.locator('.status-indicator')).toHaveText('11.516667')
  await expect(latitude.locator('.status-indicator')).toHaveText('48.117300')
  await expect(longitude.locator('.status-field-icon svg')).toBeVisible()
  await expect(latitude.locator('.status-field-icon svg')).toBeVisible()
  const fixMode = page
    .locator('.status-item')
    .filter({
      has: page.locator('.status-label[title="GNSS.fixMode"]'),
    })
    .locator('.status-indicator')
  await expect(fixMode).toHaveText('Single Point')
  await expect(fixMode).toHaveCSS('color', 'rgb(255, 0, 0)')
})

for (const theme of ['light', 'dark']) {
  test(`GNSS Status View uses the shared Fix Mode colors in the ${theme} theme`, async ({
    page,
  }) => {
    await page.addInitScript((theme) => {
      localStorage.setItem('nav-tools:locale', 'en-US')
      localStorage.setItem('nav-tools:theme', theme)
    }, theme)
    await page.route('https://*.tile.openstreetmap.org/**', (route) => route.abort())
    await page.goto('/')
    await page.locator('.application-card[data-application-id="gnss"]').click()
    const fixMode = page
      .locator('.status-item')
      .filter({
        has: page.locator('.status-label[title="fixMode"]'),
      })
      .locator('.status-indicator')
    for (const [quality, label, color] of [
      [4, 'Fixed', 'rgb(0, 128, 0)'],
      [5, 'Float', 'rgb(255, 165, 0)'],
      [2, 'DGNSS', 'rgb(0, 0, 255)'],
      [1, 'Single Point', 'rgb(255, 0, 0)'],
      [6, 'PPP', 'rgb(128, 0, 128)'],
      [0, 'Invalid', 'rgb(128, 128, 128)'],
    ] as const) {
      await page.evaluate(
        async (data) => {
          const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
          useNmea().processRawData(data)
        },
        nmea(
          `GNGGA,1235${String(quality).padStart(2, '0')},4807.038,N,01131.000,E,${quality},18,0.9,545.4,M,46.9,M,,`,
        ),
      )
      await expect(fixMode).toHaveText(label)
      await expect(fixMode).toHaveCSS('color', color)
    }
  })
}
