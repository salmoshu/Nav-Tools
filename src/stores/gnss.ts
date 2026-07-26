import { ref } from "vue"
import { defineStore } from "pinia"

interface GnssState {
    fixMode: string
    quality: number
    TTFF: string
    longitude: number
    latitude: number
    altitude: number
    altitudeMsl: number
    velocity: string
    utcTime: string
    threeDAcc: string
    twoDAcc: string
    PDOP: string
    HDOP: string
    satsUsed: string
    satsVisible: string
}

export const useGnssStore = defineStore('gnss', () => {
    const status = ref<GnssState>({
        utcTime: '',
        fixMode: '',
        quality: 0,
        TTFF: '',
        longitude: 0.0,
        latitude: 0.0,
        altitude: 0.0,
        altitudeMsl: 0.0,
        velocity: '',
        threeDAcc: '',
        twoDAcc: '',
        PDOP: '',
        HDOP: '',
        satsUsed: '',
        satsVisible: '',
    })

    // 每当需要整体清空轨迹（重播开始 / 清空 GNSS 数据）时自增，
    // 地图视图据此清除本地维护的轨迹 polyline，避免新旧轨迹叠加。
    const trackResetToken = ref(0)
    function resetTrack(): void {
        trackResetToken.value++
    }

    return {
        status,
        trackResetToken,
        resetTrack,
    }
})
