import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRtkPost } from '@/composables/useRtkPost'
import type { AppHandoffFile } from '@/core/handoff/AppHandoff'
import type { RtkPostRunResult } from '@/core/gnsslib/RtkPost'

const run = vi.fn()

function rinex(path: string, role: AppHandoffFile['role']): AppHandoffFile {
  return {
    path,
    role,
    format: 'rinex',
    sizeBytes: 128,
    modifiedAt: '2026-11-15T00:00:00.000Z',
  }
}

beforeEach(() => {
  localStorage.clear()
  run.mockReset()
  run.mockResolvedValue({
    ok: true,
    cancelled: false,
    exitCode: 0,
    outputPath: '/data/result.pos',
    log: '',
  } satisfies RtkPostRunResult)
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      rtkPostRun: run,
      rtkPostObservationSpans: async () => ({ rover: null, base: null }),
      rtkPostCancelObservationRead: async () => undefined,
    },
  })
  const post = useRtkPost()
  post.cancelOptions()
  post.settings.roverObsPath = '/old/rover.obs'
  post.settings.baseObsPath = '/old/base.obs'
  post.settings.navPaths = ['/old/rover.nav']
  post.settings.outputPath = '/old/result.pos'
  post.settings.options.mode = 0
  post.settings.options.startTime = '2026-11-15 00:00:00'
  post.settings.options.endTime = '2026-11-15 00:01:00'
  post.draftOptions.mode = 0
  post.restoreTask('old-run')
  post.completeTask('old-run', {
    ok: true,
    cancelled: false,
    exitCode: 0,
    outputPath: '/old/result.pos',
    log: 'old result',
  })
})

describe('RTKPOST RINEX handoff', () => {
  it('prefills base observations and navigation without running or retaining old results', async () => {
    const post = useRtkPost()
    post.updateOption('elevationMaskDeg', 20)
    post.confirmOptions()
    const revision = post.formRevision.value

    post.loadRinexInput([
      rinex('/handoff/base.obs', 'base-observation'),
      rinex('/handoff/base.nav', 'navigation'),
      rinex('/handoff/rover.nav', 'navigation'),
    ])
    await nextTick()

    expect(post.settings.roverObsPath).toBe('')
    expect(post.settings.baseObsPath).toBe('/handoff/base.obs')
    expect(post.settings.navPaths).toEqual(['/handoff/base.nav', '/handoff/rover.nav'])
    expect(post.settings.outputPath).toBe('')
    expect(post.settings.options.startTime).toBe('')
    expect(post.settings.options.endTime).toBe('')
    expect(post.settings.options.elevationMaskDeg).toBe(20)
    expect(post.draftOptions.elevationMaskDeg).toBe(20)
    expect(post.hasPendingOptions.value).toBe(false)
    expect(post.result.value).toBeNull()
    expect(post.status.value).toBe('idle')
    expect(post.formRevision.value).toBeGreaterThan(revision)
    expect(post.handoffNotice.value).toMatch(/流动站|rover OBS/)
    expect(run).not.toHaveBeenCalled()

    post.settings.roverObsPath = '/handoff/rover.obs'
    expect(post.formRevision.value).toBeGreaterThan(revision)
    expect(post.handoffNotice.value).toMatch(/手动开始解算|solver manually/)
    expect(run).not.toHaveBeenCalled()
  })

  it('clears the input handoff notice when a run actually starts', async () => {
    const post = useRtkPost()
    post.loadRinexInput([
      rinex('/handoff/rover.obs', 'rover-observation'),
      rinex('/handoff/rover.nav', 'navigation'),
    ])
    post.settings.outputPath = '/data/result.pos'
    expect(post.handoffNotice.value).not.toBe('')
    expect(post.hasPendingOptions.value).toBe(false)
    await vi.waitFor(() => expect(post.observationStatus.value).toBe('unavailable'))

    await post.execute('handoff-run')
    expect(post.handoffNotice.value).toBe('')
    expect(post.errorText.value).toBe('')
    expect(run).toHaveBeenCalledOnce()
    expect(run.mock.calls[0][0]).toMatchObject({
      roverObsPath: '/handoff/rover.obs',
      navPaths: ['/handoff/rover.nav'],
      outputPath: '/data/result.pos',
    })
  })
})
