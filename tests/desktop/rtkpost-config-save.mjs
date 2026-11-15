import { _electron as electron, expect } from '@playwright/test'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Run against the locally built Electron entry, with a separate profile and files.
const root = process.cwd()
const temporaryRoot = await realpath(path.resolve('tmp'))
const workspace = await mkdtemp(path.join(temporaryRoot, 'rtkpost-config-save-'))
const profile = path.join(workspace, 'profile')
const source = path.join(workspace, 'source.conf')
const destination = path.join(workspace, 'destination.conf')
const original = '# original\npos2-arthres=6\nfile-dcbfile=/data/custom.dcb\n'
await writeFile(source, original)
await writeFile(destination, 'existing file\n')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.VITE_DEV_SERVER_URL
let app

try {
  app = await electron.launch({
    executablePath: path.resolve('node_modules/electron/dist/electron.exe'),
    args: [root, `--user-data-dir=${profile}`],
    env,
    timeout: 60_000,
  })
  const actualProfile = await app.evaluate(({ app: electronApp, BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.hide()
    electronApp.on('browser-window-created', (_event, window) => window.hide())
    return electronApp.getPath('userData')
  })
  if (path.resolve(actualProfile).toLowerCase() !== path.resolve(profile).toLowerCase())
    throw new Error('Desktop test did not use its isolated profile')
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message))
  await page.waitForURL('**/index.html*', { timeout: 30_000 })
  await page.evaluate(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    localStorage.setItem(
      'nav-tools:updater-prefs',
      JSON.stringify({ autoCheck: false, autoDownload: false }),
    )
    localStorage.setItem('nav-tools:gnsslib-solver-mode', 'post')
    localStorage.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'gnsslib',
          name: 'GNSS-Lib',
          description: 'Desktop test',
          icon: 'satellite',
          accent: '#7c3aed',
          windowIds: ['gnsslib-solver', 'raw-messages', 'gnss-deviation'],
        },
      ]),
    )
    localStorage.setItem('nav-tools:selected-application', 'gnsslib')
    window.location.hash = 'app/gnsslib'
  })
  await page.reload()
  await app.evaluate(({ dialog }, selectedPath) => {
    globalThis.__testConfigOverwrite = 0
    globalThis.__testConfigConfirmationCount = 0
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: selectedPath })
    dialog.showMessageBox = async () => {
      globalThis.__testConfigConfirmationCount++
      return { response: globalThis.__testConfigOverwrite, checkboxChecked: false }
    }
  }, destination)

  const panel = page.locator('.gnss-solver')
  await expect(panel).toBeVisible({ timeout: 25_000 })
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  const config = panel.locator('.config-file-panel input')
  await config.fill(source)
  await config.press('Enter')
  await expect(panel.locator('.config-status')).toContainText('Loaded 1 parameters')
  await expect(panel.locator('.options-modified')).toHaveText('0 modified')
  await panel.locator('.options-search input').fill('pos2-arthres')
  const ratio = panel.locator('[data-option="ratioThreshold"] input')
  await expect(ratio).toHaveValue('6.00')
  await ratio.fill('3')
  await ratio.press('Tab')
  await expect(panel.locator('[data-option="ratioThreshold"] .option-modified-dot')).toHaveCount(1)
  await panel.getByRole('button', { name: 'Confirm', exact: true }).click()
  if ((await readFile(source, 'utf8')) !== original)
    throw new Error('Confirm changed the source file')

  await ratio.fill('4.2')
  await ratio.press('Tab')
  const save = panel.getByRole('button', { name: 'Save config file', exact: true })
  await save.click()
  await expect.poll(() => app.evaluate(() => globalThis.__testConfigConfirmationCount)).toBe(1)
  await expect(save).toBeEnabled()
  if ((await readFile(destination, 'utf8')) !== 'existing file\n')
    throw new Error('Cancellation changed the target')
  await app.evaluate(() => {
    globalThis.__testConfigOverwrite = 1
  })
  await save.click()
  await expect.poll(() => app.evaluate(() => globalThis.__testConfigConfirmationCount)).toBe(2)
  await expect.poll(async () => await readFile(destination, 'utf8')).toContain('pos2-arthres=4.2')
  const saved = await readFile(destination, 'utf8')
  if (!saved.includes('file-dcbfile=/data/custom.dcb'))
    throw new Error('Unmanaged options were lost')
  if ((await readFile(source, 'utf8')) !== original)
    throw new Error('Saving to a new path changed the source')
  await expect(config).toHaveValue(destination)
  await expect(panel.locator('.options-modified')).toHaveText('0 modified')
  if (errors.length) throw new Error(`Renderer errors:\n${errors.join('\n')}`)
  process.stdout.write(
    'Desktop config test passed: cache-only confirmation, cancel and approved overwrite.\n',
  )
} finally {
  if (app) await app.close()
  const resolved = await realpath(workspace)
  if (
    path.dirname(resolved).toLowerCase() !== temporaryRoot.toLowerCase() ||
    !path.basename(resolved).startsWith('rtkpost-config-save-')
  )
    throw new Error('Refusing to remove an unexpected test workspace')
  await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
