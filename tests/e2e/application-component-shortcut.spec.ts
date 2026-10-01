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

  // 徽章按容器宽度动态收纳成两行(ResizeObserver 异步收敛);隐藏徽章仍在 DOM,只数可见的
  const chips = card.locator('.panel-chip:not(.panel-chip--more):visible')
  await expect.poll(() => chips.count()).toBeLessThan(9)
  const visibleCount = await chips.count()
  expect(visibleCount).toBeGreaterThan(0)
  const more = card.locator('.panel-chip--more')
  await expect(more).toHaveText(`+${9 - visibleCount}`)
  const chipsBox = await card.locator('.panel-list').boundingBox()
  // 两行布局:高度超过单行(~26px)、不超过两行上限(~58px)
  expect(chipsBox?.height).toBeGreaterThan(30)
  expect(chipsBox?.height).toBeLessThanOrEqual(60)

  // 悬浮 +N 列出其余组件;弹层内容常驻 DOM,只断言当前可见的那个
  await more.hover()
  const overflowItems = page.locator('.panel-overflow-popper .panel-overflow__item:visible')
  await expect(overflowItems).toHaveCount(9 - visibleCount)
})

test('creates a location-choosing shortcut from the card header button (no standalone window)', async ({
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
  const invokeLog: Array<{ channel: string; payload: unknown }> = []
  await page.exposeFunction('__recordInvoke', (channel: string, payload: unknown) => {
    invokeLog.push({ channel, payload })
  })
  await page.addInitScript(() => {
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: {
        invoke: async (channel: string, payload: unknown) => {
          if (channel === 'create-desktop-shortcut') {
            void window.__recordInvoke(channel, payload)
            return { ok: true }
          }
          if (channel === 'terminal-capabilities') {
            return { platform: 'win32', localShells: [], wslDistros: [], sshAvailable: true }
          }
          if (channel === 'terminal-session-list') return []
          if (channel === 'terminal-ssh-config-list') return []
          return undefined
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

  // 主界面按钮只创建快捷方式,不再打开独立窗口
  await expect
    .poll(() =>
      invokeLog
        .filter((call) => call.channel === 'create-desktop-shortcut')
        .map((c) => c.payload),
    )
    .toHaveLength(1)
  const payload = invokeLog[0].payload as { windowId: string; iconDataUrl: string }
  expect(payload.windowId).toBe('terminal')
  expect(typeof payload.iconDataUrl).toBe('string')
  // 卡片保留在布局中:分离按钮与卡片都还在
  await expect(page.locator('.card-actions .detach-btn').first()).toBeVisible()
  await expect(page.locator('.layout-component').first()).toBeVisible()
})
