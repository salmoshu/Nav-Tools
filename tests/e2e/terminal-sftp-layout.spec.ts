import { expect, test } from '@playwright/test'

test('places SFTP beside the complete tab and terminal region', async ({ page }) => {
  const application = {
    id: 'terminal-sftp-layout',
    name: 'Terminal SFTP Layout',
    description: 'Terminal and SFTP alignment audit',
    icon: 'terminal',
    accent: '#3b82f6',
    windowIds: ['terminal'],
  }
  const session = {
    id: 'ssh-layout-session',
    kind: 'ssh',
    title: 'Robot',
    status: 'ready',
    profileId: 'robot-profile',
    sshConnectionId: 'robot-connection',
  }
  await page.addInitScript(
    ({ application, session }) => {
      localStorage.setItem('nav-tools:custom-applications', JSON.stringify([application]))
      localStorage.setItem('nav-tools:selected-application', application.id)
      localStorage.setItem(
        'nav-tools:terminal-layout:v3',
        JSON.stringify({
          version: 3,
          activeTabId: 'ssh-layout-tab',
          tabs: [
            {
              id: 'ssh-layout-tab',
              title: 'Robot',
              focusedPaneId: 'ssh-layout-pane',
              root: {
                kind: 'pane',
                id: 'ssh-layout-pane',
                title: 'Robot',
                sessionId: session.id,
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
              return {
                platform: 'win32',
                localShells: [],
                wslDistros: [],
                sshAvailable: true,
              }
            }
            if (channel === 'terminal-session-list') return [session]
            if (channel === 'terminal-session-attach') return { ...session, scrollback: '' }
            if (channel === 'terminal-ssh-config-list' || channel === 'terminal-sftp-list') return []
            return undefined
          },
          on: () => undefined,
          off: () => undefined,
          send: () => undefined,
        },
      })
    },
    { application, session },
  )

  await page.goto('/#app/terminal-sftp-layout')
  await page.locator('.tab-action--sftp').click()
  await expect(page.locator('.sftp-panel')).toBeVisible()

  const geometry = await page.evaluate(() => {
    const sftp = document.querySelector('.sftp-panel')?.getBoundingClientRect()
    const workbench = document.querySelector('.terminal-workbench')?.getBoundingClientRect()
    const main = document.querySelector('.terminal-workbench__main')?.getBoundingClientRect()
    const tabs = document.querySelector('.terminal-tabs')?.getBoundingClientRect()
    const content = document.querySelector('.terminal-tab-content')
    const contentRect = content?.getBoundingClientRect()
    return {
      sftpBesideMain:
        document.querySelector('.sftp-panel')?.parentElement?.classList.contains(
          'terminal-workbench',
        ) &&
        document.querySelector('.terminal-workbench__main')?.parentElement?.classList.contains(
          'terminal-workbench',
        ),
      sftpOutsideTabContent: !content?.contains(document.querySelector('.sftp-panel')),
      sftpTop: sftp?.top,
      sftpBottom: sftp?.bottom,
      sftpRight: sftp?.right,
      workbenchTop: workbench?.top,
      workbenchBottom: workbench?.bottom,
      mainLeft: main?.left,
      tabsLeft: tabs?.left,
      tabsTop: tabs?.top,
      contentLeft: contentRect?.left,
      contentTop: contentRect?.top,
      tabsBottom: tabs?.bottom,
    }
  })

  expect(geometry.sftpBesideMain).toBe(true)
  expect(geometry.sftpOutsideTabContent).toBe(true)
  expect(geometry.sftpTop).toBe(geometry.workbenchTop)
  expect(geometry.sftpBottom).toBe(geometry.workbenchBottom)
  expect(geometry.sftpRight).toBe(geometry.mainLeft)
  expect(geometry.tabsLeft).toBe(geometry.mainLeft)
  expect(geometry.contentLeft).toBe(geometry.mainLeft)
  expect(geometry.tabsTop).toBe(geometry.workbenchTop)
  expect(geometry.contentTop).toBe(geometry.tabsBottom)
})
