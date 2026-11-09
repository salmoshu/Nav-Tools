import { ref } from "vue"
import { defineStore } from "pinia"
import { registerStatusSource } from '@/core/status/registry'
import { createStatusSource } from '@/core/status/createStatusSource'
import { useDataSourceManager } from '@/composables/useDataSourceManager'

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

// GNSS 面板始终展示；其它应用在主动选择 NMEA 数据格式后也展示同一组状态。
registerStatusSource(
    createStatusSource({
        id: 'gnss',
        label: 'GNSS',
        match: moduleIds => {
            const { settings } = useDataSourceManager()
            return moduleIds.has('gnss') ||
                settings[settings.activeSource].parser === 'nmea' ||
                settings[settings.activeSource].parser === 'rtklib-pos'
        },
        status: () => useGnssStore().status,
    }),
)
