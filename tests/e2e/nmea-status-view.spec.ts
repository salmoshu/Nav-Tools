import { expect, test } from '@playwright/test'

function nmea(body: string): string {
  const checksum = [...body].reduce((sum, character) => sum ^ character.charCodeAt(0), 0)
  return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`
}

test('routes NMEA status fields only within the GNSS application', async ({ page }) => {
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
  await expect(page.locator('.status-label[title="GNSS.longitude"]')).toHaveCount(0)

  await page.locator('.application-button').click()
  await page.locator('.application-card[data-application-id="gnss"]').click()
  await expect(page.locator('.context-app-name')).toHaveText('GNSS')
  await page.screenshot({ path: 'test-results/v186-nmea-status.png' })
  const longitude = page.locator('.status-item').filter({
    has: page.locator('.status-label[title="longitude"]'),
  })
  const latitude = page.locator('.status-item').filter({
    has: page.locator('.status-label[title="latitude"]'),
  })
  await expect(longitude.locator('.status-indicator')).toHaveText('11.516667')
  await expect(latitude.locator('.status-indicator')).toHaveText('48.117300')
  await expect(longitude.locator('.status-field-icon svg')).toBeVisible()
  await expect(latitude.locator('.status-field-icon svg')).toBeVisible()
  await expect(longitude.locator('.status-field-icon')).toHaveCSS('color', 'rgb(23, 131, 255)')
  await expect(latitude.locator('.status-field-icon')).toHaveCSS('color', 'rgb(23, 131, 255)')
  const fixMode = page
    .locator('.status-item')
    .filter({
      has: page.locator('.status-label[title="fixMode"]'),
    })
    .locator('.status-indicator')
  await expect(fixMode).toHaveText('Single Point')
  await expect(fixMode).toHaveCSS('color', 'rgb(255, 0, 0)')
})

for (const theme of ['light', 'dark']) {
  test(`GNSS Status View keeps Quality empty without data in the ${theme} theme`, async ({
    page,
  }) => {
    await page.addInitScript((theme) => {
      localStorage.setItem('nav-tools:locale', 'en-US')
      localStorage.setItem('nav-tools:theme', theme)
    }, theme)
    await page.route('https://*.tile.openstreetmap.org/**', (route) => route.abort())
    await page.goto('/')
    await page.locator('.application-card[data-application-id="gnss"]').click()

    const quality = page.locator('.status-item').filter({
      has: page.locator('.status-label[title="quality"]'),
    })
    const fixMode = page.locator('.status-item').filter({
      has: page.locator('.status-label[title="fixMode"]'),
    })
    const expectEmptyQuality = async () => {
      await expect(quality.locator('.status-indicator')).toHaveText('—')
      await expect(quality).toHaveClass(/status-no-data/)
      await expect(quality.locator('.status-state-dot')).toHaveCSS(
        'background-color',
        await fixMode
          .locator('.status-state-dot')
          .evaluate((dot) => getComputedStyle(dot).backgroundColor),
      )
      await expect(page.locator('.status-item.status-has-data')).toHaveCount(0)
      await expect(page.locator('.statusbar-heading-copy small')).toHaveText('Waiting for data')
      await expect(page.locator('.statusbar-heading-copy small')).not.toHaveClass(/active/)
    }
    await expectEmptyQuality()

    for (const value of [4, 0]) {
      await page.evaluate(
        async (data) => {
          const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
          useNmea().processRawData(data)
        },
        nmea(`GPGGA,123519,4807.038,N,01131.000,E,${value},08,0.9,545.4,M,46.9,M,,`),
      )
      await expect(quality.locator('.status-indicator')).toHaveText(String(value))
      await expect(quality).toHaveClass(/status-has-data/)
      const activeCount = await page.locator('.status-item.status-has-data').count()
      await expect(page.locator('.statusbar-heading-copy small')).toHaveText(
        `${activeCount} live metrics`,
      )
      await expect(page.locator('.statusbar-heading-copy small')).toHaveClass(/active/)
    }

    await page.evaluate(async () => {
      const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
      useNmea().clearData()
    })
    await expectEmptyQuality()
  })

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
      await expect(
        page
          .locator('.status-item')
          .filter({ has: page.locator('.status-label[title="fixMode"]') })
          .locator('.status-field-icon'),
      ).toHaveCSS('color', color)
      await expect(
        page
          .locator('.status-item')
          .filter({ has: page.locator('.status-label[title="longitude"]') })
          .locator('.status-field-icon'),
      ).toHaveCSS('color', theme === 'light' ? 'rgb(23, 131, 255)' : 'rgb(26, 136, 255)')
      const row = page
        .locator('.status-item')
        .filter({ has: page.locator('.status-label[title="longitude"]') })
        .locator('.status-value-row')
      const icon = (await row.locator('.status-field-icon').boundingBox())!
      const value = (await row.locator('.status-indicator').boundingBox())!
      expect(Math.abs(icon.y + icon.height / 2 - value.y - value.height / 2)).toBeLessThan(1)
    }
  })
}
