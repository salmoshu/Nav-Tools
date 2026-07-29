import { ref } from "vue"
import { defineStore } from "pinia"

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
        quality: 0,
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
