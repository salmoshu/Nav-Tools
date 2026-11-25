import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { calculateNmeaChecksum } from '../../src/core/data/NmeaStreamParser'

async function openApp(page: Page, id: 'gnss' | 'serial') {
  await page.addInitScript((appId) => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    localStorage.setItem('nav-tools:selected-application', appId)
    Reflect.set(window, 'ipcRenderer', {
      invoke: async () => undefined,
      send() {},
      on() {},
      off() {},
    })
  }, id)
  await page.goto(`/#app/${id}`)
  const console = page.locator('.flow-console-virtual')
  await expect(console).toBeVisible()
  return console
}

async function drop(page: Page, name: string, data: string | number[]) {
  await page.evaluate(
    async ({ name, data }) => {
      const { useDevice } = await import('/src/hooks/useDevice.ts')
      const transfer = new DataTransfer()
      const contents = Array.isArray(data) ? new Uint8Array(data) : data
      transfer.items.add(new File([contents], name, { lastModified: Date.UTC(2005, 3, 2) }))
      await useDevice().handleDrop(new DragEvent('drop', { dataTransfer: transfer }))
    },
    { name, data },
  )
}

async function switchView(console: Locator, view: 'Raw' | 'Packet' | 'Message') {
  await console.locator('.message-view-select').click()
  await console.page().getByRole('option', { name: view, exact: true }).click()
}

test('turns recognized CSV into a table without losing the original text', async ({ page }) => {
  const console = await openApp(page, 'serial')
  const csv = 'time,name,value\n0,"A,B",12.50\n1,"<limit> & notes",13.00\n2,C,14.0\n'
  await drop(page, 'telemetry.csv', csv)
  const modes = console.locator('.message-view-select')
  await expect(modes).toContainText('Raw')
  await expect(
    console.locator('.message-content').filter({ hasText: '"<limit> & notes"' }),
  ).toBeVisible()
  await modes.click()
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
    'Raw',
    'Packet',
    'Message',
  ])
  await page.getByRole('option', { name: 'Packet', exact: true }).click()
  await expect(console.locator('.message-csv-header span')).toHaveText([
    'Received',
    'time',
    'name',
    'value',
  ])
  const row = console.locator('.formatted-message-item').filter({ hasText: 'A,B' }).first()
  await expect(row.locator('.message-csv-cell')).toHaveText(['0', 'A,B', '12.50'])
  await row.click()
  const details = console.getByRole('region', { name: 'Message details' })
  await expect(details.getByText('CSV record', { exact: true })).toBeVisible()
  await expect(details.getByText('12.50', { exact: true })).toBeVisible()
  await switchView(console, 'Message')
  await expect(console.locator('.message-type-entry')).toHaveCount(1)
  await expect(console.locator('.message-selected-meta')).toContainText('3 packets')
  await expect(details.getByRole('cell', { name: '14.0', exact: true })).toBeVisible()
  await switchView(console, 'Raw')
  await expect(details).toHaveCount(0)
  await expect(
    console.locator('.message-content').filter({ hasText: '0,"A,B",12.50' }),
  ).toBeVisible()
})

test('opens named NMEA fields and the GSV satellite table', async ({ page }) => {
  const console = await openApp(page, 'gnss')
  const nmea = (body: string) => `$${body}*${calculateNmeaChecksum(`$${body}`)}\n`
  await drop(
    page,
    'receiver.nmea',
    nmea('GPGSV,1,1,02,03,45,110,47,16,10,040,,1') +
      nmea('GNGGA,123500.00,4807.038,N,01131.000,E,4,18,0.9,545.4,M,46.9,M,,'),
  )
  await switchView(console, 'Packet')
  const details = console.getByRole('region', { name: 'Message details' })
  await console.locator('.formatted-message-item').filter({ hasText: 'GNGGA' }).click()
  await expect(details.getByText('Checksum OK', { exact: true })).toBeVisible()
  await expect(details.getByText('48.11730000° (4807.038 N)', { exact: true })).toBeVisible()
  await expect(details.getByText('RTK Fix (4)', { exact: true })).toBeVisible()
  await console.locator('.formatted-message-item').filter({ hasText: 'GPGSV' }).click()
  await expect(details.getByRole('table', { name: 'Satellite observations' })).toBeVisible()
  await expect(details.getByRole('row').filter({ hasText: '03' })).toContainText('47')
})

test('groups NMEA by type, filters the list, and switches between Table and Tree in Message', async ({
  page,
}) => {
  const console = await openApp(page, 'gnss')
  const nmea = (body: string) => `$${body}*${calculateNmeaChecksum(`$${body}`)}\n`
  await drop(
    page,
    'receiver.nmea',
    nmea('GPGSV,1,1,02,03,45,110,47,16,10,040,,1') +
      nmea('GNGGA,123500.00,4807.038,N,01131.000,E,4,16,0.9,545.4,M,46.9,M,,') +
      nmea('GPGGA,123501.00,4807.038,N,01131.000,E,4,18,0.9,545.4,M,46.9,M,,') +
      nmea('PUBX,03,1,08,U,067,31,42,025'),
  )
  await switchView(console, 'Message')
  const types = console.locator('.message-type-list')
  const details = console.getByRole('region', { name: 'Message details' })
  const gga = types.locator('.message-type-entry').filter({ hasText: 'GGA' })
  await expect(types.getByText('NMEA', { exact: true })).toBeVisible()
  await expect(types.getByText('Standard', { exact: true })).toBeVisible()
  await expect(types.getByText('PUBX', { exact: true })).toBeVisible()
  await gga.click()
  await expect(console.locator('.message-selected-meta')).toContainText('2 packets')
  await expect(
    details.getByRole('table', { name: 'Fields' }).getByRole('row').filter({ hasText: 'UTC time' }),
  ).toContainText('12:35:01.00')

  await console.getByRole('button', { name: 'Follow latest' }).click()
  await page.evaluate(async (line) => {
    const { useConsole } = await import('/src/composables/flow/useConsole.ts')
    useConsole(true).addMessage(line)
  }, nmea('GPGGA,123502.00,4807.038,N,01131.000,E,4,19,0.9,545.4,M,46.9,M,,'))
  await expect(console.locator('.message-selected-meta')).toContainText('3 packets')
  await expect(details.getByText('12:35:01.00', { exact: true })).toBeVisible()
  await console.getByRole('button', { name: 'Follow latest' }).click()
  await expect(details.getByText('12:35:02.00', { exact: true })).toBeVisible()

  const filter = console.getByPlaceholder('Filter messages')
  await filter.fill('NMEA GSV')
  await expect(types.locator('.message-type-entry')).toHaveCount(1)
  await types.locator('.message-type-entry').click()
  await console.getByRole('tab', { name: 'Tree', exact: true }).click()
  await details.getByText('Satellite observations (2)', { exact: true }).click()
  await details.getByText('03', { exact: true }).click()
  await expect(details.locator('.inspection-tree-value').filter({ hasText: /^47$/ })).toBeVisible()
  await filter.fill('no such type')
  await expect(types).toContainText('No matching message types')
})

test('inspects native RTCM3 fields and shows file notices at the bottom right', async ({
  page,
}) => {
  const console = await openApp(page, 'gnss')
  await drop(page, 'receiver.rtcm3', [...readFileSync('tests/fixtures/gnss-spp.rtcm3')])
  const notice = page.locator('.el-message').filter({ hasText: 'SPP solved 3 epochs' })
  await expect(notice).toBeVisible()
  await expect(notice).toHaveCSS('bottom', '50px')
  const bounds = (await notice.boundingBox())!
  expect(page.viewportSize()!.width - (bounds.x + bounds.width)).toBeLessThan(40)
  await switchView(console, 'Packet')
  await console.locator('.formatted-message-item').filter({ hasText: '1005' }).click()
  const details = console.getByRole('region', { name: 'Message details' })
  await expect(details.getByText('Reference station coordinates', { exact: true })).toBeVisible()
  await expect(details.getByText('ECEF X', { exact: true })).toBeVisible()
  await expect(details.getByText('Checksum OK', { exact: true })).toBeVisible()
  await details.getByText('Original record', { exact: true }).click()
  await expect(details.locator('code')).toContainText(/^D3 00 13 3E D0 01/)
  await switchView(console, 'Message')
  const types = console.locator('.message-type-list')
  await expect(types.getByText('RTCM3', { exact: true })).toBeVisible()
  await expect(types.getByText('Station and receiver', { exact: true })).toBeVisible()
  await types.locator('.message-type-entry').filter({ hasText: '1005' }).click()
  await expect(details.getByRole('row').filter({ hasText: 'ECEF X' })).toBeVisible()

  await page.getByTitle('Input', { exact: true }).click()
  await page.getByRole('tab', { name: /File Input/ }).click()
  await expect(page.locator('.data-input-dialog .format-detected:visible')).toHaveText(
    'RTCM3 detected',
  )
})
