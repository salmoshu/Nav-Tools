import { ref } from "vue"

const dt = 1/20
const t = ref(0)
const ultrasonicData = ref([] as number[][]);
const newUltrasonicData = ref(Array.from({ length: 100 }, () => [0, 0]) as number[][])
const newUltrasonicDataLen = ref(0)

export function useUltrasonic() {
  const processRawData = (data: string, startTime: number) => {
    t.value = startTime
    const lines = data.split("\n");
    for (const line of lines) {
      if (line.trim() !== "") {
        const data = line.split(',')[0]
        if (data) {
          ultrasonicData.value.push([t.value, Number(data)]);
          t.value += dt
        }
      }
    }
  }
  const addRawData = (data: string) => {
    const lines = data.split("\n");
    for (const line of lines) {
      if (line.trim() !== "") {
        const data = line.split(',')[0]
        if (data) {
          ultrasonicData.value.push([t.value, Number(data)]);
          newUltrasonicData.value[newUltrasonicDataLen.value][0] = t.value
          newUltrasonicData.value[newUltrasonicDataLen.value][1] = Number(data)
          t.value += dt
          newUltrasonicDataLen.value++
        }
      }
    }
  }
  const clearRawData = () => {
    t.value = 0
    ultrasonicData.value = []
  }
  return {
    ultrasonicData,
    newUltrasonicData,
    newUltrasonicDataLen,
    processRawData,
    addRawData,
    clearRawData,
  }
}
