import type { InjectionKey } from 'vue'
import type { useNmea } from './useNmea'
import type { createFileTimeline } from '../useFileTimeline'

export interface GnssDisplayContext {
  data: Pick<
    ReturnType<typeof useNmea>,
    | 'deviationPoints'
    | 'mapTrackPoints'
    | 'mapPositionEpochHistory'
    | 'currentData'
    | 'positionEpochHistory'
    | 'speedEpochHistory'
    | 'clearData'
  > &
    Partial<Pick<ReturnType<typeof useNmea>, 'statusEpochHistory'>>
  timeline: ReturnType<typeof createFileTimeline>
  /** Satellite data for this workspace; it must not fall back to another receiver. */
  signals?: Pick<
    ReturnType<typeof useNmea>,
    | 'satelliteSnrData'
    | 'snrHistory'
    | 'satelliteEpochHistory'
    | 'satelliteCountEpochHistory'
    | 'hasGsvData'
    | 'satelliteCountSource'
    | 'clearSatelliteEpochHistory'
    | 'clearSatelliteCountHistory'
  >
  mapState: {
    status: { latitude: number | string; longitude: number | string; quality: number }
    trackResetToken: number
  }
}

export const gnssDisplayContext: InjectionKey<GnssDisplayContext> = Symbol('gnss-display-source')
