import { ref } from "vue"
import { defineStore } from "pinia"
import { GgaData } from "@/composables/gnss/useNmea"

export const useGnssStore = defineStore('gnss', () => {
    const status = ref<GgaData>({
        time: '',
        latitude: '',
        nsIndicator: '',
        longitude: '',
        ewIndicator: '',
        quality: '',
        satellites: '',
        hdop: '',
        altitude: '',
        altitudeUnit: '',
        geoidHeight: '',
        geoidUnit: '',
        dgpsAge: '',
        dgpsStation: '',
    })

    return {
        status
    }
})
