import { expect, test, type Page } from '@playwright/test'

const referenceFrame = 'd300133ed00103000000000080000000000000000000a909c3'

async function openRawWorkspace(page: Page, parser: 'nmea' | 'rtklib-pos') {
  await page.addInitScript((parser) => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    localStorage.setItem(
      'nav-tools:data-source-settings',
      JSON.stringify({ version: 1, activeSource: 'file', file: { parser } }),
    )
    localStorage.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'gnssraw-routing',
          name: 'GNSS-Raw',
          description: '',
          icon: 'satellite',
          accent: '#6366f1',
          windowIds: ['gnssraw-frames'],
        },
      ]),
    )
    localStorage.setItem('nav-tools:selected-application', 'gnssraw-routing')
  }, parser)
  await page.goto('/#app/gnssraw-routing')
  await expect(page.locator('.gnssraw-frames')).toBeVisible()
}

async function rawSnapshot(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/composables/useGnssRaw.ts'
    const { useGnssRaw } = await import(/* @vite-ignore */ path)
    const raw = useGnssRaw()
    return { status: raw.status.value, error: raw.errorText.value, stats: raw.dataset.value?.stats }
  })
}

test('decodes RTCM with Open-GNSS in the GNSS-Raw browser worker', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    localStorage.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'gnssraw-wasm-e2e',
          name: 'GNSS-Raw WASM',
          description: '',
          icon: 'satellite',
          accent: '#6366f1',
          windowIds: ['gnssraw-frames'],
        },
      ]),
    )
    localStorage.setItem('nav-tools:selected-application', 'gnssraw-wasm-e2e')
  })
  await page.goto('/#app/gnssraw-wasm-e2e')
  await expect(page.locator('.gnssraw-frames')).toBeVisible()

  // RTCM 1005: reference station 1 at ECEF (0, 0, 0), including its CRC24Q.
  const result = await page.evaluate(async (hex) => {
    const { useGnssRaw } = await import('/src/composables/useGnssRaw.ts')
    const store = useGnssRaw()
    const frame = Uint8Array.from(hex.match(/../g)!, (byte) => Number.parseInt(byte, 16))
    const loaded = await store.loadFromFile(new File([frame, frame], 'open-gnss.rtcm3'))
    return {
      loaded,
      error: store.errorText.value,
      stats: store.dataset.value?.stats,
      stations: store.dataset.value?.staEvents.length,
    }
  }, 'd300133ed00103000000000080000000000000000000a909c3')

  expect(result.loaded, result.error).toBe(true)
  expect(result.stats).toMatchObject({
    framesOk: 2,
    framesCrcErr: 0,
    decodeFail: 0,
    msgOk: { 1005: 2 },
  })
  expect(result.stations).toBeGreaterThan(0)
  await expect(page.locator('.gnssraw-frames tbody')).toContainText('1005')
  expect(pageErrors).toEqual([])
})

for (const parser of ['nmea', 'rtklib-pos'] as const) {
  for (const entry of ['drop', 'picker'] as const) {
    test(`${entry} sends RTCM to the raw decoder when the previous file parser was ${parser}`, async ({
      page,
    }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await openRawWorkspace(page, parser)
      if (entry === 'drop') {
        await page.evaluate(async (hex) => {
          const path = '/src/hooks/useDevice.ts'
          const { useDevice } = await import(/* @vite-ignore */ path)
          const frame = Uint8Array.from(hex.match(/../g)!, (byte) => Number.parseInt(byte, 16))
          const transfer = new DataTransfer()
          transfer.items.add(new File([frame, frame], 'routing.rtcm3'))
          await useDevice().handleDrop(new DragEvent('drop', { dataTransfer: transfer }))
        }, referenceFrame)
      } else {
        await page.getByTitle('Input', { exact: true }).click()
        const dialog = page.locator('.data-input-dialog')
        const chooser = page.waitForEvent('filechooser')
        await dialog.getByRole('button', { name: 'Select File', exact: true }).click()
        await (
          await chooser
        ).setFiles({
          name: 'routing.rtcm3',
          mimeType: 'application/octet-stream',
          buffer: Buffer.from(referenceFrame + referenceFrame, 'hex'),
        })
        await dialog.getByRole('button', { name: 'OK', exact: true }).click()
        await expect(dialog).toBeHidden()
      }
      await expect.poll(async () => (await rawSnapshot(page)).status).toBe('ready')
      expect((await rawSnapshot(page)).stats).toMatchObject({
        framesOk: 2,
        framesCrcErr: 0,
        decodeFail: 0,
        msgOk: { 1005: 2 },
      })
      await expect(page.locator('.gnssraw-frames tbody')).toContainText('1005')
      await expect(page.locator('.el-message--error')).toHaveCount(0)
      expect(errors).toEqual([])
    })
  }
}

const localCapture = process.env.GNSS_RAW_TEST_FILE
test('imports a local RTCM capture through drag and drop with a stale NMEA setting', async ({
  page,
}) => {
  test.skip(
    !localCapture,
    'Set GNSS_RAW_TEST_FILE to verify a local capture without committing its data',
  )
  await openRawWorkspace(page, 'nmea')
  await page.evaluate(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.id = 'local-rtcm-capture'
    input.hidden = true
    document.body.appendChild(input)
  })
  await page.locator('#local-rtcm-capture').setInputFiles(localCapture!)
  await page.evaluate(async () => {
    const path = '/src/hooks/useDevice.ts'
    const { useDevice } = await import(/* @vite-ignore */ path)
    const input = document.getElementById('local-rtcm-capture') as HTMLInputElement
    const transfer = new DataTransfer()
    transfer.items.add(input.files![0])
    input.remove()
    await useDevice().handleDrop(new DragEvent('drop', { dataTransfer: transfer }))
  })
  const result = await rawSnapshot(page)
  expect(result.status, result.error).toBe('ready')
  expect(result.stats!.framesOk).toBeGreaterThan(0)
  expect(result.stats!.epochs).toBeGreaterThan(0)
  console.log(
    `Local RTCM capture: ${result.stats!.framesOk} valid frames, ${result.stats!.epochs} observation epochs`,
  )
  await page.screenshot({ path: 'test-results/gnssraw-local-capture.png', fullPage: true })
})
