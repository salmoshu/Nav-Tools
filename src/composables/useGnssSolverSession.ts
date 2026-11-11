import { computed, reactive, ref, shallowRef, triggerRef, type InjectionKey, type Ref } from 'vue'
import { NumericEpochStore } from '@/core/gnss/NumericEpochStore'
import {
  RtkSolutionParser,
  nmeaQualityToRtkQuality,
  type RtkSolution,
  type RtkSolutionParserOptions,
} from '@/core/gnsslib/RtkSolution'
import { NmeaStreamParser, validateNmeaChecksum } from '@/core/data/NmeaStreamParser'
import { createFileTimeline } from './useFileTimeline'
import { useConsole, type ConsoleState } from './flow/useConsole'
import type { GnssDisplayContext } from './gnss/GnssDisplayContext'
import { registerStatusSource } from '@/core/status/registry'
import { createStatusSource } from '@/core/status/createStatusSource'
import { t } from '@/i18n'

export type GnssSolverMode = 'post' | 'realtime'
export type SolverMessageChannel = 'solution' | 'log'

function createPositionHistory() {
  return new NumericEpochStore(
    [
      'E',
      'N',
      'U',
      'QUALITY',
      'DATE',
      'LATITUDE',
      'LONGITUDE',
      'HEIGHT',
      'RTK_QUALITY',
      'SATELLITES',
      'AGE',
      'RATIO',
    ],
    { valuePrecision: 'float64' },
  )
}

export function createGnssSolverSession() {
  const runId = ref('')
  const mode = ref<GnssSolverMode>('post')
  const channel = ref<SolverMessageChannel>('solution')
  const timeline = createFileTimeline()
  const solutionConsole = useConsole(false, timeline)
  const logConsole = useConsole(false, timeline)
  const consoles = { solution: solutionConsole, log: logConsole }
  const epochs = ref(0)
  const qualityCounts = ref<Record<number, number>>({})
  const latest = shallowRef<RtkSolution | null>(null)
  const currentSolution = shallowRef<RtkSolution | null>(null)
  const playbackSpeed = ref(1)
  const deviationPoints = shallowRef<Array<[number, number, number]>>([])
  const mapTrackPoints = shallowRef<Array<[number, number, number]>>([])
  const positionEpochHistory = shallowRef(createPositionHistory())
  const mapPositionEpochHistory = new NumericEpochStore(['LONGITUDE', 'LATITUDE', 'QUALITY'], {
    valuePrecision: 'float64',
  })
  const speedEpochHistory = shallowRef(new NumericEpochStore(['SPEED', 'QUALITY']))
  const mapState = reactive({
    status: { latitude: '' as number | string, longitude: '' as number | string, quality: 0 },
    trackResetToken: 0,
  })
  const emptyPosition = () => ({
    time: null,
    firstLatitude: null,
    firstLongitude: null,
    latitude: null,
    longitude: null,
    altitude: null,
    enuE: null,
    enuN: null,
    speed: null,
    course: null,
    satellites: null,
    selectedSatellites: null,
    pdop: null,
    hdop: null,
    vdop: null,
    status: null,
    quality: null,
    mode: null,
    date: null,
    raw: '',
  })
  const currentData: GnssDisplayContext['data']['currentData'] = ref(emptyPosition())
  let origin: [number, number, number] | undefined
  let parser = new RtkSolutionParser()
  let messageParser = new RtkSolutionParser()
  const messageClock = new NumericEpochStore(['ROW'])
  let messageElapsed = 0
  let buffer = ''
  let nmeaDate = ''
  const nmeaParser = new NmeaStreamParser()

  function clearData(): void {
    timeline.clearTimeline()
    origin = undefined
    epochs.value = 0
    qualityCounts.value = {}
    latest.value = null
    currentSolution.value = null
    deviationPoints.value = []
    mapTrackPoints.value = []
    positionEpochHistory.value = createPositionHistory()
    mapPositionEpochHistory.clear()
    speedEpochHistory.value = new NumericEpochStore(['SPEED', 'QUALITY'])
    currentData.value = emptyPosition()
    mapState.status = { latitude: '', longitude: '', quality: 0 }
    mapState.trackResetToken++
  }

  function begin(
    id: string,
    nextMode: GnssSolverMode,
    options: RtkSolutionParserOptions & { nmea?: boolean } = {},
  ): void {
    runId.value = id
    mode.value = nextMode
    channel.value = 'solution'
    timeline.clearTimeline()
    clearData()
    solutionConsole.clearMessages()
    logConsole.clearMessages()
    parser = new RtkSolutionParser(options)
    messageParser = new RtkSolutionParser(options)
    messageClock.clear()
    messageElapsed = 0
    solutionConsole.beginFileReplayMessages()
    solutionConsole.setFileReplayElapsedResolver((line) => {
      if (line.trimStart().startsWith('$')) return null
      const point = messageParser.addLine(line)
      if (point) {
        const index = messageClock.append(point.time, { ROW: 0 }, { replaceLast: true })
        messageElapsed = messageClock.getElapsedTime(index)
      }
      return messageElapsed
    })
    buffer = ''
    nmeaDate = ''
    nmeaParser.clear()
  }

  function appendSolution(solution: RtkSolution): void {
    if (
      !Number.isFinite(solution.latitude) ||
      !Number.isFinite(solution.longitude) ||
      Math.abs(solution.latitude) > 90 ||
      Math.abs(solution.longitude) > 180
    )
      return
    epochs.value++
    qualityCounts.value[solution.quality] = (qualityCounts.value[solution.quality] ?? 0) + 1
    latest.value = solution
    currentSolution.value = solution
    if (solution.quality === 0) return
    origin ??= [solution.latitude, solution.longitude, solution.height]
    const east = (solution.longitude - origin[1]) * 111320 * Math.cos((origin[0] * Math.PI) / 180)
    const north = (solution.latitude - origin[0]) * 110574
    const quality =
      ({ 1: 4, 2: 5, 3: 2, 4: 2, 5: 1, 6: 1, 7: 6 } as Record<number, number>)[solution.quality] ??
      0
    positionEpochHistory.value.append(solution.time, {
      E: east,
      N: north,
      U: solution.height - origin[2],
      QUALITY: quality,
      DATE:
        Date.UTC(
          Number(solution.time.slice(0, 4)),
          Number(solution.time.slice(5, 7)) - 1,
          Number(solution.time.slice(8, 10)),
        ) / 86_400_000,
      LATITUDE: solution.latitude,
      LONGITUDE: solution.longitude,
      HEIGHT: solution.height,
      RTK_QUALITY: solution.quality,
      SATELLITES: solution.satellites,
      AGE: solution.age,
      RATIO: solution.ratio,
    })
    mapPositionEpochHistory.append(solution.time, {
      LONGITUDE: solution.longitude,
      LATITUDE: solution.latitude,
      QUALITY: quality,
    })
    deviationPoints.value.push([east, north, quality])
    mapTrackPoints.value.push([solution.longitude, solution.latitude, quality])
    updateCurrentPosition(solution, east, north, quality)
  }

  function updateCurrentPosition(
    solution: RtkSolution,
    east: number,
    north: number,
    quality: number,
  ): void {
    currentSolution.value = solution
    currentData.value = {
      ...emptyPosition(),
      time: solution.time,
      firstLatitude: origin?.[0] ?? null,
      firstLongitude: origin?.[1] ?? null,
      latitude: solution.latitude,
      longitude: solution.longitude,
      altitude: solution.height,
      enuE: east,
      enuN: north,
      satellites: solution.satellites,
      status: 'A',
      quality,
      date: solution.time.slice(0, 10),
      raw: solution.raw,
    }
    mapState.status = { latitude: solution.latitude, longitude: solution.longitude, quality }
  }

  function applyTimelineEpoch(index: number): void {
    const history = positionEpochHistory.value
    if (!latest.value || index < 0 || index >= history.length) return
    const date = new Date((history.getValue('DATE', index) ?? 0) * 86_400_000)
      .toISOString()
      .slice(0, 10)
      .replaceAll('-', '/')
    const point: RtkSolution = {
      ...latest.value,
      time: `${date} ${history.formatTime(index)}`,
      latitude: history.getValue('LATITUDE', index)!,
      longitude: history.getValue('LONGITUDE', index)!,
      height: history.getValue('HEIGHT', index)!,
      quality: history.getValue('RTK_QUALITY', index)!,
      satellites: history.getValue('SATELLITES', index)!,
      age: history.getValue('AGE', index),
      ratio: history.getValue('RATIO', index),
      sdn: null,
      sde: null,
      sdu: null,
      sdne: null,
      sdeu: null,
      sdun: null,
      raw: '',
    }
    updateCurrentPosition(
      point,
      history.getValue('E', index)!,
      history.getValue('N', index)!,
      history.getValue('QUALITY', index)!,
    )
  }

  function attachTimeline(): boolean {
    solutionConsole.endFileReplayMessages()
    return timeline.attachTimeline(positionEpochHistory.value, {
      mode: 'loaded',
      speed: playbackSpeed.value,
      applyEpoch: applyTimelineEpoch,
    })
  }

  function setPlaybackSpeed(speed: number): void {
    if (!Number.isFinite(speed) || speed <= 0) return
    playbackSpeed.value = speed
    timeline.setPlaybackSpeed(speed)
  }

  function parseNmea(sentence: string): void {
    if (!validateNmeaChecksum(sentence)) return
    const fields = sentence.split('*')[0].split(',')
    if (/^\$..RMC$/.test(fields[0]) && /^\d{6}$/.test(fields[9] ?? '')) {
      const date = fields[9]
      nmeaDate = `${Number(date.slice(4)) < 80 ? '20' : '19'}${date.slice(4)}/${date.slice(2, 4)}/${date.slice(0, 2)}`
    }
    if (!/^\$..GGA$/.test(fields[0]) || !nmeaDate || !fields[2] || !fields[4]) return
    const coordinate = (text: string, direction: string) =>
      (Math.floor(Number(text) / 100) + (Number(text) % 100) / 60) *
      (direction === 'S' || direction === 'W' ? -1 : 1)
    const clock = fields[1]
    const quality = nmeaQualityToRtkQuality(Number(fields[6]))
    const solution = new RtkSolutionParser().addLine(
      `${nmeaDate} ${clock.slice(0, 2)}:${clock.slice(2, 4)}:${clock.slice(4)} ${coordinate(fields[2], fields[3])} ${coordinate(fields[4], fields[5])} ${Number(fields[9]) + Number(fields[11] || 0)} ${quality} ${Number(fields[7])}`,
    )
    if (solution) appendSolution({ ...solution, raw: sentence })
  }

  function append(text: string, id = runId.value): void {
    if (!text || id !== runId.value) return
    solutionConsole.addFileReplayData(text)
    // Inspect the actual stream: a config file can override the requested output format.
    for (const line of nmeaParser.push(text)) parseNmea(line)
    const lines = (buffer + text).split(/\r\n|[\r\n]/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const solution = parser.addLine(line)
      if (solution) appendSolution(solution)
    }
    triggerRef(positionEpochHistory)
    triggerRef(deviationPoints)
    triggerRef(mapTrackPoints)
  }

  function appendLog(text: string, id = runId.value): void {
    if (id === runId.value) logConsole.addMessage(text.replace(/\r\n|\r/g, '\n'))
  }

  const activeConsole = computed(() => consoles[channel.value])
  const displayConsole = {} as ConsoleState
  const templateConsole = solutionConsole as unknown as Record<string, unknown>
  for (const key of Object.keys(templateConsole)) {
    const value = templateConsole[key]
    if (typeof value === 'function') {
      Reflect.set(displayConsole, key, (...args: unknown[]) =>
        Reflect.get(activeConsole.value, key)(...args),
      )
    } else if (value && typeof value === 'object' && 'value' in value) {
      Reflect.set(
        displayConsole,
        key,
        computed({
          get: () => (Reflect.get(activeConsole.value, key) as Ref).value,
          set: (next) => {
            ;(Reflect.get(activeConsole.value, key) as Ref).value = next
          },
        }),
      )
    } else Reflect.set(displayConsole, key, value)
  }
  const display: GnssDisplayContext = {
    data: {
      deviationPoints,
      mapTrackPoints,
      mapPositionEpochHistory,
      currentData,
      positionEpochHistory,
      speedEpochHistory,
      clearData,
    },
    timeline,
    mapState,
  }
  return {
    runId,
    mode,
    channel,
    epochs,
    qualityCounts,
    latest,
    currentSolution,
    playbackSpeed,
    display,
    displayConsole,
    solutionConsole,
    logConsole,
    begin,
    append,
    appendLog,
    attachTimeline,
    setPlaybackSpeed,
  }
}

let session: ReturnType<typeof createGnssSolverSession> | undefined
export function useGnssSolverSession() {
  return (session ??= createGnssSolverSession())
}
export const gnssSolverSessionKey: InjectionKey<ReturnType<typeof createGnssSolverSession>> =
  Symbol('gnss-solver-session')

registerStatusSource(
  createStatusSource({
    id: 'gnsslib-solver',
    label: 'GNSS-Lib',
    match: (modules) => modules.has('gnsslib'),
    status: () => {
      const current = useGnssSolverSession()
      const point = current.currentSolution.value
      return point
        ? {
            epochs: current.epochs.value,
            solutionTime: point.time,
            latitude: point.latitude,
            longitude: point.longitude,
            height: point.height,
            solutionQ: point.quality,
            fixMode: t(
              point.quality >= 1 && point.quality <= 6
                ? `gnssLib.rtknavi.quality${point.quality}`
                : 'gnssLib.rtknavi.qualityOther',
            ),
          }
        : {}
    },
  }),
)
