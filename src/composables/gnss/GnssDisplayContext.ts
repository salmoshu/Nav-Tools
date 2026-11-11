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
  >
  timeline: ReturnType<typeof createFileTimeline>
  mapState: {
    status: { latitude: number | string; longitude: number | string; quality: number }
    trackResetToken: number
  }
}

export const gnssDisplayContext: InjectionKey<GnssDisplayContext> = Symbol('gnss-display-source')
