import { expect, test } from '@playwright/test'
import {
  createCalibrationSnapshot,
  type CameraCalibrationSnapshot,
  type InssegFrame,
} from '../../src/core/camera/CameraCalibrationTypes'

const firstFrame: InssegFrame = {
  timestamp: '240601.120000.123',
  index: 1,
  pictureIndex: 42,
  targets: [
    {
      classId: 0,
      trackId: 10,
      left: 10,
      top: 20,
      right: 100,
      bottom: 200,
      distance: 1.26,
      azimuth: -5,
    },
  ],
}

function observedState(lastFrame: InssegFrame | null): CameraCalibrationSnapshot {
  return {
    ...createCalibrationSnapshot(),
    observing: true,
    phase: 'observing',
    lastFrame,
  }
}

test('starts observation with video and shows person fields or an empty connection state', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 900, height: 700 })
  await page.clock.install({ time: new Date('2026-11-12T00:00:00Z') })
  await page.clock.pauseAt(new Date('2026-11-12T00:00:01Z'))
  await page.addInitScript((initialState) => {
    localStorage.setItem('nav-tools:locale', 'zh-CN')
    const listeners = new Map<string, Set<(event: unknown, data: unknown) => void>>()
    Reflect.set(window, '__emitCamera', (channel: string, data: unknown) => {
      for (const listener of listeners.get(channel) ?? []) listener(null, data)
    })
    Reflect.set(
      window,
      '__cameraHasListener',
      (channel: string) => (listeners.get(channel)?.size ?? 0) > 0,
    )
    Reflect.set(window, '__observeCalls', [])
    Reflect.set(window, '__closeCalls', [])
    Object.defineProperty(window, 'ipcRenderer', {
      value: {
        on(channel: string, listener: (event: unknown, data: unknown) => void) {
          const entries = listeners.get(channel) ?? new Set()
          entries.add(listener)
          listeners.set(channel, entries)
        },
        off(channel: string, listener: (event: unknown, data: unknown) => void) {
          listeners.get(channel)?.delete(listener)
        },
        send() {},
        invoke: async () => undefined,
      },
    })
    Object.defineProperty(window, 'electronAPI', {
      value: {
        getAppVersion: async () => '1.8.8',
        getWindowState: async () => ({ maximized: false, alwaysOnTop: false }),
        setUpdaterPrefs() {},
        startCameraStream: async () => ({ ok: true }),
        stopCameraStream: async () => ({ ok: true }),
        cameraCalibrationSnapshot: async () => initialState,
        cameraCalibrationAccess: async () => ({
          host: '192.168.3.14',
          port: 22,
          username: 'root',
          hasPassword: true,
        }),
        cameraCalibrationObserve: async (request: unknown) => {
          const calls = Reflect.get(window, '__observeCalls') as unknown[]
          calls.push(request)
          if (calls.length === 1) throw new Error('相机控制连接已断开或改变')
          return initialState
        },
        cameraCalibrationClose: async () => {
          ;(Reflect.get(window, '__closeCalls') as unknown[]).push(true)
          return { ...initialState, observing: false, phase: 'stopped' }
        },
      },
    })
  }, observedState(null))

  await page.goto(
    `/#card/${encodeURIComponent(JSON.stringify({ componentName: 'CameraVideo', title: '相机视频' }))}`,
  )
  await page.waitForFunction(() => {
    const hasListener = Reflect.get(window, '__cameraHasListener') as (channel: string) => boolean
    return hasListener('camera-stream-frame') && hasListener('camera-calibration-state')
  })
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__observeCalls').length)).toBe(1)
  await page.evaluate(() => {
    const emit = Reflect.get(window, '__emitCamera') as (channel: string, data: unknown) => void
    emit('camera-stream-frame', Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))
  })

  const stage = page.locator('.video-stage')
  const overlay = page.locator('.bbox-overlay')
  await expect(overlay).toBeVisible()
  await expect(overlay.locator('.bbox-target')).toHaveCount(0)
  await expect(overlay.locator('.bbox-empty')).toContainText('暂未检测到人员')
  await page.evaluate(async () => {
    const { default: emitter } = await import('/src/hooks/useMitt.ts')
    Reflect.set(window, '__connectionConfigEvents', [])
    emitter.on('input-event', (payload: unknown) => {
      ;(Reflect.get(window, '__connectionConfigEvents') as unknown[]).push(payload)
    })
  })
  await overlay.getByRole('button', { name: '配置连接', exact: true }).click()
  expect(await page.evaluate(() => Reflect.get(window, '__connectionConfigEvents'))).toEqual([
    { tab: 'connections', protocol: 'tcp' },
  ])

  await expect(page.locator('.el-message--warning')).toHaveCount(0)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__observeCalls').length)).toBe(2)
  await page.evaluate(() => {
    const emit = Reflect.get(window, '__emitCamera') as (channel: string, data: unknown) => void
    emit('camera-stream-frame', Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))
  })

  await page.evaluate((state) => {
    const emit = Reflect.get(window, '__emitCamera') as (channel: string, data: unknown) => void
    emit('camera-calibration-state', state)
  }, observedState(firstFrame))
  await expect(overlay.locator('.bbox-target')).toHaveCount(1)
  await expect(overlay).toContainText('class=0')
  await expect(overlay).toContainText('track=10')
  const firstTarget = overlay.locator('.bbox-target').first()
  await expect(firstTarget.locator('.bbox-measurement')).toHaveText([
    'distance=1.260 m (avg 1.260 m)',
    'azimuth=-5.000° (avg -5.000°)',
  ])
  await expect(overlay).toHaveCSS('font-size', '12px')
  await expect(page.getByText('重试', { exact: true })).toBeVisible()
  await expect(overlay).not.toContainText('bbox=')

  const [stageBounds, overlayBounds] = await Promise.all([
    stage.boundingBox(),
    overlay.boundingBox(),
  ])
  expect(stageBounds).not.toBeNull()
  expect(overlayBounds).not.toBeNull()
  expect(overlayBounds!.x - stageBounds!.x).toBeCloseTo(10, 0)
  expect(
    stageBounds!.y + stageBounds!.height - overlayBounds!.y - overlayBounds!.height,
  ).toBeCloseTo(10, 0)

  const secondFrame: InssegFrame = {
    ...firstFrame,
    index: 2,
    pictureIndex: 43,
    targets: [
      { ...firstFrame.targets[0], left: 12, distance: 1.3, azimuth: -4.5 },
      {
        classId: 0,
        trackId: 11,
        left: 200,
        top: 20,
        right: 300,
        bottom: 200,
        distance: 2.03,
        azimuth: 5,
      },
    ],
  }
  await page.clock.runFor(1400)
  await page.evaluate((state) => {
    const emit = Reflect.get(window, '__emitCamera') as (channel: string, data: unknown) => void
    emit('camera-calibration-state', state)
  }, observedState(secondFrame))
  await expect(overlay.locator('.bbox-target')).toHaveCount(2)
  const secondTarget = overlay.locator('.bbox-target').nth(1)
  await expect(firstTarget.locator('.bbox-measurement')).toHaveText([
    'distance=1.300 m (avg 1.260 m)',
    'azimuth=-4.500° (avg -5.000°)',
  ])
  await expect(secondTarget.locator('.bbox-measurement')).toHaveText([
    'distance=2.030 m (avg 2.030 m)',
    'azimuth=5.000° (avg 5.000°)',
  ])
  await expect(overlay).toContainText('track=11')

  await page.clock.runFor(600)
  await expect(firstTarget.locator('.bbox-measurement')).toHaveText([
    'distance=1.300 m (avg 1.280 m)',
    'azimuth=-4.500° (avg -4.750°)',
  ])
  await expect(secondTarget.locator('.bbox-measurement')).toHaveText([
    'distance=2.030 m (avg 2.030 m)',
    'azimuth=5.000° (avg 5.000°)',
  ])

  await page.evaluate(
    (state) => {
      const emit = Reflect.get(window, '__emitCamera') as (channel: string, data: unknown) => void
      emit('camera-calibration-state', state)
    },
    observedState({ ...firstFrame, index: 3, targets: [] }),
  )
  await expect(overlay.locator('.bbox-target')).toHaveCount(0)
  await expect(overlay.locator('.bbox-empty')).toContainText('暂未检测到人员')

  const fourthFrame = { ...firstFrame, index: 4 }
  await page.evaluate((state) => {
    const emit = Reflect.get(window, '__emitCamera') as (channel: string, data: unknown) => void
    emit('camera-calibration-state', state)
  }, observedState(fourthFrame))
  await expect(overlay.locator('.bbox-target')).toHaveCount(1)
  await page.clock.runFor(1500)
  await expect(overlay.locator('.bbox-empty')).toBeVisible({ timeout: 2500 })

  await page.evaluate((state) => {
    const emit = Reflect.get(window, '__emitCamera') as (channel: string, data: unknown) => void
    emit('camera-calibration-state', state)
  }, observedState(fourthFrame))
  await expect(overlay.locator('.bbox-empty')).toContainText('暂未检测到人员')

  await page.evaluate(
    (state) => {
      const emit = Reflect.get(window, '__emitCamera') as (channel: string, data: unknown) => void
      emit('camera-calibration-state', state)
    },
    observedState({ ...firstFrame, index: 5 }),
  )
  await expect(overlay.locator('.bbox-target')).toHaveCount(1)
  await page.evaluate(
    (state) => {
      const emit = Reflect.get(window, '__emitCamera') as (channel: string, data: unknown) => void
      emit('camera-calibration-state', { ...state, observing: false })
    },
    observedState({ ...firstFrame, index: 5 }),
  )
  await expect(overlay.locator('.bbox-empty')).toContainText('人物信息未连接')

  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__closeCalls').length)).toBe(1)
  await expect(overlay).toHaveCount(0)
  expect(errors).toEqual([])
})
