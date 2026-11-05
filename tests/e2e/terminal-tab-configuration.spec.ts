import { expect, test, type Page } from '@playwright/test'

const profile = {
  id: 'robot-profile',
  name: 'Robot',
  source: 'nav-tools',
  host: '192.0.2.10',
  port: 22,
  username: 'robot',
  authMethod: 'password',
  privateKeyPath: '',
  proxyJump: '',
  initialDirectory: '/srv/old',
  forwards: [],
}

async function seedSession(page: Page, kind: 'local' | 'wsl' | 'ssh'): Promise<void> {
  const appId = `terminal-config-${kind}`
  const session = {
    id: `${kind}-old-session`,
    kind,
    title: kind === 'ssh' ? 'Robot' : kind === 'wsl' ? 'WSL · Ubuntu-20.04' : 'Git Bash',
    status: 'ready',
    ...(kind === 'ssh' ? { profileId: profile.id } : {}),
  }
  const launch =
    kind === 'ssh'
      ? { kind, sshProfile: profile, label: profile.name }
      : kind === 'wsl'
        ? {
            kind,
            wslDistro: 'Ubuntu-20.04',
            cwd: '/home/old',
            label: 'WSL · Ubuntu-20.04',
          }
        : { kind, localShell: 'git-bash', cwd: 'C:/old', label: 'Git Bash' }
  const application = {
    id: appId,
    name: `Configure ${kind}`,
    description: 'Terminal configuration audit',
    icon: 'terminal',
    accent: '#3b82f6',
    windowIds: ['terminal'],
  }
  await page.addInitScript(
    ({ application, session, launch, profile }) => {
      localStorage.setItem('nav-tools:custom-applications', JSON.stringify([application]))
      localStorage.setItem('nav-tools:selected-application', application.id)
      localStorage.setItem(
        'nav-tools:terminal-layout:v3',
        JSON.stringify({
          version: 3,
          activeTabId: 'config-tab',
          tabs: [
            {
              id: 'config-tab',
              title: 'Terminal',
              focusedPaneId: 'config-pane',
              root: {
                kind: 'pane',
                id: 'config-pane',
                title: 'Terminal',
                sessionId: session.id,
                launch,
              },
            },
          ],
        }),
      )
      Object.defineProperty(window, 'ipcRenderer', {
        configurable: true,
        value: {
          invoke: async (channel: string, payload: unknown) => {
            const w = window as unknown as {
              __ipcInvokeLog?: Array<{ channel: string; payload: unknown }>
            }
            ;(w.__ipcInvokeLog ??= []).push({ channel, payload })
            if (channel === 'terminal-capabilities') {
              return {
                platform: 'win32',
                localShells: [
                  { kind: 'git-bash', label: 'Git Bash', executable: 'bash.exe' },
                  { kind: 'powershell', label: 'PowerShell', executable: 'powershell.exe' },
                ],
                wslDistros: ['Ubuntu-20.04', 'Ubuntu-22.04'],
                sshAvailable: true,
              }
            }
            if (channel === 'terminal-session-list') return [session]
            if (channel === 'terminal-session-attach') return { ...session, scrollback: '' }
            if (channel === 'terminal-ssh-config-list') return []
            if (channel === 'terminal-credential-load') return { password: 'stored-password' }
            if (channel === 'terminal-session-create') {
              const request = payload as {
                kind: 'local' | 'wsl' | 'ssh'
                localShell?: string
                wslDistro?: string
                sshProfile?: { id: string; name: string }
              }
              return {
                id: `${request.kind}-new-session`,
                kind: request.kind,
                title:
                  request.kind === 'ssh'
                    ? request.sshProfile?.name
                    : request.kind === 'wsl'
                      ? `WSL · ${request.wslDistro}`
                      : request.localShell,
                status: 'ready',
                ...(request.kind === 'ssh' ? { profileId: request.sshProfile?.id } : {}),
              }
            }
            return undefined
          },
          on: () => undefined,
          off: () => undefined,
          send: () => undefined,
        },
      })
    },
    { application, session, launch, profile },
  )
  await page.goto(`/#app/${appId}`)
  await expect(page.locator('.xterm-host')).toBeVisible()
}

async function openConfiguration(page: Page) {
  await page.locator('.terminal-tab').click({ button: 'right' })
  const menu = page.locator('.terminal-tab-menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Reconfigure Terminal' }).click()
  const dialog = page.locator('.el-dialog:visible')
  await expect(dialog).toBeVisible()
  return dialog
}

async function invocations(page: Page, channel: string) {
  await expect
    .poll(() =>
      page.evaluate(
        (channel) =>
          (
            window as unknown as {
              __ipcInvokeLog?: Array<{ channel: string; payload: unknown }>
            }
          ).__ipcInvokeLog?.filter((call) => call.channel === channel).length ?? 0,
        channel,
      ),
    )
    .toBeGreaterThan(0)
  return page.evaluate(
    (channel) =>
      (
        window as unknown as {
          __ipcInvokeLog?: Array<{ channel: string; payload: unknown }>
        }
      ).__ipcInvokeLog
        ?.filter((call) => call.channel === channel)
        .map((call) => call.payload) ?? [],
    channel,
  )
}

test('reconfigures a WSL tab with its current distribution and directory', async ({ page }) => {
  await seedSession(page, 'wsl')
  const dialog = await openConfiguration(page)
  await expect(dialog).toContainText('Ubuntu-20.04')
  await expect(dialog.getByPlaceholder('Initial directory (optional)')).toHaveValue('/home/old')

  await dialog.locator('.el-select').click()
  await page
    .locator('.el-select-dropdown:visible')
    .getByText('Ubuntu-22.04', { exact: true })
    .click()
  await dialog.getByPlaceholder('Initial directory (optional)').fill('/home/new')
  await dialog.getByRole('button', { name: 'Reconnect', exact: true }).click()

  const created = await invocations(page, 'terminal-session-create')
  expect(created[0]).toMatchObject({ kind: 'wsl', wslDistro: 'Ubuntu-22.04', cwd: '/home/new' })
  expect(await invocations(page, 'terminal-session-close')).toContain('wsl-old-session')
})

test('reconfigures an SSH tab with the saved profile and credentials', async ({ page }) => {
  await seedSession(page, 'ssh')
  const dialog = await openConfiguration(page)
  await expect(dialog.getByLabel('Host', { exact: true })).toHaveValue('192.0.2.10')
  await dialog.getByText('Advanced Settings', { exact: true }).click()
  await expect(dialog.getByLabel('Remote Initial Directory', { exact: true })).toHaveValue(
    '/srv/old',
  )

  await dialog.getByLabel('Host', { exact: true }).fill('192.0.2.20')
  await dialog.getByLabel('Remote Initial Directory', { exact: true }).fill('/srv/new')
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click()

  const created = await invocations(page, 'terminal-session-create')
  expect(created[0]).toMatchObject({
    kind: 'ssh',
    sshProfile: { host: '192.0.2.20', initialDirectory: '/srv/new' },
    sshSecrets: { password: 'stored-password' },
  })
  expect(await invocations(page, 'terminal-session-close')).toContain('ssh-old-session')
})

test('reconfigures a local shell tab', async ({ page }) => {
  await seedSession(page, 'local')
  const dialog = await openConfiguration(page)
  await expect(dialog).toContainText('Git Bash')
  await expect(dialog.getByPlaceholder('Initial directory (optional)')).toHaveValue('C:/old')

  await dialog.locator('.el-select').click()
  await page.locator('.el-select-dropdown:visible').getByText('PowerShell', { exact: true }).click()
  await dialog.getByPlaceholder('Initial directory (optional)').fill('C:/new')
  await dialog.getByRole('button', { name: 'Reconnect', exact: true }).click()

  const created = await invocations(page, 'terminal-session-create')
  expect(created[0]).toMatchObject({ kind: 'local', localShell: 'powershell', cwd: 'C:/new' })
  expect(await invocations(page, 'terminal-session-close')).toContain('local-old-session')
})
