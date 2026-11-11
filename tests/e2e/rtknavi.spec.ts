import { expect, test } from '@playwright/test'
import { openSolver, solverSnapshot } from './support/gnssSolver'

test('publishes all live epochs to messages and Deviation and waits for final data before unlocking mode selection', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const panel = await openSolver(page, 'realtime')
  await panel.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(panel.locator('.solver-state.running')).toBeVisible()
  await expect(panel.getByRole('radio', { name: 'Post-processing', exact: true })).toBeDisabled()
  await expect(panel.getByRole('progressbar')).toHaveCount(0)
  await page.evaluate(() => {
    Reflect.get(window, '__solverEmitLive')(0, 600)
    Reflect.get(window, '__solverEmitLiveLog')('live engine diagnostic\n')
  })
  await expect.poll(async () => (await solverSnapshot(page)).positions).toBe(600)
  await expect(panel.locator('.summary-value').first()).toHaveText('600')
  await expect(page.locator('.deviation-status-card')).toContainText('Float')
  const messages = page.locator('.flow-console-virtual')
  await expect(messages.locator('.console-input-bar')).toHaveCount(0)
  await messages.locator('.solver-message-channel').click()
  await page.getByRole('option', { name: 'Engine log', exact: true }).click()
  await expect(messages).toContainText('live engine diagnostic')
  await panel.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(panel.locator('.solver-state.stopping')).toBeVisible()
  await expect(panel.getByRole('radio', { name: 'Post-processing', exact: true })).toBeDisabled()
  await page.evaluate(() => {
    Reflect.get(window, '__solverEmitLive')(600, 3)
    Reflect.get(window, '__solverFinishLiveStop')()
  })
  await expect(panel.locator('.solver-state.stopped')).toBeVisible()
  await expect.poll(async () => (await solverSnapshot(page)).epochs).toBe(603)
  await expect(panel.getByRole('radio', { name: 'Post-processing', exact: true })).toBeEnabled()
  await page.evaluate(() => Reflect.get(window, '__solverEmitLive')(1000, 1))
  expect((await solverSnapshot(page)).epochs).toBe(603)
  await page.screenshot({ path: 'test-results/gnss-solver-live.png', fullPage: true })
  await panel.getByRole('button', { name: 'Start', exact: true }).click()
  await expect.poll(async () => (await solverSnapshot(page)).epochs).toBe(0)
  await page.evaluate(() => Reflect.get(window, '__solverEmitLive')(100, 2))
  await expect.poll(async () => (await solverSnapshot(page)).epochs).toBe(2)
  expect((await solverSnapshot(page)).origin).toEqual([0, 0, 4])
  await panel.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.evaluate(() => Reflect.get(window, '__solverFinishLiveStop')())
  await expect(panel.locator('.solver-state.stopped')).toBeVisible()
  expect(errors).toEqual([])
})

test('recovers the live file after reload without duplicating overlapping event batches', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const panel = await openSolver(page, 'realtime')
  await panel.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(panel.locator('.solver-state.running')).toBeVisible()
  await page.evaluate(() => Reflect.get(window, '__solverEmitLive')(0, 600))
  await expect.poll(async () => (await solverSnapshot(page)).epochs).toBe(600)
  const runId = (await solverSnapshot(page)).runId
  await page.addInitScript(() => {
    Reflect.set(window, '__solverOnRead', () => {
      Reflect.deleteProperty(window, '__solverOnRead')
      Reflect.get(window, '__solverEmitLive')(590, 20)
    })
  })
  await page.reload()
  await expect(panel.locator('.solver-state.running')).toBeVisible()
  expect((await solverSnapshot(page)).runId).toBe(runId)
  await expect.poll(async () => (await solverSnapshot(page)).positions).toBe(610)
  await expect(page.locator('.deviation-status-card')).toContainText('Float')
  await expect(panel.getByRole('radio', { name: 'Post-processing', exact: true })).toBeDisabled()
  await page.evaluate(() => Reflect.get(window, '__solverEmitLive')(610, 3))
  await expect.poll(async () => (await solverSnapshot(page)).epochs).toBe(613)
  await panel.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.evaluate(() => Reflect.get(window, '__solverFinishLiveStop')())
  await expect(panel.locator('.solver-state.stopped')).toBeVisible()
  expect(errors).toEqual([])
})

test('keeps a stopped NTRIP solver run available on the toolbar timeline', async ({ page }) => {
  const panel = await openSolver(page, 'realtime')
  await page.evaluate(async () => {
    const path = '/src/composables/useRtkNavi.ts'
    const { useRtkNavi } = await import(/* @vite-ignore */ path)
    const settings = useRtkNavi().settings
    settings.inputs[0].type = 'ntripcli'
    settings.inputs[0].path = 'demo:demo@localhost:2101/test'
  })
  await panel.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(panel.locator('.solver-state.running')).toBeVisible()
  await page.evaluate(() => Reflect.get(window, '__solverEmitLive')(0, 6))
  await panel.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.evaluate(() => Reflect.get(window, '__solverFinishLiveStop')())
  await expect(panel.locator('.solver-state.stopped')).toBeVisible()
  await expect(page.locator('.timeline-epoch')).toHaveText('6 / 6')
  await page.locator('.timeline-slider').focus()
  await page.locator('.timeline-slider').press('Home')
  await expect(page.locator('.timeline-epoch')).toHaveText('1 / 6')
  await expect(page.locator('.flow-console-virtual .timeline-current')).toContainText(
    '2024/07/30 00:00:00.000',
  )
  await expect(panel.locator('.solver-latest')).toContainText('2024/07/30 00:00:00.000')
  expect(await page.evaluate(() => Reflect.get(window, '__solverLiveRequest').inputs[0].type)).toBe(
    'ntripcli',
  )
})
