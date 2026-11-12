import { expect, type Page } from '@playwright/test'

export async function openSolver(page: Page, mode: 'post' | 'realtime' = 'post', desktop = true) {
  await page.addInitScript(
    ({ initialMode, useDesktop }) => {
      localStorage.setItem('nav-tools:locale', 'en-US')
      if (!localStorage.getItem('nav-tools:custom-applications')) {
        localStorage.setItem(
          'nav-tools:custom-applications',
          JSON.stringify([
            {
              id: 'gnsslib',
              name: 'My GNSS-Lib',
              description: 'Integration test workspace',
              icon: 'satellite',
              accent: '#7c3aed',
              windowIds: ['gnsslib-rtkpost', 'gnsslib-rtknavi', 'raw-messages', 'gnss-deviation'],
            },
          ]),
        )
      }
      localStorage.setItem('nav-tools:selected-application', 'gnsslib')
      if (!localStorage.getItem('nav-tools:gnsslib-solver-mode'))
        localStorage.setItem('nav-tools:gnsslib-solver-mode', initialMode)
      if (!localStorage.getItem('nav-tools:gnssraw-rtkpost-v1'))
        localStorage.setItem(
          'nav-tools:gnssraw-rtkpost-v1',
          JSON.stringify({
            executablePath: '/tools/rnx2rtkp',
            roverObsPath: '/data/rover.obs',
            baseObsPath: '/data/base.obs',
            navPaths: ['/data/rover.nav'],
            outputPath: '/data/rover.pos',
          }),
        )
      if (!localStorage.getItem('nav-tools:gnsslib-rtknavi-v1'))
        localStorage.setItem(
          'nav-tools:gnsslib-rtknavi-v1',
          JSON.stringify({
            executablePath: '/tools/rtkrcv',
            outputPath: '/data/live.pos',
            options: { mode: 0 },
            inputs: [
              {
                type: 'file',
                enabled: true,
                path: '/data/rover.rtcm3',
                format: 'rtcm3',
                timeTag: false,
                replaySpeed: 1,
              },
            ],
          }),
        )
      if (!useDesktop) return
      const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
      const emit = (channel: string, payload: unknown) => {
        for (const listener of listeners.get(channel) ?? []) listener({}, payload)
      }
      const record = (index: number, quality = 1) => {
        const time = new Date(Date.UTC(2024, 6, 30) + index * 1000)
          .toISOString()
          .replaceAll('-', '/')
          .replace('T', ' ')
          .replace('Z', '')
        return `${time} ${(31 + index / 1e7).toFixed(9)} ${(121 + index / 1e7).toFixed(9)} ${(10 + index / 1000).toFixed(3)} ${quality} 12`
      }
      let pendingPost: { runId: string; resolve: (result: unknown) => void } | undefined
      let pendingStop: ((result: unknown) => void) | undefined
      let liveStatus = { runId: '', state: 'idle', outputPath: '' }
      let fullText = ''
      const readers = new Map<string, { text: string; position: number }>()
      let liveEpochs = 0
      let postCalls = 0
      const engineKey = 'test:gnss-solver-engine'
      const savedEngine = JSON.parse(sessionStorage.getItem(engineKey) ?? 'null')
      if (savedEngine) {
        liveStatus = savedEngine.liveStatus
        fullText = savedEngine.fullText
        liveEpochs = savedEngine.liveEpochs
        if (savedEngine.postRunId)
          pendingPost = { runId: savedEngine.postRunId, resolve: () => undefined }
      }
      const saveEngine = () =>
        sessionStorage.setItem(
          engineKey,
          JSON.stringify({
            postRunId: pendingPost?.runId,
            liveStatus,
            fullText,
            liveEpochs,
          }),
        )
      Object.assign(window, {
        __solverPostCalls: 0,
        __solverEmitLiveLog: (chunk: string) =>
          emit('rtknavi-log', { runId: liveStatus.runId, chunk }),
        __solverPostRequest: undefined,
        __solverLiveRequest: undefined,
        __solverEmitPost: (
          percentage: number | null,
          message = 'processing : 2024/07/30 00:00:30 Q=2',
        ) =>
          emit('rtkpost-progress', {
            runId: pendingPost?.runId,
            phase: 'processing',
            percentage,
            processingMessage: message,
          }),
        __solverCompletePost: (
          value: {
            ok?: boolean
            cancelled?: boolean
            error?: string
            count?: number
            text?: string
            log?: string
          } = {},
        ) => {
          const count = value.count ?? 1205
          fullText =
            value.text ??
            '% GPST latitude(deg) longitude(deg) height(m) Q ns\n' +
              Array.from({ length: count }, (_, index) => record(index, (index % 2) + 1)).join('\n')
          const log = value.log ?? 'engine diagnostic retained\n'
          emit('rtkpost-log', { runId: pendingPost?.runId, chunk: log })
          const runId = pendingPost?.runId
          const result = {
            ok: value.ok ?? true,
            cancelled: value.cancelled ?? false,
            exitCode: 0,
            outputPath: '/data/rover.pos',
            error: value.error,
            log,
            solution: {
              epochs: count,
              fixed: Math.ceil(count / 2),
              float: Math.floor(count / 2),
              single: 0,
              sbas: 0,
              dgps: 0,
              ppp: 0,
              other: 0,
              sizeBytes: fullText.length,
              preview: fullText.split('\n').slice(0, 48).join('\n'),
            },
          }
          pendingPost?.resolve(result)
          pendingPost = undefined
          saveEngine()
          emit('rtkpost-finished', { runId, result })
        },
        __solverEmitLive: (start: number, count: number, runId?: string) => {
          const records = Array.from({ length: count }, (_, index) =>
            record(start + index, (index % 2) + 1),
          )
          liveEpochs += count
          if (!runId || runId === liveStatus.runId) {
            fullText += `${records.join('\n')}\n`
            saveEngine()
          }
          emit('rtknavi-solution', {
            runId: runId ?? liveStatus.runId,
            records,
            epochs: liveEpochs,
            qualityCounts: { 1: Math.ceil(liveEpochs / 2), 2: Math.floor(liveEpochs / 2) },
            solution: {
              time: '2024/07/30 00:00:00.000',
              latitude: 31,
              longitude: 121,
              height: 10,
              quality: 1,
              satellites: 12,
              age: 0,
              ratio: 3,
            },
          })
        },
        __solverFinishLiveStop: () => {
          liveStatus = { ...liveStatus, state: 'stopped' }
          saveEngine()
          emit('rtknavi-status', liveStatus)
          pendingStop?.(liveStatus)
        },
      })
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
          async invoke(channel: string, value: unknown) {
            if (channel === 'text-file-stream-open') {
              readers.set((value as { requestId: string }).requestId, {
                text: fullText,
                position: 0,
              })
              return
            }
            if (channel === 'text-file-stream-read') {
              Reflect.get(window, '__solverOnRead')?.()
              const requestId = value as string
              const reader = readers.get(requestId)!
              const start = reader.position
              const end = Math.min(reader.text.length, start + 2048)
              reader.position = end
              return {
                data: reader.text.slice(start, end),
                processedBytes: end,
                totalBytes: reader.text.length,
                done: end === reader.text.length,
              }
            }
            if (channel === 'text-file-stream-close') readers.delete(value as string)
            return undefined
          },
          send: () => undefined,
        },
      })
      const api: Record<string, (...args: never[]) => unknown> = {
        getAppVersion: async () => '1.8.7',
        getWindowState: async () => ({ maximized: false, alwaysOnTop: false }),
        gnssSolverStatus: async () =>
          pendingPost
            ? { mode: 'post', runId: pendingPost.runId }
            : liveStatus.state === 'running' || liveStatus.state === 'stopping'
              ? { mode: 'realtime', runId: liveStatus.runId }
              : null,
        rtkPostRun: (request: { runId: string }) =>
          new Promise((resolve) => {
            pendingPost = { runId: request.runId, resolve }
            postCalls++
            Reflect.set(window, '__solverPostCalls', postCalls)
            Reflect.set(window, '__solverPostRequest', request)
            saveEngine()
          }),
        rtkPostCancel: async () => true,
        rtkPostObservationSpans: async (request: { roverPath: string; basePath?: string }) => {
          const read = Reflect.get(window, '__solverReadObservationSpans')
          return typeof read === 'function' ? read(request) : undefined
        },
        rtkPostCancelObservationRead: async () => undefined,
        rtkNaviStatus: async () => liveStatus,
        rtkNaviStart: async (request: { runId: string }) => {
          Reflect.set(window, '__solverLiveRequest', request)
          liveEpochs = 0
          fullText = '% GPST latitude(deg) longitude(deg) height(m) Q ns\n'
          liveStatus = { runId: request.runId, state: 'running', outputPath: '/data/live.pos' }
          saveEngine()
          emit('rtknavi-status', liveStatus)
          return liveStatus
        },
        rtkNaviStop: () =>
          new Promise((resolve) => {
            pendingStop = resolve
          }),
      }
      Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        value: new Proxy(api, {
          get: (target, property: string) => target[property] ?? (() => Promise.resolve(undefined)),
        }),
      })
    },
    { initialMode: mode, useDesktop: desktop },
  )
  await page.goto('/#app/gnsslib')
  const solver = page.locator('.gnss-solver')
  await expect(solver).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.flow-console-virtual')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.deviation-container')).toBeVisible({ timeout: 20_000 })
  return solver
}

export async function solverSnapshot(page: Page) {
  return page.evaluate(async () => {
    const modulePath = '/src/composables/useGnssSolverSession.ts'
    const { useGnssSolverSession } = await import(/* @vite-ignore */ modulePath)
    const session = useGnssSolverSession()
    return {
      epochs: session.epochs.value,
      positions: session.display.data.positionEpochHistory.value.length,
      points: session.display.data.deviationPoints.value.length,
      messages: session.solutionConsole.totalCount.value,
      log: session.logConsole.filteredMessages.value
        .map((message: { raw: string }) => message.raw)
        .join('\n'),
      origin: session.display.data.deviationPoints.value[0],
      runId: session.runId.value,
    }
  })
}
