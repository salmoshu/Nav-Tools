import { expect, test } from '@playwright/test'

function nmea(body: string): string {
  const checksum = [...body].reduce((sum, character) => sum ^ character.charCodeAt(0), 0)
  return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`
}

function signalEpoch(second: number, snr: number): string {
  const lines: string[] = []
  for (const talker of ['GP', 'GA', 'GB']) {
    for (let part = 1; part <= 2; part += 1) {
      const fields = Array.from({ length: 4 }, (_, index) => [
        String((part - 1) * 4 + index + 1).padStart(2, '0'),
        '45',
        '120',
        String(snr - index),
      ]).flat()
      lines.push(nmea(`${talker}GSV,2,${part},08,${fields.join(',')}`))
    }
  }
  lines.push(
    nmea(
      `GNGGA,1235${String(second).padStart(2, '0')},4807.038,N,01131.000,E,5,18,0.9,545.4,M,46.9,M,,`,
    ),
  )
  return lines.join('')
}

test('uses readable table typography and a refined satellite-count view', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    localStorage.setItem('nav-tools:theme', 'light')
  })
  const payload = encodeURIComponent(
    JSON.stringify({ componentName: 'GnssSignal', windowId: 'gnss-signal', title: 'Signals' }),
  )
  await page.setViewportSize({ width: 1100, height: 700 })
  await page.goto(`/#card/${payload}`)
  await expect(page.locator('.view-select')).toContainText('Sat Num')
  await expect(page.locator('.satellite-count-chart')).toBeVisible()
  await page.locator('.view-select').click()
  await page.getByRole('option', { name: 'Table View', exact: true }).click()

  for (const [second, snr] of [
    [0, 48],
    [1, 42],
    [2, 55],
  ]) {
    await page.evaluate(
      async (epoch) => {
        const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
        useNmea().processRawData(epoch)
      },
      signalEpoch(second, snr),
    )
  }

  await expect(page.locator('.el-table__row').first()).toBeVisible()
  await expect(page.locator('.el-table__cell').first()).toHaveCSS('font-size', '13px')
  await expect(page.locator('.snr-value').first()).toHaveCSS('font-size', '13px')
  await expect(page.locator('.snr-value').first()).toHaveCSS('font-weight', '600')

  await page.locator('.view-select').click()
  const viewOptions = page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
  await expect(viewOptions.nth(2)).toHaveText('Sat Num')
  await viewOptions.filter({ hasText: 'Sat Num' }).click()
  const chart = page.locator('.satellite-count-chart')
  await expect(chart).toBeVisible()
  await expect(chart.locator('.legend-item')).toHaveCount(4)
  await expect(chart.locator('.legend-item')).toHaveText(['Total', 'GPS', 'BEIDOU', 'GALILEO'])
  await expect(chart.locator('.legend-item--total')).toHaveText('Total')
  await expect(chart.locator('.satellite-count-plot')).toBeVisible()
  await expect(chart.locator('.satellite-count-axis')).toBeVisible()
  await expect
    .poll(() =>
      chart.locator('.satellite-count-plot').evaluate((canvas) => {
        const element = canvas as HTMLCanvasElement
        return element.width > 0 && element.height > 0
      }),
    )
    .toBe(true)
  await expect(page.locator('.el-select-dropdown:visible')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/v186-gnss-nsat.png' })

  await page.evaluate(async (epoch) => {
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    useNmea().clearData()
    useNmea().processRawData(epoch)
  }, nmea('GNGGA,123504,4807.038,N,01131.000,E,5,18,0.9,545.4,M,46.9,M,,'))
  await expect(chart.locator('.legend-item')).toHaveCount(1)
  await expect(chart.locator('.legend-item--total')).toHaveText('GGA · Satellites used')
  await chart.hover({ position: { x: 120, y: 100 } })
  await expect(chart.locator('.satellite-count-tooltip')).toContainText('Satellites used')
  await expect(chart.locator('.satellite-count-tooltip strong')).toHaveText('18')

  await page.evaluate(
    async (epoch) => {
      const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
      useNmea().processRawData(epoch)
    },
    signalEpoch(5, 50),
  )
  await expect(chart.locator('.legend-item')).toHaveCount(4)
  await expect(chart.locator('.legend-item--total')).toHaveText('Total')

  await page.evaluate(async () => {
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    useNmea().clearData()
    useNmea().processRtkLibPosData(
      '% GPST latitude(deg) longitude(deg) height(m) Q ns\n' +
        '2024/04/26 03:21:26.000 39.980744192 116.476662780 63.7868 1 29\n',
    )
  })
  await expect(chart.locator('.legend-item')).toHaveCount(1)
  await expect(chart.locator('.legend-item--total')).toHaveText('RTKLIB POS ns · Satellites used')
  await chart.hover({ position: { x: 120, y: 100 } })
  await expect(chart.locator('.satellite-count-tooltip strong')).toHaveText('29')
})
