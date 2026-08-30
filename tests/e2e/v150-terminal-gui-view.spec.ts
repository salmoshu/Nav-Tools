import { expect, test } from '@playwright/test'

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)
const osc133 = (letter: string, params = '') =>
  `${ESC}]133;${letter}${params ? `;${params}` : ''}${BEL}`

function seedTerminalApp(page: import('@playwright/test').Page, options: {
  appId: string
  paneId: string
  session: Record<string, unknown>
  presentation?: 'gui'
  scrollback: string
}) {
  const { appId, paneId, session, presentation, scrollback } = options
  const application = {
    id: appId,
    name: 'Terminal GUI View',
    description: 'GUI presentation toggle audit',
    icon: 'terminal',
    accent: '#3b82f6',
    windowIds: ['terminal'],
  }
  return page.addInitScript(
    ({ application, paneId, session, presentation, scrollback }) => {
      localStorage.setItem('nav-tools:custom-applications', JSON.stringify([application]))
      localStorage.setItem('nav-tools:selected-application', application.id)
      localStorage.setItem(
        'nav-tools:terminal-layout:v3',
        JSON.stringify({
          version: 3,
          activeTabId: 'gui-tab',
          tabs: [
            {
              id: 'gui-tab',
              title: 'Terminal',
              focusedPaneId: paneId,
              root: {
                kind: 'pane',
                id: paneId,
                title: 'Terminal',
                sessionId: session.id,
                presentation,
              },
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
    { application, paneId, session, presentation, scrollback },
  )
}

test('renders command blocks in GUI view and toggles back to the terminal view', async ({
  page,
}) => {
  const scrollback = `${osc133('A')}$ ls -la\r\n${osc133('C', btoa('ls -la'))}file1\r\nfile2\r\n${osc133('D', '0')}${osc133('A')}$ `
  await seedTerminalApp(page, {
    appId: 'terminal-gui-view',
    paneId: 'gui-pane',
    session: { id: 'gui-session', kind: 'local', title: 'Git Bash', status: 'ready' },
    presentation: 'gui',
    scrollback,
  })

  await page.goto('/#app/terminal-gui-view')
  const guiView = page.locator('.terminal-gui-view')
  await expect(guiView).toBeVisible()
  await expect(guiView.locator('.command-block')).toHaveCount(1)
  await expect(guiView.locator('.command-block__command')).toHaveText('ls -la')
  await expect(guiView.locator('.command-block__output')).toContainText('file1')
  await expect(guiView.locator('.command-block__output')).toContainText('file2')
  await expect(page.locator('.xterm-host')).toBeHidden()

  // 切回终端视图:xterm 恢复可见,选择持久化到工作区布局
  await page.locator('.terminal-pane').hover()
  await page.locator('.pane-action--toggle-presentation').click()
  await expect(guiView).toHaveCount(0)
  await expect(page.locator('.xterm-host')).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('nav-tools:terminal-layout:v3') || ''),
    )
    .toContain('"presentation":"terminal"')
})

test('degrades to the terminal view with a hint for sessions without structured events', async ({
  page,
}) => {
  await seedTerminalApp(page, {
    appId: 'terminal-gui-degraded',
    paneId: 'gui-pane',
    session: {
      id: 'gui-ssh-session',
      kind: 'ssh',
      title: 'Robot',
      status: 'ready',
      profileId: 'robot-profile',
    },
    presentation: 'gui',
    scrollback: '',
  })

  await page.goto('/#app/terminal-gui-degraded')
  await expect(page.locator('.gui-degraded')).toBeVisible()
  await expect(page.locator('.xterm-host')).toBeVisible()
  await expect(page.locator('.terminal-gui-view')).toHaveCount(0)

  await page.locator('.gui-degraded__action').click()
  await expect(page.locator('.gui-degraded')).toHaveCount(0)
  await expect(page.locator('.xterm-host')).toBeVisible()
})
