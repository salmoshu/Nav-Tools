import { expect, test } from '@playwright/test'
import { createCalibrationSnapshot } from '../../src/core/camera/CameraCalibrationTypes'

test('keeps the fixed Accepted column above Remark text in a narrow calibration table', async ({
  page,
}) => {
  const snapshot = {
    ...createCalibrationSnapshot(),
    observing: true,
    busy: true,
    phase: 'sampling' as const,
    history: [
      {
        offset: -20,
        distances: [2, 3],
        errorsCm: [0, 0],
        accepted: true,
        verification: false,
      },
      {
        offset: -19.9,
        distances: [2.1, 3.1],
        errorsCm: [0.1, 0.2],
        accepted: true,
        verification: true,
      },
    ],
  }
  await page.addInitScript((snapshot) => {
    localStorage.setItem('nav-tools:locale', 'zh-CN')
    Object.defineProperty(window, 'electronAPI', {
      value: {
        getAppVersion: async () => '1.9.2',
        getWindowState: async () => ({ maximized: false, alwaysOnTop: false }),
        cameraCalibrationSnapshot: async () => snapshot,
      },
    })
    Object.defineProperty(window, 'ipcRenderer', {
      value: {
        on() {},
        off() {},
        send() {},
        invoke: async () => undefined,
      },
    })
  }, snapshot)
  await page.setViewportSize({ width: 380, height: 760 })
  await page.goto(
    `/#card/${encodeURIComponent(JSON.stringify({ componentName: 'CameraParameters', title: '相机参数' }))}`,
  )
  await page.getByRole('tab', { name: '自动标定', exact: true }).click()
  await page.screenshot({ path: 'test-results/camera-calibration-layout-debug.png' })
  await page.locator('.cal-history').scrollIntoViewIfNeeded()
  const fixed = page.getByRole('cell', { name: '是', exact: true }).first()
  await expect(fixed).toBeVisible()
  await expect(fixed).toContainText('是')
  expect(Number(await fixed.evaluate((element) => getComputedStyle(element).zIndex))).toBe(4)
  const background = await fixed.evaluate((element) => {
    const style = getComputedStyle(element)
    return { background: style.backgroundColor, overflow: style.overflow }
  })
  expect(background.background).not.toBe('rgba(0, 0, 0, 0)')
  expect(background.overflow).toBe('hidden')

  await page.locator('.cal-history .el-table__body-wrapper').evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  const bounds = await fixed.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(380)
  await page.screenshot({ path: 'test-results/camera-calibration-accepted-narrow.png' })
})
