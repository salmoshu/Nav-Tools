import { computed, readonly, shallowRef, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { t } from '@/i18n'
import { useApplicationSelector } from '@/composables/useApplicationSelector'
import { useDevice } from '@/hooks/useDevice'
import { useGnssSolver } from '@/composables/useGnssSolver'
import { useGnssRaw, type GnssRawSourceFile, type RnxOutputFile } from '@/composables/useGnssRaw'
import { useMcapPlayer } from '@/composables/useMcapPlayer'
import {
  createAppHandoffArtifact,
  resolveAppHandoffTargets,
  singleRecordingFileForHandoff,
  solutionFileForHandoff,
  type AppHandoffArtifact,
  type AppHandoffArtifactKind,
  type AppHandoffTargetRegistration,
  type GnssSolutionHandoffFormat,
} from '@/core/handoff/AppHandoff'

export interface OpenSolutionHandoffRequest {
  outputPath: string
  runId: string
  kind: Extract<AppHandoffArtifactKind, 'completed-result' | 'realtime-snapshot'>
  format: GnssSolutionHandoffFormat
}

export interface OpenRinexHandoffRequest {
  sourceFiles?: GnssRawSourceFile[]
  convertedFiles?: RnxOutputFile[]
}

export interface AppHandoffTargetOption {
  applicationId: string
  name: string
}

interface ActiveAppHandoff {
  handoffId: string
  sourceAppId: string
  targetAppId: string
  artifact: AppHandoffArtifact
  targetContext: unknown
}

type AppHandoffNavigator = (applicationId: string) => Promise<void>

const handoffBusy = shallowRef(false)
const activeHandoff = shallowRef<ActiveAppHandoff | null>(null)
let navigator: AppHandoffNavigator | undefined
let watchersInstalled = false
let pendingSourcePreservation: { sourceAppId: string; targetAppId: string } | undefined

/** Only the explicit forward handoff bypasses the ordinary application-switch source teardown. */
export function shouldPreserveDeviceForHandoff(
  sourceAppId: string | undefined,
  targetAppId: string | undefined,
): boolean {
  const pending = pendingSourcePreservation
  return (
    pending !== undefined &&
    pending.sourceAppId === sourceAppId &&
    pending.targetAppId === targetAppId
  )
}

/** The Dashboard owns real layout navigation; the handoff kernel never creates a second layout manager. */
export function registerAppHandoffNavigator(next: AppHandoffNavigator): () => void {
  navigator = next
  return () => {
    if (navigator === next) navigator = undefined
  }
}

export function useAppHandoff() {
  const { applications, visibleApplications, currentApplicationId } = useApplicationSelector()
  const device = useDevice()
  const solver = useGnssSolver()
  const gnssRaw = useGnssRaw()
  const mcapPlayer = useMcapPlayer()

  function targetContext(targetAppId: string): unknown {
    if (targetAppId === 'gnsslib') return solver.post.formRevision.value
    if (targetAppId === 'gnssraw') return gnssRaw.fileInfo.value
    if (targetAppId === 'lidar') return mcapPlayer.fileInfo.value
    return device.globalDevice.value
  }

  if (!watchersInstalled) {
    watchersInstalled = true
    watch(
      [
        currentApplicationId,
        () => {
          const active = activeHandoff.value
          return active ? targetContext(active.targetAppId) : undefined
        },
      ],
      ([applicationId, context]) => {
        const active = activeHandoff.value
        if (!active) return
        if (applicationId !== active.targetAppId || context !== active.targetContext) {
          activeHandoff.value = null
        }
      },
      { flush: 'sync' },
    )
  }

  const apiAvailable = computed(
    () =>
      !window.location.hash.startsWith('#card/') &&
      typeof window.electronAPI?.appHandoffCreateSolutionSnapshot === 'function' &&
      typeof window.electronAPI.appHandoffRegisterArtifact === 'function' &&
      typeof window.electronAPI.appHandoffCreateRinexArtifact === 'function',
  )
  const sourceApplication = computed(() => {
    const sourceId = activeHandoff.value?.sourceAppId
    return applications.value.find((application) => application.id === sourceId)
  })

  function applicationEnabled(applicationId: string): boolean {
    return visibleApplications.value.some((application) => application.id === applicationId)
  }

  function availableTargets(artifact: AppHandoffArtifact, sourceAppId: string) {
    return resolveAppHandoffTargets(artifact).filter(
      (target) => target.applicationId !== sourceAppId && applicationEnabled(target.applicationId),
    )
  }

  const recordingTargets = computed<AppHandoffTargetOption[]>(() => {
    const artifact = device.recordingHandoff.value
    const sourceAppId = currentApplicationId.value
    if (!artifact || !sourceAppId || artifact.producerAppId !== sourceAppId) return []
    if (typeof window.electronAPI?.appHandoffRegisterArtifact !== 'function') return []
    return availableTargets(artifact, sourceAppId).map((target) => ({
      applicationId: target.applicationId,
      name:
        visibleApplications.value.find((application) => application.id === target.applicationId)
          ?.name ?? target.applicationId,
    }))
  })

  async function loadArtifact(
    target: AppHandoffTargetRegistration,
    artifact: AppHandoffArtifact,
  ): Promise<boolean> {
    switch (target.loader) {
      case 'gnss-solution': {
        const file = artifact.files.some((candidate) => candidate.role === 'solution')
          ? solutionFileForHandoff(artifact)
          : singleRecordingFileForHandoff(artifact)
        return device.loadGnssSolutionHandoff(file)
      }
      case 'text-replay':
        return device.loadTextFileHandoff(
          singleRecordingFileForHandoff(artifact),
          target.applicationId,
        )
      case 'rtkpost-rinex':
        return solver.loadRinexHandoff(artifact)
      case 'gnssraw-source': {
        const loaded = await gnssRaw.loadFromPaths(artifact.files.map((file) => file.path))
        if (!loaded) throw new Error(gnssRaw.errorText.value || 'HANDOFF_LOAD_FAILED')
        return true
      }
      case 'lidar-mcap': {
        const loaded = await mcapPlayer.loadFromPaths(artifact.files.map((file) => file.path))
        if (!loaded) throw new Error(mcapPlayer.errorText.value || 'HANDOFF_LOAD_FAILED')
        return true
      }
    }
  }

  async function performHandoff(
    prepare: () => Promise<AppHandoffArtifact>,
    requestedTarget: string | undefined,
    successMessage?: string,
  ): Promise<boolean> {
    if (handoffBusy.value) return false
    const sourceAppId = currentApplicationId.value
    if (!apiAvailable.value || !sourceAppId || !navigator) {
      ElMessage.error(t('gnssLib.solver.handoffUnavailable'))
      return false
    }

    handoffBusy.value = true
    try {
      const artifact = await prepare()
      const candidates = availableTargets(artifact, sourceAppId)
      const target = requestedTarget
        ? candidates.find((candidate) => candidate.applicationId === requestedTarget)
        : candidates.length === 1
          ? candidates[0]
          : undefined
      if (!target) {
        throw new Error(
          !requestedTarget && candidates.length > 1
            ? 'HANDOFF_TARGET_REQUIRED'
            : 'HANDOFF_TARGET_UNAVAILABLE',
        )
      }
      if (sourceAppId === target.applicationId) throw new Error('HANDOFF_TARGET_UNAVAILABLE')

      const loaded = await loadArtifact(target, artifact)
      if (!loaded) return false
      pendingSourcePreservation = { sourceAppId, targetAppId: target.applicationId }
      try {
        await navigator(target.applicationId)
      } finally {
        pendingSourcePreservation = undefined
      }
      if (currentApplicationId.value !== target.applicationId) {
        throw new Error('HANDOFF_NAVIGATION_FAILED')
      }

      activeHandoff.value = {
        handoffId: artifact.artifactId,
        sourceAppId,
        targetAppId: target.applicationId,
        artifact,
        targetContext: targetContext(target.applicationId),
      }
      ElMessage({
        type: 'success',
        message:
          successMessage ??
          t('app.handoff.success', {
            name:
              visibleApplications.value.find(
                (application) => application.id === target.applicationId,
              )?.name ?? target.applicationId,
          }),
        placement: 'bottom-right',
        offset: 50,
      })
      return true
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error)
      const message =
        code === 'NO_COMPLETE_SOLUTION_RECORDS'
          ? t('gnssLib.solver.handoffNoRecords')
          : code === 'HANDOFF_TARGET_UNAVAILABLE' || code === 'HANDOFF_TARGET_REQUIRED'
            ? t('gnssLib.solver.handoffTargetUnavailable')
            : code === 'HANDOFF_SOLVER_BUSY'
              ? t('gnssLib.solver.handoffSolverBusy')
              : t('app.handoff.failed', { message: code })
      ElMessage.error(message)
      return false
    } finally {
      handoffBusy.value = false
    }
  }

  async function openArtifact(
    artifact: AppHandoffArtifact,
    targetAppId?: string,
  ): Promise<boolean> {
    return performHandoff(async () => {
      const register = window.electronAPI?.appHandoffRegisterArtifact
      if (!register) throw new Error('HANDOFF_UNAVAILABLE')
      return register(artifact)
    }, targetAppId)
  }

  async function openSolutionInGnss(request: OpenSolutionHandoffRequest): Promise<boolean> {
    return performHandoff(
      async () => {
        const snapshot = await window.electronAPI!.appHandoffCreateSolutionSnapshot!({
          sourcePath: request.outputPath,
          runId: request.runId,
          kind: request.kind,
          format: request.format,
        })
        return snapshot.artifact
      },
      'gnss',
      t('gnssLib.solver.handoffSuccess'),
    )
  }

  async function openRinexInGnssLib(request: OpenRinexHandoffRequest): Promise<boolean> {
    return performHandoff(
      async () => {
        if (request.convertedFiles) {
          const create = window.electronAPI?.appHandoffCreateRinexArtifact
          if (!create) throw new Error('HANDOFF_UNAVAILABLE')
          return create({
            producerAppId: currentApplicationId.value ?? 'gnssraw',
            runId: crypto.randomUUID(),
            files: request.convertedFiles,
            observationRole: 'base-observation',
          })
        }
        const files = request.sourceFiles ?? []
        const artifact = createAppHandoffArtifact(
          currentApplicationId.value ?? 'gnssraw',
          crypto.randomUUID(),
          'rinex-input',
          files.map((file) => ({
            path: file.path,
            role: file.role,
            format: file.format,
          })),
        )
        const register = window.electronAPI?.appHandoffRegisterArtifact
        if (!register) throw new Error('HANDOFF_UNAVAILABLE')
        return register(artifact)
      },
      'gnsslib',
      t('gnssRaw.frames.handoffSuccess'),
    )
  }

  async function openRecordingIn(targetAppId: string): Promise<boolean> {
    const artifact = device.recordingHandoff.value
    if (!artifact || artifact.producerAppId !== currentApplicationId.value) return false
    return openArtifact(artifact, targetAppId)
  }

  async function returnToSource(): Promise<void> {
    const active = activeHandoff.value
    if (!active) return
    activeHandoff.value = null
    if (!navigator) return
    await navigator(active.sourceAppId)
  }

  return {
    activeHandoff: readonly(activeHandoff),
    handoffBusy: readonly(handoffBusy),
    apiAvailable,
    sourceApplication,
    recordingTargets,
    openArtifact,
    openSolutionInGnss,
    openRinexInGnssLib,
    openRecordingIn,
    returnToSource,
  }
}
