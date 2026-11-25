import { expect, test, type Locator } from '@playwright/test'

async function expectIconOnly(button: Locator) {
  await expect(button).toBeVisible()
  await expect(button).toHaveText('')
  await expect(button).toHaveAttribute('title', /\S/)
  await expect(button.locator('svg')).toBeVisible()
}

async function expectIconSpacing(group: Locator, count: number) {
  const buttons = group.locator('.panel-icon-action')
  await expect(buttons).toHaveCount(count)
  await expect(group).toHaveCSS('column-gap', '6px')
  const geometry = await buttons.evaluateAll((items) => {
    const boxes = items.map((item) => item.getBoundingClientRect())
    const centers = items.map((item) => {
      const icon = item.querySelector('svg')!.getBoundingClientRect()
      return icon.left + icon.width / 2
    })
    return {
      widths: boxes.map((box) => Math.round(box.width)),
      heights: boxes.map((box) => Math.round(box.height)),
      gaps: boxes.slice(1).map((box, index) => Math.round(box.left - boxes[index].right)),
      iconSteps: centers.slice(1).map((center, index) => Math.round(center - centers[index])),
    }
  })
  expect(geometry.widths).toEqual(Array(count).fill(28))
  expect(geometry.heights).toEqual(Array(count).fill(28))
  expect(geometry.gaps).toEqual(Array(count - 1).fill(6))
  expect(geometry.iconSteps).toEqual(Array(count - 1).fill(34))
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nav-tools:locale', 'en-US'))
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.abort())
})

test('uses icon-only Filter, Time and Scroll to bottom even in a wide Messages panel', async ({
  page,
}) => {
  const payload = encodeURIComponent(
    JSON.stringify({
      componentName: 'RawMessages',
      windowId: 'raw-messages',
      title: 'Messages',
    }),
  )
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.goto(`/#card/${payload}`)
  const toolbar = page.locator('.console-header')
  for (const name of ['Filter', 'Time', 'Scroll to bottom']) {
    await expectIconOnly(toolbar.getByRole('button', { name, exact: true }))
  }
  await expectIconSpacing(toolbar.locator('.left-controls'), 3)
  await expectIconSpacing(toolbar.locator('.right-controls'), 4)
  const time = toolbar.getByRole('button', { name: 'Time', exact: true })
  await expect(time).toHaveAttribute('aria-pressed', 'true')
  await time.click()
  await expect(time).toHaveAttribute('aria-pressed', 'false')
  await expect(toolbar.locator('.message-view-select')).toContainText('Raw')

  for (const width of [1200, 410]) {
    await page.setViewportSize({ width, height: 800 })
    const left = toolbar.locator('.left-controls')
    await expect(left.getByRole('button', { name: 'HEX', exact: true })).toBeVisible()
    const blocks = await left.locator('button, .el-select__wrapper').evaluateAll((items) =>
      items.map((item) => {
        const { top, height } = item.getBoundingClientRect()
        return { top: Math.round(top), height: Math.round(height) }
      }),
    )
    expect(blocks.map(({ height }) => height)).toEqual([28, 28, 28, 28, 28, 28])
    expect(new Set(blocks.map(({ top }) => top)).size).toBe(1)
  }
})

test('keeps GNSS toolbar actions icon-only without removing view labels', async ({ page }) => {
  await page.goto('/#app/gnss')
  const deviation = page.locator('.deviation-container').first()
  const signals = page.locator('.snr-container')
  if (!(await signals.locator('.view-select').textContent())?.includes('Sat Num')) {
    await signals.locator('.view-select').click()
    await page.getByRole('option', { name: 'Sat Num', exact: true }).click()
  }
  for (const panel of [deviation, signals]) {
    await expectIconOnly(panel.getByRole('button', { name: 'Reset Layout', exact: true }))
    await expectIconOnly(panel.getByRole('button', { name: 'Clear', exact: true }))
  }
  const follow = deviation.getByRole('button', { name: 'Follow latest position', exact: true })
  const status = deviation.getByRole('button', { name: 'Show or hide position status' })
  await expectIconOnly(follow)
  await expectIconOnly(status)
  await expectIconOnly(deviation.getByRole('button', { name: 'Load reference track' }))
  await expect(follow).toHaveAttribute('aria-pressed', 'true')
  await follow.click()
  await expect(follow).toHaveAttribute('aria-pressed', 'false')
  await status.click()
  await expect(status).toHaveAttribute('aria-pressed', 'true')
  await expect(deviation.getByTestId('deviation-status-card')).toBeVisible()
  await expect(signals.locator('.view-select')).toContainText('Sat Num')
  await expect(signals.locator('.view-controls')).toHaveCSS('column-gap', '8px')
})

test('uses compact settings controls on the Serial charts and map actions', async ({ page }) => {
  await page.goto('/#app/serial')
  await expectIconOnly(page.locator('.flow-container .layout-btn'))
  await expectIconOnly(page.locator('.deviation-container .config-btn'))
  await expectIconOnly(page.locator('.deviation-container .tracking-button'))
  await expectIconSpacing(page.locator('.flow-container .right-buttons'), 3)
  await expectIconSpacing(page.locator('.deviation-container .right-buttons'), 2)
  const payload = encodeURIComponent(
    JSON.stringify({
      componentName: 'GnssMap',
      windowId: 'gnss-map',
      title: 'Map',
    }),
  )
  await page.goto(`/?toolbar=map#card/${payload}`)
  const toolbar = page.locator('.gnss-map-container .toolbar')
  await expectIconOnly(toolbar.getByRole('button', { name: 'Follow latest position', exact: true }))
  await expectIconOnly(toolbar.getByRole('button', { name: 'Reset Layout', exact: true }))
  await expectIconOnly(toolbar.getByRole('button', { name: 'Clear', exact: true }))
  await expectIconSpacing(toolbar.locator('.toolbar-right'), 3)
})
