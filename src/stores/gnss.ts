import { ref } from "vue"
import { defineStore } from "pinia"

interface GnssState {
    fixMode: string
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

    return {
        status
    }
})
