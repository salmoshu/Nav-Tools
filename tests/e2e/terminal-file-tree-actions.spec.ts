import { expect, test } from '@playwright/test'

interface IpcCall {
  channel: string
  payload: unknown
}

test('enters a folder from its context menu and rejects ZIP preview before reading', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'zh-CN')
    localStorage.setItem('nav-tools:theme', 'system')
    const application = {
      id: 'terminal-file-actions',
      name: 'Terminal File Actions',
      description: 'Directory navigation and unsupported preview audit',
      icon: 'terminal',
      accent: '#3b82f6',
      windowIds: ['terminal'],
    }
    localStorage.setItem('nav-tools:custom-applications', JSON.stringify([application]))
    localStorage.setItem('nav-tools:selected-application', application.id)
    localStorage.setItem(
      'nav-tools:terminal-layout:v3',
      JSON.stringify({
        version: 3,
        activeTabId: 'file-actions-tab',
        tabs: [
          {
            id: 'file-actions-tab',
            title: 'Git Bash',
            focusedPaneId: 'file-actions-pane',
            root: {
              kind: 'pane',
              id: 'file-actions-pane',
              title: 'Git Bash',
              sessionId: 'file-actions-session',
              launch: {
                kind: 'local',
                localShell: 'git-bash',
                cwd: '/workspace',
                label: 'Git Bash',
              },
            },
          },
        ],
      }),
    )
    const session = {
      id: 'file-actions-session',
      kind: 'local',
      title: 'Git Bash',
      status: 'ready',
    }
    Object.defineProperty(window, '__fileActionCalls', { value: [] })
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: {
        invoke: async (channel: string, payload?: unknown) => {
          const target = window as unknown as { __fileActionCalls: IpcCall[] }
          target.__fileActionCalls.push({ channel, payload })
          if (channel === 'terminal-capabilities') {
            return {
              platform: 'win32',
              localShells: [{ kind: 'git-bash', label: 'Git Bash', executable: 'bash.exe' }],
              wslDistros: [],
              sshAvailable: false,
            }
          }
          if (channel === 'terminal-session-list') return [session]
          if (channel === 'terminal-session-attach') return { ...session, scrollback: '' }
          if (channel === 'terminal-ssh-config-list') return []
          if (channel === 'terminal-session-list-dir') {
            return {
              resolvedPath: '/workspace',
              truncated: false,
              entries: [
                {
                  name: 'folder',
                  path: '/workspace/folder',
                  directory: true,
                  size: 0,
                  modifiedAt: 0,
                  mode: 0,
                },
                {
                  name: 'archive.zip',
                  path: '/workspace/archive.zip',
                  directory: false,
                  size: 1024,
                  modifiedAt: 0,
                  mode: 0,
                },
              ],
            }
          }
          return undefined
        },
        on: () => undefined,
        off: () => undefined,
        send: () => undefined,
      },
    })
  })

  const calls = () =>
    page.evaluate(() => (window as unknown as { __fileActionCalls: IpcCall[] }).__fileActionCalls)

  await page.goto('/#app/terminal-file-actions')
  if (!(await page.locator('.terminal-file-tree').isVisible())) {
    await page.getByRole('button', { name: '打开文件树面板' }).click()
  }
  const folder = page.locator('[data-file-tree-path="/workspace/folder"]')
  const archive = page.locator('[data-file-tree-path="/workspace/archive.zip"]')
  await expect(folder).toBeVisible()
  await expect(archive).toBeVisible()

  await folder.click({ button: 'right' })
  const enterDirectory = page.locator('.file-tree-context-menu__item--enter-directory')
  await expect(enterDirectory).toHaveText('进入该目录')
  await enterDirectory.click()
  await expect
    .poll(async () => (await calls()).filter((call) => call.channel === 'terminal-session-write'))
    .toEqual([
      {
        channel: 'terminal-session-write',
        payload: {
          sessionId: 'file-actions-session',
          data: "cd '/workspace/folder'\r",
        },
      },
    ])

  await archive.dblclick()
  await expect(page.locator('.el-message')).toHaveCount(1)
  await expect(page.locator('.el-message')).toContainText('该文件类型暂不支持')
  await expect(page.locator('.file-preview-tab')).toHaveCount(0)
  expect((await calls()).filter((call) => call.channel === 'terminal-path-read')).toEqual([])
})
