import { expect, test } from '@playwright/test'

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)
const osc133 = (letter: string, params = '') =>
  `${ESC}]133;${letter}${params ? `;${params}` : ''}${BEL}`

/** N 个命令块的 scrollback：每 5 个一个失败块，覆盖状态点配色 */
function blocksScrollback(count: number): string {
  let out = ''
  for (let i = 1; i <= count; i++) {
    const exitCode = i % 5 === 0 ? '1' : '0'
    out += `${osc133('A')}$ cmd${i}\r\n${osc133('C', btoa(`cmd${i}`))}out${i}\r\n${osc133('D', exitCode)}`
  }
  return `${out}${osc133('A')}$ `
}

function seedTerminalApp(
  page: import('@playwright/test').Page,
  options: { appId: string; paneId: string; scrollback: string },
) {
  const { appId, paneId, scrollback } = options
  const application = {
    id: appId,
    name: 'Terminal Block Rail',
    description: 'command block rail audit',
    icon: 'terminal',
    accent: '#3b82f6',
    windowIds: ['terminal'],
  }
  const session = { id: 'rail-session', kind: 'local', title: 'Git Bash', status: 'ready' }
  return page.addInitScript(
    ({ application, paneId, session, scrollback }) => {
      localStorage.setItem('nav-tools:custom-applications', JSON.stringify([application]))
      localStorage.setItem('nav-tools:selected-application', application.id)
      localStorage.setItem(
        'nav-tools:terminal-layout:v3',
        JSON.stringify({
          version: 3,
          activeTabId: 'rail-tab',
          tabs: [
            {
              id: 'rail-tab',
              title: 'Terminal',
              focusedPaneId: paneId,
              root: { kind: 'pane', id: paneId, title: 'Terminal', sessionId: session.id, presentation: 'gui' },
            },
          ],
        }),
      )
      Object.defineProperty(window, 'ipcRenderer', {
        configurable: true,
        value: {
          invoke: async (channel: string) => {
            if (channel === 'terminal-capabilities') {
              return { platform: 'win32', localShells: [], wslDistros: [], sshAvailable: true }
            }
            if (channel === 'terminal-session-list') return [session]
            if (channel === 'terminal-session-attach') return { ...session, scrollback }
            if (channel === 'terminal-ssh-config-list') return []
            return undefined
          },
          on: () => undefined,
          off: () => undefined,
          send: () => undefined,
        },
      })
    },
    { application, paneId, session, scrollback },
  )
}

test('块预览导航条：逐块一条、点击跳转并高亮、条目多时自身可滚动', async ({ page }) => {
  await seedTerminalApp(page, {
    appId: 'terminal-block-rail',
    paneId: 'rail-pane',
    scrollback: blocksScrollback(30),
  })

  await page.goto('/#app/terminal-block-rail')
  const rail = page.locator('.block-rail')
  await expect(rail).toBeVisible()
  await expect(rail.locator('.block-rail__entry')).toHaveCount(30)
  await expect(rail.locator('.block-rail__entry.is-error')).toHaveCount(6)
  await expect(rail.locator('.block-rail__entry').nth(1)).toContainText('cmd2')

  // 条目超出可视高度：预览条自身可滚动，且初始吸底（最新块条目可见）
  const metrics = await rail.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }))
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight)
  await expect(rail.locator('.block-rail__entry').last()).toBeInViewport()

  // 点击第 2 条：对应块滚动进主视图并带导航高亮
  await rail.locator('.block-rail__entry').nth(1).click()
  const target = page.locator('.command-block.is-nav-target')
  await expect(target).toHaveCount(1)
  await expect(target.locator('.command-block__command')).toHaveText('cmd2')
  await expect(target).toBeInViewport()
  // 预览条选中态同步
  await expect(rail.locator('.block-rail__entry.is-nav')).toHaveCount(1)
})
