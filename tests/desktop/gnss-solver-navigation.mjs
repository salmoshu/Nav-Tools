import { _electron as electron, expect } from '@playwright/test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import path from 'node:path'

const executablePath = process.argv[2]
if (!executablePath)
  throw new Error('Usage: node tests/desktop/gnss-solver-navigation.mjs <Nav-Tools executable>')

const tempRoot = await realpath(path.resolve('tmp'))
const profile = await mkdtemp(path.join(tempRoot, 'gnss-solver-desktop-'))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.VITE_DEV_SERVER_URL
let app
const errors = []

async function cleanupProfile() {
  const resolvedProfile = await realpath(profile)
  if (
    path.dirname(resolvedProfile).toLowerCase() !== tempRoot.toLowerCase() ||
    !path.basename(resolvedProfile).startsWith('gnss-solver-desktop-')
  )
    throw new Error('Refusing to remove an unexpected test profile')
  await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

try {
  app = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${profile}`],
    env,
    timeout: 60_000,
  })
  const actualProfile = await app.evaluate(({ app: electronApp, BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.hide()
    electronApp.on('browser-window-created', (_event, window) => window.hide())
    return electronApp.getPath('userData')
  })
  if (path.resolve(actualProfile).toLowerCase() !== path.resolve(profile).toLowerCase())
    throw new Error('Test application did not use its isolated profile')
  const page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && /Invalid linked format/.test(message.text()))
      errors.push(message.text())
  })
  await page.waitForURL('**/index.html*', { timeout: 30_000 })
  await page.evaluate(() => {
    localStorage.setItem('nav-tools:locale', 'zh-CN')
    localStorage.setItem(
      'nav-tools:updater-prefs',
      JSON.stringify({ autoCheck: false, autoDownload: false }),
    )
    localStorage.setItem('nav-tools:gnsslib-solver-mode', 'realtime')
    localStorage.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'gnsslib',
          name: 'GNSS-Lib',
          description: 'Desktop smoke test',
          icon: 'satellite',
          accent: '#7c3aed',
          windowIds: ['gnsslib-solver', 'raw-messages', 'gnss-deviation'],
        },
      ]),
    )
    localStorage.setItem('nav-tools:selected-application', 'gnsslib')
    window.location.hash = 'app/gnsslib'
  })
  errors.length = 0
  await page.reload()
  const panel = page.locator('.gnss-solver')
  await expect(panel).toBeVisible({ timeout: 25_000 })
  await expect(panel.locator('.stream-section')).toHaveCount(3)
  await expect(panel.locator('.stream-section').first()).toBeVisible()
  await expect(panel.locator('.stream-section').nth(1)).toContainText(
    'user:password@host:2101/mountpoint',
  )
  const optionsTab = panel.getByRole('tab', { name: '处理选项', exact: true })
  await expect(optionsTab).toBeVisible()
  await optionsTab.dispatchEvent('click')
  await expect(panel.locator('[data-option="mode"]')).toBeVisible()
  await panel.getByRole('tab', { name: '输入', exact: true }).dispatchEvent('click')
  await expect(panel.locator('.stream-section').first()).toBeVisible()
  if (errors.length) throw new Error(`Renderer errors:\n${errors.join('\n')}`)
  const version = await app.evaluate(({ app: electronApp }) => electronApp.getVersion())
  process.stdout.write(`Packaged Nav-Tools ${version}: realtime Inputs and Options are visible.\n`)
} catch (error) {
  if (errors.length) process.stderr.write(`Renderer errors:\n${errors.join('\n')}\n`)
  throw error
} finally {
  if (app) await app.close()
  await cleanupProfile()
}
