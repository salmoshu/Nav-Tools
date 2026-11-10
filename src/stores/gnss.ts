import { ref } from "vue"
import { defineStore } from "pinia"
import { registerStatusSource } from '@/core/status/registry'
import { createStatusSource } from '@/core/status/createStatusSource'
import { useDataSourceManager } from '@/composables/useDataSourceManager'
import { useApplicationSelector } from '@/composables/useApplicationSelector'

export interface GnssState {
    fixMode: string
    quality: number
    TTFF: string
    longitude: number | string
    latitude: number | string
    altitude: number | string
    altitudeMsl: number | string
    velocity: string
    utcTime: string
    threeDAcc: string
    twoDAcc: string
    PDOP: string
    HDOP: string
    satsUsed: string
    satsVisible: string
}

function createDefaultGnssState(): GnssState {
    return {
        utcTime: '',
        fixMode: '',
        // 0 表示实际收到的无效解；尚未收到数据时使用空数值。
        quality: Number.NaN,
        TTFF: '',
        longitude: '',
        latitude: '',
        altitude: '',
        altitudeMsl: '',
        velocity: '',
        threeDAcc: '',
        twoDAcc: '',
        PDOP: '',
        HDOP: '',
        satsUsed: '',
        satsVisible: '',
    }
}

export const useGnssStore = defineStore('gnss', () => {
    const status = ref<GnssState>(createDefaultGnssState())

    function resetStatus(): void {
        status.value = createDefaultGnssState()
    }

    // 每当需要整体清空轨迹（重播开始 / 清空 GNSS 数据）时自增，
    // 地图视图据此清除本地维护的轨迹 polyline，避免新旧轨迹叠加。
    const trackResetToken = ref(0)
    function resetTrack(): void {
        trackResetToken.value++
    }

    return {
        status,
        resetStatus,
        trackResetToken,
        resetTrack,
    }
})

// GNSS 面板始终展示；含数据面板（plot/消息）的应用在主动选择 NMEA/RTKLIB POS
// 数据格式后也展示同一组状态。不含数据面板的应用（相机/LiDAR/GNSS-Raw 等）
// 与数据流无关：即使全局数据源仍在解析 NMEA（如回放中），StatusView 也应为空。
registerStatusSource(
    createStatusSource({
        id: 'gnss',
        label: 'GNSS',
        match: moduleIds => {
            if (moduleIds.has('gnss')) return true
            const { settings } = useDataSourceManager()
            const parser = settings[settings.activeSource].parser
            if (parser !== 'nmea' && parser !== 'rtklib-pos') return false
            const { currentApplication } = useApplicationSelector()
            const windowIds = currentApplication.value?.windowIds ?? []
            return windowIds.includes('plot') || windowIds.includes('raw-messages')
        },
        status: () => useGnssStore().status,
    }),
)
