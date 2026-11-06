import { _electron as electron, expect } from '@playwright/test'
import net from 'node:net'
import path from 'node:path'

const sockets = new Set()
const timers = new Set()
const received = []
const requests = []
const tableRequests = []
let returnedGga = ''
const corrections = Buffer.from([0xd3, 0, 3, 0x42, 0xff, 0x80, 0, 13, 10])
const body = 'GNGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,'
const checksum = [...body]
  .reduce((sum, char) => sum ^ char.charCodeAt(0), 0)
  .toString(16)
  .toUpperCase()
  .padStart(2, '0')
const gga = `$${body}*${checksum}\r\n`
async function listen(handler) {
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.setNoDelay(true)
    handler(socket)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return server
}
const rover = await listen((socket) => {
  socket.on('data', (data) => received.push(data))
  const timer = setInterval(() => {
    if (!socket.destroyed) socket.write(gga)
  }, 200)
  timers.add(timer)
  socket.once('close', () => {
    clearInterval(timer)
    timers.delete(timer)
  })
})
const caster = await listen((socket) => {
  let request = ''
  let streaming = false
  socket.on('data', (data) => {
    if (streaming) {
      returnedGga += data.toString('ascii')
      return
    }
    request += data.toString('ascii')
    if (!request.includes('\r\n\r\n')) return
    if (request.startsWith('GET / HTTP/')) {
      tableRequests.push(request)
      socket.end(
        'SOURCETABLE 200 OK\r\nContent-Type: gnss/sourcetable\r\n\r\nSTR;RTCM3;Smoke station;RTCM 3.3;;2;GPS+GAL;\r\nENDSOURCETABLE\r\n',
      )
      return
    }
    streaming = true
    requests.push(request)
    socket.write(Buffer.concat([Buffer.from('ICY 200 OK\r\n'), corrections]))
    const timer = setInterval(() => {
      if (!socket.destroyed) socket.write(corrections)
    }, 200)
    timers.add(timer)
    socket.once('close', () => {
      clearInterval(timer)
      timers.delete(timer)
    })
  })
})

const executablePath = process.argv[2]
const launchEnv = { ...process.env }
delete launchEnv.ELECTRON_RUN_AS_NODE
delete launchEnv.VITE_DEV_SERVER_URL
const args = [`--user-data-dir=${path.resolve('tmp', `injection-smoke-${Date.now()}`)}`]
if (!executablePath) args.unshift('.')
let app
let page
const pageErrors = []
try {
  app = await electron.launch({ executablePath, args, env: launchEnv, timeout: 60000 })
  page = await app.firstWindow()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.evaluate(
    ({ roverPort, casterPort }) => {
      localStorage.setItem('nav-tools:locale', 'en-US')
      localStorage.setItem(
        'nav-tools:updater-prefs',
        JSON.stringify({ autoCheck: false, autoDownload: false }),
      )
      localStorage.setItem(
        'nav-tools:data-injection-settings',
        JSON.stringify({
          source: 'network',
          autoReconnect: true,
          network: {
            protocol: 'ntrip',
            host: '127.0.0.1',
            port: casterPort,
            mountpoint: 'RTCM3',
            username: '',
            password: '',
            sendGga: true,
            ggaInterval: 1,
          },
        }),
      )
    },
    { roverPort: rover.address().port, casterPort: caster.address().port },
  )
  await page.reload()
  await page.locator('.application-card[data-application-id="serial"]').click()
  const card = page.locator('.box-card').first()
  await card.locator('.card-header').dblclick({ position: { x: 65, y: 20 } })
  await expect(card).toHaveClass(/collapsed-card/)
  await expect.poll(async () => Math.round((await card.boundingBox()).height)).toBe(42)
  await expect(card.locator('.el-card__body')).toBeHidden()
  await card.locator('.card-header').dblclick({ position: { x: 65, y: 20 } })
  await expect(card.locator('.el-card__body')).toBeVisible()
  await page.getByTitle('Input', { exact: true }).click()
  const dialog = page.locator('.data-input-dialog')
  await dialog.getByRole('tab', { name: /Network/ }).click()
  await dialog.locator('.network-config-card').getByPlaceholder('127.0.0.1').fill('127.0.0.1')
  await dialog
    .locator('.network-config-card')
    .getByPlaceholder(/port/i)
    .fill(String(rover.address().port))
  await dialog.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(page.locator('.toggle-switch')).toHaveClass(/toggle-on/)
  await page.getByTitle('Input', { exact: true }).click()
  await dialog.getByRole('tab', { name: 'Data injection', exact: true }).click()
  const panel = dialog.locator('.data-injection-panel')
  await panel.getByRole('textbox', { name: 'Username', exact: true }).fill('smoke-rover')
  await panel.getByRole('textbox', { name: 'Password', exact: true }).fill('smoke-secret')
  await panel.getByRole('button', { name: 'Get mountpoints', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('available: 1')
  await panel.getByRole('textbox', { name: 'Mountpoint', exact: true }).click()
  await panel.getByRole('option', { name: /RTCM3/ }).click()
  expect(tableRequests).toHaveLength(1)
  expect(tableRequests[0]).toContain(
    `Authorization: Basic ${Buffer.from('smoke-rover:smoke-secret').toString('base64')}`,
  )
  await dialog.getByRole('button', { name: 'Connect and inject', exact: true }).click()
  await expect(panel.locator('.injection-status strong')).toHaveText('Connected')
  await expect.poll(() => Buffer.concat(received).length).toBeGreaterThanOrEqual(corrections.length)
  await expect.poll(() => returnedGga).toContain(gga)
  expect(requests[0]).toContain('GET /RTCM3 HTTP/1.0')
  expect(requests[0]).toContain(
    `Authorization: Basic ${Buffer.from('smoke-rover:smoke-secret').toString('base64')}`,
  )
  let status = await page.evaluate(() => window.ipcRenderer.invoke('data-injection-status'))
  expect(status.state).toBe('connected')
  expect(status.forwardedBytes).toBeGreaterThanOrEqual(corrections.length)
  const transferred = Buffer.concat(received)
  for (let index = 0; index < transferred.length; index++)
    expect(transferred[index]).toBe(corrections[index % corrections.length])
  await page.screenshot({
    path: 'test-results/injection-desktop-connected.png',
    animations: 'disabled',
  })
  await dialog.getByRole('button', { name: 'Stop injection', exact: true }).click()
  await expect(panel.locator('.injection-status strong')).toHaveText('Disconnected')
  const stoppedLength = Buffer.concat(received).length
  await new Promise((resolve) => setTimeout(resolve, 350))
  expect(Buffer.concat(received).length).toBe(stoppedLength)
  await dialog.getByRole('button', { name: 'Connect and inject', exact: true }).click()
  await expect(panel.locator('.injection-status strong')).toHaveText('Connected')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.locator('.toggle-switch').click()
  await expect
    .poll(() =>
      page
        .evaluate(() => window.ipcRenderer.invoke('data-injection-status'))
        .then((value) => value.state),
    )
    .toBe('idle')
  await expect(page.locator('.toggle-switch')).not.toHaveClass(/toggle-on/)
  expect(pageErrors).toEqual([])
  console.log(
    JSON.stringify({
      executablePath: executablePath ?? 'development Electron with production build',
      version: await app.evaluate(({ app }) => app.getVersion()),
      headerHeight: 42,
      ntripAuthenticated: true,
      mountpointRetrieval: true,
      binaryForwarding: true,
      ggaReturned: true,
      stopAndRestart: true,
      stoppedWithPrimary: true,
      rendererErrors: pageErrors,
    }),
  )
} catch (error) {
  if (page)
    await page.screenshot({ path: 'test-results/injection-desktop-failure.png' }).catch(() => {})
  throw error
} finally {
  if (app) await app.close().catch(() => {})
  for (const timer of timers) clearInterval(timer)
  for (const socket of sockets) socket.destroy()
  await Promise.all(
    [rover, caster].map((server) => new Promise((resolve) => server.close(resolve))),
  )
}
