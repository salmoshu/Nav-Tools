import { ref } from "vue"
import { defineStore } from "pinia"

interface GnssState {
    fixMode: string
    TTFF: string
    longitude: string
    latitude: string
    altitude: string
    altitudeMsl: string
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
    })

    return {
        status
    }
})
