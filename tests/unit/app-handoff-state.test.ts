import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppHandoffFile, AppHandoffSnapshotResult } from '../../src/core/handoff/AppHandoff'
import {
  registerAppHandoffNavigator,
  shouldPreserveDeviceForHandoff,
  useAppHandoff,
} from '../../src/composables/useAppHandoff'

let mockGlobalDevice = ref<{ type?: string; path?: string; connected: boolean | null }>({
  connected: null,
})
let mockCurrentApplicationId = ref('gnsslib')
const mockApplications = ref([
  { id: 'gnsslib', name: 'GNSS-Lib' },
  { id: 'gnss', name: 'GNSS' },
  { id: 'flow', name: 'Flow' },
])
const mockLoad = vi.fn()
const mockTextLoad = vi.fn()
const mockSnapshot = vi.fn()
const mockRegister = vi.fn(async (artifact: AppHandoffSnapshotResult['artifact']) => artifact)
const mockCreateRinex = vi.fn()
const mockRecording = ref<import('../../src/core/handoff/AppHandoff').AppHandoffArtifact | null>(
  null,
)
const mockPost = {
  formRevision: ref(0),
}
const mockSolverLoad = vi.fn(async () => true)
const mockRawFileInfo = ref(null)
const mockMcapFileInfo = ref(null)

vi.mock('@/hooks/useDevice', () => ({
  useDevice: () => ({
    globalDevice: mockGlobalDevice,
    recordingHandoff: mockRecording,
    loadGnssSolutionHandoff: mockLoad,
    loadTextFileHandoff: mockTextLoad,
  }),
}))
vi.mock('@/composables/useApplicationSelector', () => ({
  useApplicationSelector: () => ({
    applications: mockApplications,
    visibleApplications: mockApplications,
    currentApplicationId: mockCurrentApplicationId,
  }),
}))
vi.mock('@/composables/useGnssSolver', () => ({
  useGnssSolver: () => ({
    post: mockPost,
    loadRinexHandoff: mockSolverLoad,
  }),
}))
vi.mock('@/composables/useGnssRaw', () => ({
  useGnssRaw: () => ({
    fileInfo: mockRawFileInfo,
    errorText: ref(''),
    loadFromPaths: vi.fn(async () => true),
  }),
}))
vi.mock('@/composables/useMcapPlayer', () => ({
  useMcapPlayer: () => ({
    fileInfo: mockMcapFileInfo,
    errorText: ref(''),
    loadFromPaths: vi.fn(async () => true),
  }),
}))
vi.mock('element-plus', () => ({
  ElMessage: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}))

function snapshot(): AppHandoffSnapshotResult {
  return {
    recordCount: 1,
    artifact: {
      artifactId: crypto.randomUUID(),
      producerAppId: 'gnsslib',
      runId: 'run-1',
      createdAt: new Date().toISOString(),
      kind: 'completed-result',
      files: [
        {
          path: 'C:\\handoffs\\result.pos',
          role: 'solution',
          format: 'rtklib-pos',
          sizeBytes: 100,
          modifiedAt: new Date().toISOString(),
        },
      ],
    },
  }
}

beforeEach(() => {
  mockCurrentApplicationId.value = 'gnsslib'
  mockGlobalDevice.value = { connected: null }
  mockLoad.mockReset()
  mockLoad.mockImplementation(async (file: AppHandoffFile) => {
    mockGlobalDevice.value = { type: 'file', path: file.path, connected: false }
    return true
  })
  mockSnapshot.mockReset()
  mockSnapshot.mockImplementation(snapshot)
  mockRegister.mockClear()
  mockCreateRinex.mockReset()
  mockSolverLoad.mockClear()
  mockTextLoad.mockReset()
  mockTextLoad.mockResolvedValue(true)
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      appHandoffCreateSolutionSnapshot: mockSnapshot,
      appHandoffRegisterArtifact: mockRegister,
      appHandoffCreateRinexArtifact: mockCreateRinex,
    },
  })
  window.location.hash = ''
})

describe('application handoff state', () => {
  it('loads before navigation, returns one step and preserves the target data source', async () => {
    const handoff = useAppHandoff()
    const navigate = vi.fn(async (applicationId: string) => {
      mockCurrentApplicationId.value = applicationId
    })
    const unregister = registerAppHandoffNavigator(navigate)
    const request = {
      outputPath: 'C:\\results\\output.pos',
      runId: 'run-1',
      kind: 'completed-result' as const,
      format: 'rtklib-pos' as const,
    }

    await expect(handoff.openSolutionInGnss(request)).resolves.toBe(true)
    expect(mockLoad).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('gnss')
    expect(handoff.activeHandoff.value).toMatchObject({
      sourceAppId: 'gnsslib',
      targetAppId: 'gnss',
    })
    expect(handoff.sourceApplication.value?.name).toBe('GNSS-Lib')
    const targetSource = mockGlobalDevice.value

    mockGlobalDevice.value.connected = true
    await nextTick()
    expect(handoff.activeHandoff.value).not.toBeNull()

    await handoff.returnToSource()
    expect(mockCurrentApplicationId.value).toBe('gnsslib')
    expect(mockGlobalDevice.value).toBe(targetSource)
    expect(handoff.activeHandoff.value).toBeNull()
    unregister()
  })

  it('expires when the target loads another source or the user opens a third app', async () => {
    const handoff = useAppHandoff()
    const unregister = registerAppHandoffNavigator(async (applicationId) => {
      mockCurrentApplicationId.value = applicationId
    })
    const request = {
      outputPath: 'C:\\results\\output.pos',
      runId: 'run-1',
      kind: 'realtime-snapshot' as const,
      format: 'rtklib-pos' as const,
    }

    await handoff.openSolutionInGnss(request)
    mockGlobalDevice.value = { type: 'file', path: 'C:\\another.pos', connected: false }
    expect(handoff.activeHandoff.value).toBeNull()

    await handoff.openSolutionInGnss(request)
    mockCurrentApplicationId.value = 'flow'
    expect(handoff.activeHandoff.value).toBeNull()
    unregister()
  })

  it('does not navigate or create return state when the target loader declines', async () => {
    const handoff = useAppHandoff()
    const navigate = vi.fn(async (applicationId: string) => {
      mockCurrentApplicationId.value = applicationId
    })
    const unregister = registerAppHandoffNavigator(navigate)
    mockLoad.mockResolvedValue(false)

    await expect(
      handoff.openSolutionInGnss({
        outputPath: 'C:\\results\\output.pos',
        runId: 'run-1',
        kind: 'completed-result',
        format: 'rtklib-pos',
      }),
    ).resolves.toBe(false)
    expect(navigate).not.toHaveBeenCalled()
    expect(handoff.activeHandoff.value).toBeNull()
    unregister()
  })

  it('preserves the loaded source only during the forward handoff navigation', async () => {
    const handoff = useAppHandoff()
    const preservation: boolean[] = []
    const unregister = registerAppHandoffNavigator(async (applicationId) => {
      preservation.push(
        shouldPreserveDeviceForHandoff(mockCurrentApplicationId.value, applicationId),
      )
      mockCurrentApplicationId.value = applicationId
    })

    await handoff.openSolutionInGnss({
      outputPath: 'C:\\results\\output.pos',
      runId: 'run-1',
      kind: 'completed-result',
      format: 'rtklib-pos',
    })
    await handoff.returnToSource()

    expect(preservation).toEqual([true, false])
    expect(shouldPreserveDeviceForHandoff('gnsslib', 'gnss')).toBe(false)
    unregister()
  })

  it('requires an explicit target when a recording has several compatible targets', async () => {
    mockApplications.value.push({ id: 'serial', name: 'Serial' }, { id: 'motor', name: 'Flow' })
    mockCurrentApplicationId.value = 'gnsslib'
    const handoff = useAppHandoff()
    const navigate = vi.fn(async (applicationId: string) => {
      mockCurrentApplicationId.value = applicationId
    })
    const unregister = registerAppHandoffNavigator(navigate)
    const recording = {
      ...snapshot().artifact,
      producerAppId: 'gnsslib',
      kind: 'recording' as const,
      files: [
        {
          ...snapshot().artifact.files[0],
          role: 'recording' as const,
          format: 'json' as const,
        },
      ],
    }

    await expect(handoff.openArtifact(recording)).resolves.toBe(false)
    expect(navigate).not.toHaveBeenCalled()
    await expect(handoff.openArtifact(recording, 'serial')).resolves.toBe(true)
    expect(mockTextLoad).toHaveBeenCalledWith(recording.files[0], 'serial')
    expect(navigate).toHaveBeenCalledWith('serial')
    expect(handoff.activeHandoff.value?.targetAppId).toBe('serial')
    await handoff.returnToSource()
    unregister()
  })

  it('keeps RINEX return state until the solver form is edited', async () => {
    mockCurrentApplicationId.value = 'gnssraw'
    const handoff = useAppHandoff()
    const unregister = registerAppHandoffNavigator(async (applicationId) => {
      mockCurrentApplicationId.value = applicationId
    })
    mockSolverLoad.mockImplementation(async () => {
      mockPost.formRevision.value++
      return true
    })
    const rinex = {
      ...snapshot().artifact,
      kind: 'rinex-input' as const,
      files: [
        {
          ...snapshot().artifact.files[0],
          role: 'rover-observation' as const,
          format: 'rinex' as const,
        },
        {
          ...snapshot().artifact.files[0],
          path: 'C:\\handoffs\\rover.nav',
          role: 'navigation' as const,
          format: 'rinex' as const,
        },
      ],
    }

    await expect(handoff.openArtifact(rinex, 'gnsslib')).resolves.toBe(true)
    expect(mockSolverLoad).toHaveBeenCalledWith(rinex)
    expect(handoff.activeHandoff.value?.sourceAppId).toBe('gnssraw')
    mockPost.formRevision.value++
    expect(handoff.activeHandoff.value).toBeNull()
    unregister()
  })

  it('can hand off the same stopped recording again after returning to its source', async () => {
    mockApplications.value.push({ id: 'motor', name: 'Flow' })
    mockCurrentApplicationId.value = 'gnsslib'
    const handoff = useAppHandoff()
    const navigate = vi.fn(async (applicationId: string) => {
      mockCurrentApplicationId.value = applicationId
    })
    const unregister = registerAppHandoffNavigator(navigate)
    const recording = {
      ...snapshot().artifact,
      producerAppId: 'gnsslib',
      kind: 'recording' as const,
      files: [
        {
          ...snapshot().artifact.files[0],
          role: 'recording' as const,
          format: 'csv' as const,
        },
      ],
    }
    mockRecording.value = recording

    await expect(handoff.openRecordingIn('motor')).resolves.toBe(true)
    await handoff.returnToSource()
    expect(mockCurrentApplicationId.value).toBe('gnsslib')
    await expect(handoff.openRecordingIn('motor')).resolves.toBe(true)
    expect(navigate.mock.calls.map(([target]) => target)).toEqual(['motor', 'gnsslib', 'motor'])
    expect(handoff.activeHandoff.value?.artifact).toEqual(recording)
    unregister()
  })

  it('passes converted RTCM observations to the base-station slot', async () => {
    mockCurrentApplicationId.value = 'gnssraw'
    const handoff = useAppHandoff()
    const unregister = registerAppHandoffNavigator(async (applicationId) => {
      mockCurrentApplicationId.value = applicationId
    })
    const rinex = {
      ...snapshot().artifact,
      producerAppId: 'gnssraw',
      kind: 'rinex-input' as const,
      files: [
        {
          ...snapshot().artifact.files[0],
          role: 'base-observation' as const,
          format: 'rinex' as const,
        },
      ],
    }
    mockCreateRinex.mockResolvedValue(rinex)

    await expect(
      handoff.openRinexInGnssLib({
        convertedFiles: [{ name: 'base.26o', data: new Uint8Array([1]) }],
      }),
    ).resolves.toBe(true)
    expect(mockCreateRinex).toHaveBeenCalledWith(
      expect.objectContaining({
        producerAppId: 'gnssraw',
        observationRole: 'base-observation',
      }),
    )
    expect(mockSolverLoad).toHaveBeenCalledWith(rinex)
    await handoff.returnToSource()
    unregister()
  })
})
