import { ref } from "vue"

const dt = 1/20
const timestamp = ref(0)
const ultrasonicData = ref([] as number[][])
const filteredData = ref([] as number[][])
const newUltrasonicData = ref(Array.from({ length: 100 }, () => [0, 0]) as number[][])
const newUltrasonicDataLen = ref(0)

export function useUltrasonic() {
  const processRawData = (data: string, startTime: number) => {
    timestamp.value = startTime
    const lines = data.split("\n");
    for (const line of lines) {
      if (line.trim() !== "") {
        const data = line.split(',')[0]
        if (data && Number(data)) {
          ultrasonicData.value.push([timestamp.value, Number(data)]);
          timestamp.value += dt
        }
      }
    }
  }
  const addRawData = (data: string) => {
    const lines = data.split("\n");
    newUltrasonicDataLen.value = 0
    for (const line of lines) {
      if (line.trim() !== "") {
        const data = line.split(',')[0]
        if (data && Number(data)) {
          ultrasonicData.value.push([timestamp.value, Number(data)]);
          newUltrasonicData.value[newUltrasonicDataLen.value][0] = timestamp.value
          newUltrasonicData.value[newUltrasonicDataLen.value][1] = Number(data)
          timestamp.value += dt
          newUltrasonicDataLen.value++
        }
      }
    }
  }
  const clearRawData = () => {
    timestamp.value = 0
    ultrasonicData.value = []
  }
  return {
    ultrasonicData,
    filteredData,
    newUltrasonicData,
    newUltrasonicDataLen,
    processRawData,
    addRawData,
    clearRawData,
  }
}
