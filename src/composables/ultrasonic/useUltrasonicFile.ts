import { ref } from "vue"

export function useUltrasonicFile() {
  const dt = 1/20
  const t = ref(0)
  const ultrasonicData = ref([] as number[][]);
  const processRawData = (data: string, startTime: number) => {
    t.value = startTime
    const lines = data.split("\n");
    for (const line of lines) {
      if (line.trim() !== "") {
        const data = line.split(',')[0]
        ultrasonicData.value.push([t.value, Number(data)]);
        t.value += dt
      }
    }
  }
  return {
    ultrasonicData,
    processRawData,
  }
}
