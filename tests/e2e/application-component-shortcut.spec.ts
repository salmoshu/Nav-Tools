import { expect, test } from '@playwright/test'

test('caps component chips on the application card and lists the rest in the overflow popover', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'overflow-app',
          name: 'Overflow App',
          description: 'chips overflow audit',
          icon: 'terminal',
          accent: '#3b82f6',
          windowIds: [
            'plot',
            'raw-messages',
            'terminal',
            'camera-video',
            'camera-parameters',
            'flow-deviation',
            'gnss-map',
            'gnss-deviation',
            'gnss-signals',
          ],
        },
      ]),
    )
    localStorage.setItem('nav-tools:selected-application', 'overflow-app')
  })

  await page.goto('/')
  // 未知/新建应用进入时选择器自动打开,直接断言目标卡片(列表还含默认应用)
  const card = page.locator('.application-card[data-application-id="overflow-app"]')
  await expect(card).toBeVisible()

  // 卡片上最多直接展示 6 个组件徽章,其余收进 +N 弹层,不再撑破卡片
  await expect(card.locator('.panel-chip:not(.panel-chip--more)')).toHaveCount(6)
  const more = card.locator('.panel-chip--more')
  await expect(more).toHaveText('+3')

  // 悬浮 +N 列出其余组件,每项仍是独立窗口快捷方式
  await more.hover()
  const overflowItems = page.locator('.panel-overflow-popper .panel-overflow__item')
  await expect(overflowItems).toHaveCount(3)
  await expect(overflowItems.first()).toContainText('GNSS')
})

test('opens a component standalone window from the card header shortcut button', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'shortcut-app',
          name: 'Shortcut App',
          description: 'card shortcut audit',
          icon: 'terminal',
          accent: '#3b82f6',
          windowIds: ['terminal'],
        },
      ]),
    )
    localStorage.setItem('nav-tools:selected-application', 'shortcut-app')
  })
  const invokeLog: Array<{ channel: string; payload: string }> = []
  await page.exposeFunction('__recordInvoke', (channel: string, payload: string) => {
    invokeLog.push({ channel, payload })
  })
  await page.addInitScript(() => {
    const originalInvoke = window.ipcRenderer?.invoke?.bind(window.ipcRenderer)
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: {
        invoke: async (channel: string, payload: unknown) => {
          if (channel === 'open-card-window') {
            void window.__recordInvoke(channel, String(payload))
            return 12345
          }
          return originalInvoke ? originalInvoke(channel, payload) : undefined
        },
        on: () => undefined,
        off: () => undefined,
        send: () => undefined,
      },
    })
  })

  await page.goto('/')
  // 进入时选择器自动打开挡住工作台,先关闭再操作卡片
  const backdrop = page.locator('.selector-backdrop')
  if (await backdrop.isVisible().catch(() => false)) {
    await backdrop.locator('.selector-header .header-actions .el-button.is-circle').click()
  }
  await expect(backdrop).toHaveCount(0)
  const shortcut = page.locator('.card-actions .shortcut-btn').first()
  await expect(shortcut).toBeVisible()
  await shortcut.click()

  await expect
    .poll(() => invokeLog.filter((call) => call.channel === 'open-card-window').map((c) => c.payload))
    .toHaveLength(1)
  const payload = JSON.parse(invokeLog[0].payload)
  expect(payload.componentName).toBe('Terminal')
  expect(payload.windowId).toBe('terminal')
  // 卡片仍保留在布局中:分离按钮与卡片都还在
  await expect(page.locator('.card-actions .detach-btn').first()).toBeVisible()
  await expect(page.locator('.layout-component').first()).toBeVisible()
})
