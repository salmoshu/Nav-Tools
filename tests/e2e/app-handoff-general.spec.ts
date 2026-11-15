import { expect, test, type Page } from '@playwright/test'

function rinex(type: 'O' | 'N'): string {
  const first = Array(80).fill(' ')
  first.splice(0, 20, ...'     3.03           ')
  first[20] = type
  first.splice(20 + 1, 20, ...(type === 'O' ? 'OBSERVATION DATA    ' : 'NAVIGATION DATA     '))
  first[40] = 'M'
  first.splice(60, 20, ...'RINEX VERSION / TYPE')
  const lines = [
    first.join(''),
    'NAVTOOLS            TEST                20260730 000000 UTC PGM / RUN BY / DATE ',
    'TEST                                                        MARKER NAME         ',
    '        0.0000        0.0000        0.0000                  APPROX POSITION XYZ ',
    '        0.0000        0.0000        0.0000                  ANTENNA: DELTA H/E/N',
    'G    4 C1C L1C D1C S1C                                      SYS / # / OBS TYPES ',
    '  2024     7    30     0     0    0.0000000     GPS         TIME OF FIRST OBS   ',
    '                                                            END OF HEADER       ',
  ]
  if (type === 'O')
    lines.push(
      '> 2024 07 30 00 00 00.0000000  0  1',
      'C01  20200000.000     106000000.000          40.000       1000.000',
    )
  else
    lines.push('C01 2024 07 30 00 00 00  0.000000000000D+00 0.000000000000D+00 0.000000000000D+00')
  return `${lines.join('\r\n')}\r\n`
}

async function installDesktop(
  page: Page,
  options: { text?: string; rinexObs?: string; rinexNav?: string } = {},
) {
  await page.addInitScript((options) => {
    localStorage.setItem('nav-tools:locale', 'zh-CN')
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
    const emit = (channel: string, payload: unknown) => {
      for (const listener of listeners.get(channel) ?? []) listener({}, payload)
    }
    const readers = new Map<string, { text: string; position: number }>()
    let streamOpens = 0
    Object.assign(window, { __handoffStreamOpens: 0 })
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: {
        on(channel: string, listener: (...args: unknown[]) => void) {
          const entries = listeners.get(channel) ?? new Set()
          entries.add(listener)
          listeners.set(channel, entries)
        },
        off(channel: string, listener: (...args: unknown[]) => void) {
          listeners.get(channel)?.delete(listener)
        },
        send: () => undefined,
        async invoke(channel: string, value: unknown) {
          if (channel === 'log-recording-start') {
            const path = '/data/recording.pos'
            emit('log-recording-status', { state: 'recording', path })
            return { started: true, path }
          }
          if (channel === 'log-recording-stop') {
            emit('log-recording-status', { state: 'stopped', path: '/data/recording.pos' })
            return
          }
          if (channel === 'text-file-stream-open') {
            readers.set((value as { requestId: string }).requestId, {
              text: options.text ?? '',
              position: 0,
            })
            Reflect.set(window, '__handoffStreamOpens', ++streamOpens)
            return
          }
          if (channel === 'text-file-stream-read') {
            const reader = readers.get(value as string)!
            const end = Math.min(reader.text.length, reader.position + 2048)
            const text = reader.text.slice(reader.position, end)
            reader.position = end
            return {
              data: text,
              processedBytes: end,
              totalBytes: reader.text.length,
              done: end === reader.text.length,
            }
          }
          if (channel === 'text-file-stream-close') readers.delete(value as string)
          return undefined
        },
      },
    })
    const api: Record<string, (...args: unknown[]) => unknown> = {
      getAppVersion: async () => 'test',
      getWindowState: async () => ({ maximized: false, alwaysOnTop: false }),
      gnssRawReadFile: async (path: unknown) => ({
        data: Array.from(
          new TextEncoder().encode(
            String(path).endsWith('.nav') ? (options.rinexNav ?? '') : (options.rinexObs ?? ''),
          ),
        ),
      }),
      appHandoffRegisterArtifact: async (artifact: unknown) => {
        Reflect.set(window, '__registeredArtifact', artifact)
        return artifact
      },
      appHandoffCreateRinexArtifact: async () => {
        throw new Error('Unexpected conversion')
      },
      appHandoffCreateSolutionSnapshot: async () => {
        throw new Error('Unexpected snapshot')
      },
      rtkPostRun: async (request: unknown) => {
        Reflect.set(window, '__unexpectedRun', request)
        throw new Error('Handoff must not run the solver')
      },
      rtkPostObservationSpans: async () => ({ rover: null, base: null }),
      rtkPostCancelObservationRead: async () => undefined,
    }
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: new Proxy(api, {
        get: (target, property: string) => target[property] ?? (() => Promise.resolve(undefined)),
      }),
    })
  }, options)
}

test('opens an existing RINEX file group in GNSS-Lib without running the solver', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await installDesktop(page, { rinexObs: rinex('O'), rinexNav: rinex('N') })
  await page.addInitScript(() => {
    localStorage.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'gnssraw',
          name: 'GNSS-Raw',
          description: '',
          icon: 'satellite',
          accent: '#6366f1',
          windowIds: ['gnssraw-frames'],
        },
        {
          id: 'gnsslib',
          name: 'GNSS-Lib',
          description: '',
          icon: 'satellite',
          accent: '#7c3aed',
          windowIds: ['gnsslib-solver', 'raw-messages', 'gnss-deviation'],
        },
      ]),
    )
    localStorage.setItem('nav-tools:selected-application', 'gnssraw')
  })
  await page.goto('/#app/gnssraw')
  await expect(page.locator('.gnssraw-frames')).toBeVisible()
  const loaded = await page.evaluate(async () => {
    const { useGnssRaw } = await import('/src/composables/useGnssRaw.ts')
    return useGnssRaw().loadFromPaths(['/fixtures/rover.obs', '/fixtures/rover.nav'])
  })
  expect(loaded).toBe(true)
  await page.getByRole('button', { name: '在 GNSS-Lib 中解算', exact: true }).click()

  const solver = page.locator('.gnss-solver')
  await expect(solver).toBeVisible()
  await expect(solver.locator('input[placeholder="RINEX OBS"]')).toHaveValue('/fixtures/rover.obs')
  await expect(solver.locator('input[placeholder^="NAV / CLK"]')).toHaveValue('/fixtures/rover.nav')
  await expect(solver.locator('.handoff-input-alert')).toContainText('手动开始解算')
  await expect(page.locator('.handoff-return')).toHaveText('返回 GNSS-Raw')
  expect(await page.evaluate(() => Reflect.get(window, '__unexpectedRun'))).toBeUndefined()
  expect(await page.evaluate(() => Reflect.get(window, '__registeredArtifact'))).toMatchObject({
    producerAppId: 'gnssraw',
    kind: 'rinex-input',
    files: [
      { path: '/fixtures/rover.obs', role: 'rover-observation' },
      { path: '/fixtures/rover.nav', role: 'navigation' },
    ],
  })
  await page.locator('.handoff-return').click()
  await expect(page.locator('.gnssraw-frames')).toBeVisible()
  expect(errors).toEqual([])
})

test('opens a stopped recording in GNSS, returns and opens it again', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const text =
    '% GPST latitude(deg) longitude(deg) height(m) Q ns\n' +
    '2026/11/15 10:00:00.000 31.000000000 121.000000000 10.000 1 12\n' +
    '2026/11/15 10:00:01.000 31.000010000 121.000010000 10.100 2 12\n'
  await installDesktop(page, { text })
  await page.addInitScript(() => {
    localStorage.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'serial',
          name: 'Serial',
          description: '',
          icon: 'serial',
          accent: '#64748b',
          windowIds: ['plot'],
        },
        {
          id: 'gnss',
          name: 'GNSS Check',
          description: '',
          icon: 'position',
          accent: '#0ea5e9',
          windowIds: ['gnss-deviation', 'gnss-signals', 'sky-plot', 'raw-messages'],
        },
      ]),
    )
    localStorage.setItem('nav-tools:selected-application', 'serial')
    localStorage.setItem(
      'nav-tools:data-source-settings',
      JSON.stringify({
        version: 1,
        activeSource: 'file',
        file: { parser: 'rtklib-pos', format: 'rtklib-pos', replaySpeed: 1 },
        serial: { parser: 'rtklib-pos', format: 'rtklib-pos' },
        network: { parser: 'rtklib-pos', format: 'rtklib-pos' },
      }),
    )
  })
  await page.goto('/#app/serial')
  await expect(page.locator('.context-app-name')).toHaveText('Serial')
  await page.evaluate(async () => {
    const { useDevice } = await import('/src/hooks/useDevice.ts')
    useDevice().globalDevice.value = {
      type: 'file',
      path: '/data/source.pos',
      connected: false,
    }
  })
  await page.locator('.log-record-button').click()
  await expect(page.locator('.log-record-button')).toHaveAttribute('aria-pressed', 'true')
  await page.locator('.log-record-button').click()
  await expect(page.locator('.log-record-button')).toHaveAttribute('aria-pressed', 'false')
  await page.locator('.handoff-open').click()
  await page.getByRole('menuitem', { name: '在 GNSS Check 中打开', exact: true }).click()

  await expect(page.locator('.context-app-name')).toHaveText('GNSS Check')
  await expect(page.locator('.context-file-name')).toHaveText('recording.pos')
  await expect(page.locator('.deviation-container')).toBeVisible()
  await expect(page.locator('.handoff-return')).toHaveText('返回 Serial')
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__handoffStreamOpens'))).toBe(1)
  expect(await page.evaluate(() => Reflect.get(window, '__registeredArtifact'))).toMatchObject({
    producerAppId: 'serial',
    kind: 'recording',
    files: [{ path: '/data/recording.pos', format: 'rtklib-pos', role: 'recording' }],
  })

  await page.locator('.handoff-return').click()
  await expect(page.locator('.context-app-name')).toHaveText('Serial')
  await page.locator('.handoff-open').click()
  await page.getByRole('menuitem', { name: '在 GNSS Check 中打开', exact: true }).click()
  await expect(page.locator('.handoff-return')).toHaveText('返回 Serial')
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__handoffStreamOpens'))).toBe(2)
  expect(errors).toEqual([])
})

test('projects a JSON recording into the Flow target instead of the source panels', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await installDesktop(page, {
    text: '{"time":0,"speed":10}\n{"time":1,"speed":12}\n',
  })
  await page.addInitScript(() => {
    localStorage.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'serial',
          name: 'Serial',
          description: '',
          icon: 'serial',
          accent: '#64748b',
          windowIds: ['raw-messages'],
        },
        {
          id: 'motor',
          name: 'Flow',
          description: '',
          icon: 'motor',
          accent: '#0ea5e9',
          windowIds: ['plot', 'raw-messages'],
        },
      ]),
    )
    localStorage.setItem('nav-tools:selected-application', 'serial')
    localStorage.setItem(
      'nav-tools:enabled-default-applications',
      JSON.stringify(['serial', 'motor']),
    )
    localStorage.setItem(
      'nav-tools:data-source-settings',
      JSON.stringify({
        version: 1,
        activeSource: 'file',
        file: { parser: 'json', format: 'json', replaySpeed: 1 },
        serial: { parser: 'json', format: 'json' },
        network: { parser: 'json', format: 'json' },
      }),
    )
  })
  await page.goto('/#app/serial')
  await page.evaluate(async () => {
    const { useDevice } = await import('/src/hooks/useDevice.ts')
    useDevice().globalDevice.value = {
      type: 'file',
      path: '/data/source.json',
      connected: false,
    }
  })
  await page.locator('.log-record-button').click()
  await expect(page.locator('.log-record-button')).toHaveAttribute('aria-pressed', 'true')
  await page.locator('.log-record-button').click()
  await expect(page.locator('.log-record-button')).toHaveAttribute('aria-pressed', 'false')
  await page.locator('.handoff-open').click()
  await page.getByRole('menuitem', { name: '在 Flow 中打开', exact: true }).click()

  await expect(page.locator('.context-app-name')).toHaveText('Flow')
  await expect(page.locator('.flow-console-virtual')).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useFlow } = await import('/src/composables/flow/useFlow.ts')
        const { useFileTimeline } = await import('/src/composables/useFileTimeline.ts')
        return {
          speed: useFlow().flowData.value.speed,
          epochs: useFileTimeline().totalEpochs.value,
          parser: useDeviceParser(),
        }
        function useDeviceParser() {
          return JSON.parse(localStorage.getItem('nav-tools:data-source-settings') ?? '{}').file
            .parser
        }
      }),
    )
    .toEqual({ speed: [10, 12], epochs: 2, parser: 'json' })
  await expect(page.locator('.handoff-return')).toHaveText('返回 Serial')
  expect(errors).toEqual([])
})
