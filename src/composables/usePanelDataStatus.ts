import { computed, onScopeDispose, ref, watch } from 'vue'
import { useApplicationSelector } from '@/composables/useApplicationSelector'
import { useFileTimeline } from '@/composables/useFileTimeline'
import { useFlow } from '@/composables/flow/useFlow'
import { useGnssRaw } from '@/composables/useGnssRaw'
import { useMcapPlayer } from '@/composables/useMcapPlayer'
import { useNmea } from '@/composables/gnss/useNmea'
import { useDevice } from '@/hooks/useDevice'
import { panelDataContract, SOLVER_SCOPED_PANEL_IDS } from '@/core/panels/PanelDataContract'

const HINT_DELAY_MS = 3000

export function usePanelDataStatus() {
  const device = useDevice()
  const { currentApplicationId, currentApplication } = useApplicationSelector()
  const { flowData } = useFlow()
  const nmea = useNmea()
  const gnssRaw = useGnssRaw()
  const mcap = useMcapPlayer()
  const fileTimeline = useFileTimeline()
  const hintReady = ref(false)
  let hintTimer: ReturnType<typeof setTimeout> | undefined

  const isSolverWorkspace = computed(
    () =>
      currentApplication.value?.id === 'gnsslib' ||
      (currentApplication.value?.windowIds.includes('gnsslib-solver') ?? false),
  )

  function hasContent(windowId: string): boolean {
    const pipeline = panelDataContract(windowId).pipeline
    if (pipeline === 'records') {
      return (flowData.value.rawDataKeys?.length ?? 0) > 0 && (flowData.value.plotTime?.length ?? 0) > 0
    }
    if (pipeline === 'gnss') {
      if (windowId === 'sky-plot') {
        return nmea.satelliteSnrData.value.length > 0 || nmea.snrHistory.value.length > 0
      }
      if (windowId === 'gnss-signals') {
        return (
          nmea.satelliteSnrData.value.length > 0 ||
          nmea.satelliteEpochHistory.value.length > 0 ||
          nmea.satelliteCountEpochHistory.value.length > 0 ||
          nmea.snrHistory.value.length > 0
        )
      }
      return (
        nmea.positionEpochHistory.value.length > 0 ||
        nmea.mapPositionEpochHistory.length > 0 ||
        nmea.speedEpochHistory.value.length > 0 ||
        nmea.satelliteCountEpochHistory.value.length > 0
      )
    }
    if (pipeline === 'gnssraw') {
      const dataset = gnssRaw.dataset.value
      const stats = dataset?.stats ?? gnssRaw.liveStats.value
      if (windowId === 'gnssraw-frames') return dataset !== null || stats !== null
      if (!dataset) return false
      if (windowId === 'gnssraw-visibility') return dataset.epochTimes.length > 0
      if (windowId === 'gnssraw-eph') return dataset.ephEvents.length > 0
      if (windowId === 'gnssraw-gf') {
        return Object.values(dataset.sats).some(
          (sat) => sat.slots.length >= 2 && sat.slots[0]?.freqHz > 0 && sat.slots[1]?.freqHz > 0,
        )
      }
      return Object.keys(dataset.sats).length > 0
    }
    if (pipeline === 'lidar') {
      const document = mcap.document.value
      const series = mcap.series.value
      if (windowId === 'lidar-scene') return (mcap.currentFrame.value?.entries.size ?? 0) > 0
      if (windowId === 'lidar-inspector') return (document?.topicNames().length ?? 0) > 0
      if (windowId === 'lidar-scores') return (series?.scores.t.length ?? 0) > 0
      return (
        (series?.cmd.t.length ?? 0) > 0 ||
        (series?.odom.t.length ?? 0) > 0 ||
        (series?.scores.t.length ?? 0) > 0
      )
    }
    return false
  }

  const loading = computed(
    () =>
      device.deviceConnecting.value ||
      device.fileInputLoading.value ||
      fileTimeline.indexing.value ||
      gnssRaw.status.value === 'loading' ||
      mcap.status.value === 'loading',
  )
  const sessionDependencies = computed(() => [
    currentApplicationId.value,
    device.activeSource.value,
    device.dataFormatSession.value.format,
    device.dataFormatSession.value.attempted,
    device.dataFormatSession.value.detected,
    device.filePath.value,
    device.globalDevice.value.path,
    device.globalDevice.value.host,
    device.globalDevice.value.port,
    loading.value,
  ])

  function reset(): void {
    hintReady.value = false
    if (hintTimer) clearTimeout(hintTimer)
    hintTimer = setTimeout(() => {
      hintReady.value = true
    }, HINT_DELAY_MS)
  }

  watch(sessionDependencies, reset, { immediate: true })
  onScopeDispose(() => {
    if (hintTimer) clearTimeout(hintTimer)
  })

  function shouldShowNoData(windowId: string): boolean {
    const contract = panelDataContract(windowId)
    // The message monitor displays the input itself. An empty monitor (e.g.
    // after Clear) is not a failed conversion from the current source.
    if (contract.role === 'excluded' || contract.pipeline === 'raw') return false
    if (isSolverWorkspace.value && SOLVER_SCOPED_PANEL_IDS.has(windowId)) return false
    const session = device.dataFormatSession.value
    if (!session.attempted || loading.value || !hintReady.value) return false
    return !hasContent(windowId)
  }

  return { shouldShowNoData }
}
