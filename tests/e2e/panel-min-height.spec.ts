import { expect, test } from '@playwright/test'

test('allows a container message card to shrink to two grid rows', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'zh-CN')
    localStorage.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'height-test',
          name: 'Height Test',
          description: '',
          icon: 'camera',
          accent: '#14b8a6',
          windowIds: ['raw-messages'],
        },
      ]),
    )
    localStorage.setItem('nav-tools:selected-application', 'height-test')
    Object.defineProperty(window, 'ipcRenderer', {
      value: { on() {}, off() {}, send() {}, invoke: async () => undefined },
    })
    Object.defineProperty(window, 'electronAPI', {
      value: {
        getAppVersion: async () => '1.8.8',
        getWindowState: async () => ({ maximized: false, alwaysOnTop: false }),
        setUpdaterPrefs() {},
      },
    })
  })
  await page.goto('/#app/height-test')

  const card = page.locator('.box-card').filter({ hasText: '消息' }).first()
  await expect(card).toBeVisible()
  const gridItem = card.locator('..').locator('..')
  const initial = await gridItem.boundingBox()
  expect(initial).not.toBeNull()
  const resizer = gridItem.locator('.vgl-item__resizer')
  const handle = await resizer.boundingBox()
  expect(handle).not.toBeNull()

  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2 - 320, {
    steps: 16,
  })
  await page.mouse.up()

  await expect
    .poll(() => gridItem.evaluate((element) => element.getBoundingClientRect().height))
    .toBeLessThanOrEqual(150)
})

test('migrates a legacy five-row minimum when restoring a saved message layout', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'zh-CN')
    localStorage.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'height-legacy',
          name: 'Height Legacy',
          description: '',
          icon: 'camera',
          accent: '#14b8a6',
          windowIds: ['raw-messages'],
        },
      ]),
    )
    localStorage.setItem('nav-tools:selected-application', 'height-legacy')
    localStorage.setItem(
      'nav-tools:layout:height-legacy',
      JSON.stringify({
        version: 1,
        showStatusBar: true,
        showToolBar: true,
        removedWindowIds: [],
        items: [
          {
            titleName: 'Messages',
            componentName: 'RawMessages',
            windowId: 'raw-messages',
            x: 0,
            y: 0,
            w: 6,
            h: 6,
            i: 'raw-messages-1',
            minW: 4,
            minH: 5,
            maxW: 12,
            maxH: 12,
          },
        ],
      }),
    )
    Object.defineProperty(window, 'ipcRenderer', {
      value: { on() {}, off() {}, send() {}, invoke: async () => undefined },
    })
    Object.defineProperty(window, 'electronAPI', {
      value: {
        getAppVersion: async () => '1.8.8',
        getWindowState: async () => ({ maximized: false, alwaysOnTop: false }),
        setUpdaterPrefs() {},
      },
    })
  })
  await page.goto('/#app/height-legacy')

  const card = page.locator('.box-card').filter({ hasText: '消息' }).first()
  await expect(card).toBeVisible()
  const gridItem = card.locator('..').locator('..')
  const handle = await gridItem.locator('.vgl-item__resizer').boundingBox()
  expect(handle).not.toBeNull()
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2 - 320, {
    steps: 16,
  })
  await page.mouse.up()

  await expect
    .poll(() => gridItem.evaluate((element) => element.getBoundingClientRect().height))
    .toBeLessThanOrEqual(150)
})
