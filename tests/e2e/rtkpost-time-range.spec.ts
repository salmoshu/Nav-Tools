import { expect, test } from '@playwright/test'
import { openSolver } from './support/gnssSolver'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.set(
      window,
      '__solverReadObservationSpans',
      async (request: { roverPath: string; basePath?: string }) => {
        const at = (minute: number) => Date.UTC(2024, 6, 30, 0, minute)
        if (request.roverPath.includes('stale')) {
          await new Promise((resolve) => setTimeout(resolve, 700))
          return { rover: { start: at(20), end: at(30) }, base: null }
        }
        if (request.roverPath.includes('fresh'))
          return { rover: { start: at(40), end: at(50) }, base: null }
        return {
          rover: { start: at(0), end: at(10) },
          base: request.basePath
            ? request.basePath.includes('outside')
              ? { start: at(11), end: at(12) }
              : { start: at(2), end: at(8) }
            : null,
        }
      },
    )
  })
})

test('shows the rover/base overlap and sends the selected interval to the solver', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const panel = await openSolver(page)
  const timeline = panel.locator('.observation-time-section')
  await expect(timeline).toContainText('Rover and base overlap')
  await expect(timeline.locator('.observation-time-selected')).toContainText('2024-07-30 00:02:00')
  await expect(timeline.locator('.observation-time-selected')).toContainText('2024-07-30 00:08:00')
  await timeline.scrollIntoViewIfNeeded()
  await panel.screenshot({ path: 'test-results/rtkpost-observation-timeline.png' })
  const handles = timeline.getByRole('slider')
  await expect(handles).toHaveCount(2)
  await handles.nth(0).focus()
  await page.keyboard.press('ArrowRight')
  await handles.nth(1).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(timeline.locator('.observation-time-selected')).toContainText('00:02:00.001')
  await expect(timeline.locator('.observation-time-selected')).toContainText('00:07:59.999')
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  await expect(panel.locator('.options-section .time-grid')).toHaveCount(0)
  await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
  await panel.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__solverPostCalls'))).toBe(1)
  const options = await page.evaluate(() => Reflect.get(window, '__solverPostRequest').options)
  expect(options.startTime).toBe('2024-07-30T00:02:00.001')
  expect(options.endTime).toBe('2024-07-30T00:07:59.999')
})

test('uses the full overlap by default and blocks a non-overlapping base', async ({ page }) => {
  const panel = await openSolver(page)
  const timeline = panel.locator('.observation-time-section')
  await expect(timeline).toContainText('Rover and base overlap')
  const base = panel
    .locator('.file-row')
    .filter({ hasText: 'RINEX OBS: Base station' })
    .locator('input')
  await base.fill('/data/outside.obs')
  await expect(timeline.getByRole('alert')).toContainText('no usable time overlap')
  await expect(panel.getByRole('button', { name: 'Execute', exact: true })).toBeDisabled()
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  await panel.locator('[data-option="mode"] .el-select').click()
  await page.getByRole('option', { name: 'Single', exact: true }).click()
  await panel.getByRole('button', { name: 'Confirm', exact: true }).click()
  await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
  await expect(timeline).toContainText('Rover observation span')
  await panel.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__solverPostCalls'))).toBe(1)
  const options = await page.evaluate(() => Reflect.get(window, '__solverPostRequest').options)
  expect(options.startTime).toBe('2024-07-30T00:00:00')
  expect(options.endTime).toBe('2024-07-30T00:10:00')
})

test('uses the full common observation span when no manual times are set', async ({ page }) => {
  const panel = await openSolver(page)
  await expect(panel.locator('.observation-time-section')).toContainText('Rover and base overlap')
  await panel.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__solverPostCalls'))).toBe(1)
  const options = await page.evaluate(() => Reflect.get(window, '__solverPostRequest').options)
  expect(options.startTime).toBe('2024-07-30T00:02:00')
  expect(options.endTime).toBe('2024-07-30T00:08:00')
})

test('applies imported time bounds to the timeline only after confirmation', async ({ page }) => {
  const panel = await openSolver(page)
  const timeline = panel.locator('.observation-time-section')
  await expect(timeline).toContainText('Rover and base overlap')
  await page.evaluate(() =>
    Reflect.set(
      window.electronAPI,
      'rtkPostReadConfig',
      async () => 'pos1-posmode=single\npos1-ts=2024/07/30 00:03:00\npos1-te=2024/07/30 00:07:00\n',
    ),
  )
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  const config = panel.locator('.config-file-panel input')
  await config.fill('/data/time.conf')
  await config.press('Enter')
  await expect(panel.locator('.config-status')).toContainText('Loaded 3 parameters')
  await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
  await expect(timeline.locator('.observation-time-selected')).toContainText('00:02:00')
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  await panel.getByRole('button', { name: 'Confirm', exact: true }).click()
  await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
  await expect(timeline).toContainText('Rover observation span')
  await expect(timeline.locator('.observation-time-selected')).toContainText('00:03:00')
  await expect(timeline.locator('.observation-time-selected')).toContainText('00:07:00')
})

test('both time-range handles can be dragged and the interval can be reset', async ({ page }) => {
  const panel = await openSolver(page)
  const timeline = panel.locator('.observation-time-section')
  await expect(timeline).toContainText('Rover and base overlap')
  await timeline.scrollIntoViewIfNeeded()
  const runway = await timeline.locator('.el-slider__runway').boundingBox()
  const handles = timeline.getByRole('slider')
  const left = await handles.nth(0).boundingBox()
  const right = await handles.nth(1).boundingBox()
  expect(runway && left && right).toBeTruthy()
  await page.mouse.move(left!.x + left!.width / 2, left!.y + left!.height / 2)
  await page.mouse.down()
  await page.mouse.move(runway!.x + runway!.width * 0.2, left!.y + left!.height / 2, { steps: 8 })
  await page.mouse.up()
  await page.mouse.move(right!.x + right!.width / 2, right!.y + right!.height / 2)
  await page.mouse.down()
  await page.mouse.move(runway!.x + runway!.width * 0.8, right!.y + right!.height / 2, { steps: 8 })
  await page.mouse.up()
  const selected = await page.evaluate(async () => {
    const path = '/src/composables/useRtkPost.ts'
    const { useRtkPost } = await import(/* @vite-ignore */ path)
    return { ...useRtkPost().settings.options }
  })
  expect(selected.startTime > '2024-07-30T00:02:00').toBe(true)
  expect(selected.endTime < '2024-07-30T00:08:00').toBe(true)
  expect(selected.endTime > selected.startTime).toBe(true)
  await timeline.getByRole('button', { name: 'Full span' }).click()
  await expect(timeline.locator('.observation-time-selected')).toContainText('00:02:00')
  await expect(timeline.locator('.observation-time-selected')).toContainText('00:08:00')
})

test('ignores a late observation read after the rover is changed', async ({ page }) => {
  const panel = await openSolver(page)
  await expect(panel.locator('.observation-time-section')).toContainText('Rover and base overlap')
  await panel.getByRole('tab', { name: 'Options', exact: true }).click()
  await panel.locator('[data-option="mode"] .el-select').click()
  await page.getByRole('option', { name: 'Single', exact: true }).click()
  await panel.getByRole('button', { name: 'Confirm', exact: true }).click()
  await panel.getByRole('tab', { name: 'Inputs', exact: true }).click()
  await panel
    .locator('.file-row')
    .filter({ hasText: 'RINEX OBS: Rover' })
    .locator('input')
    .fill('/data/stale.obs')
  await page.waitForTimeout(350)
  await panel
    .locator('.file-row')
    .filter({ hasText: 'RINEX OBS: Rover' })
    .locator('input')
    .fill('/data/fresh.obs')
  await expect(panel.locator('.observation-time-selected')).toContainText('00:40:00')
  await page.waitForTimeout(800)
  await expect(panel.locator('.observation-time-selected')).toContainText('00:40:00')
  await expect(panel.locator('.observation-time-selected')).not.toContainText('00:20:00')
})

test('refreshes files at the same path without discarding a valid selection', async ({ page }) => {
  const panel = await openSolver(page)
  const timeline = panel.locator('.observation-time-section')
  await expect(timeline).toContainText('Rover and base overlap')
  await timeline.getByRole('slider').first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(timeline.locator('.observation-time-selected')).toContainText('00:02:00.001')
  await page.evaluate(() => {
    Reflect.set(window, '__solverReadObservationSpans', async () => ({
      rover: { start: Date.UTC(2024, 6, 30, 0, 0), end: Date.UTC(2024, 6, 30, 0, 10) },
      base: { start: Date.UTC(2024, 6, 30, 0, 2), end: Date.UTC(2024, 6, 30, 0, 9) },
    }))
  })
  await timeline.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(timeline.locator('.observation-time-limits')).toHaveCount(0)
  await expect(timeline.locator('.observation-time-selected')).toContainText('00:02:00.001')
  await expect(timeline.locator('.observation-time-selected')).toContainText('00:08:00')
})

test('provides the observation time range for StarRTK and uses the RNX2RTKP label', async ({
  page,
}) => {
  const panel = await openSolver(page)
  const engineRow = panel.locator('.file-row').filter({ hasText: 'Processing engine' })
  await engineRow.locator('.el-select').click()
  await expect(page.getByRole('option', { name: 'RNX2RTKP', exact: true })).toBeVisible()
  await page.getByRole('option', { name: 'StarRTK', exact: true }).click()
  await panel
    .locator('.file-row')
    .filter({ hasText: 'Executable' })
    .locator('input')
    .fill('/tools/StarRTK')
  await panel
    .locator('.file-row')
    .filter({ hasText: 'RINEX NAV' })
    .locator('input')
    .fill('/data/rover.nav')

  const timeline = panel.locator('.observation-time-section')
  await expect(timeline).toContainText('Rover and base overlap')
  await expect(timeline.locator('.observation-time-limits')).toHaveCount(0)
  await expect(timeline.locator('.observation-time-selected')).toContainText('2024-07-30 00:02:00')
  await expect(timeline.locator('.observation-time-selected')).toContainText('2024-07-30 00:08:00')
  const handles = timeline.getByRole('slider')
  await handles.nth(0).focus()
  await page.keyboard.press('ArrowRight')
  await handles.nth(1).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(timeline.locator('.observation-time-selected')).toContainText('00:02:00.001')
  await expect(timeline.locator('.observation-time-selected')).toContainText('00:07:59.999')

  await panel.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__solverPostCalls'))).toBe(1)
  const request = await page.evaluate(() => Reflect.get(window, '__solverPostRequest'))
  expect(request.engine).toBe('starrtk')
  expect(request.options.startTime).toBe('2024-07-30T00:02:00.001')
  expect(request.options.endTime).toBe('2024-07-30T00:07:59.999')
})
