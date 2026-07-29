import { ref, shallowRef, triggerRef, computed } from 'vue'
import { useGnssStore } from '@/stores/gnss'
import { NmeaStreamParser, validateNmeaChecksum } from '@/core/data/NmeaStreamParser'
import {
  SatelliteEpochAssembler,
} from '@/core/gnss/SatelliteEpochAssembler'
import { SatelliteEpochStore } from '@/core/gnss/SatelliteEpochStore'
import { NumericEpochStore } from '@/core/gnss/NumericEpochStore'
import {
  SatelliteDetailEpochStore,
  type SatelliteDetailSample,
} from '@/core/gnss/SatelliteDetailEpochStore'
import { t } from '@/i18n'

// Keep object-heavy legacy histories bounded; reuse the same count as a roughly
// one-point-per-second map budget for a 12 h, 10 Hz file.
const MAX_NMEA_DATA = 12 * 3600
const HISTORY_TRIM_SIZE = 3600
const SATELLITE_TTL_MS = 3000
const TIMELINE_INCREMENTAL_POINT_LIMIT = 1024
const nmeaData = shallowRef<NmeaData[]>([])
const ggaData = shallowRef<GgaData[]>([])
const deviationPoints = shallowRef<Array<[number, number, number]>>([])
const mapTrackPoints = shallowRef<Array<[number, number, number]>>([])
const satelliteSnrData = shallowRef<SatelliteSnrData[]>([])
const satelliteEpochHistory = shallowRef(new SatelliteEpochStore())
const satelliteDetailEpochHistory = new SatelliteDetailEpochStore()
const positionEpochHistory = shallowRef(new NumericEpochStore(['E', 'N', 'U', 'QUALITY']))
const speedEpochHistory = shallowRef(new NumericEpochStore(['SPEED', 'QUALITY']))
const mapPositionEpochHistory = new NumericEpochStore(
  ['LONGITUDE', 'LATITUDE', 'QUALITY'],
  { valuePrecision: 'float64' },
)
const statusEpochHistory = shallowRef(
  new NumericEpochStore(
    [
      'DATE',
      'QUALITY',
      'LONGITUDE',
      'LATITUDE',
      'ALTITUDE',
      'ALTITUDE_MSL',
      'VELOCITY',
      'PDOP',
      'HDOP',
      'SATS_USED',
      'SATS_VISIBLE',
      'TWO_D_ACC',
      'THREE_D_ACC',
    ],
    { valuePrecision: 'float64' },
  ),
)
const latestSatelliteData = new Map<string, SatelliteSnrData>()
const pendingSatelliteDetails = new Map<string, SatelliteSnrData>()
const satelliteEpochAssembler = new SatelliteEpochAssembler()
const utcTime = [0, 0, 0, 0, 0, 0]
let firstLLh: [number | null, number | null, number | null] | null = null
let batchDepth = 0
let nmeaDataDirty = false
let ggaDataDirty = false
let deviationPointsDirty = false
let mapTrackPointsDirty = false
let satelliteDataDirty = false
let satelliteEpochHistoryDirty = false
let positionEpochHistoryDirty = false
let speedEpochHistoryDirty = false
let statusEpochHistoryDirty = false
let firstAltitude: number | null = null
let pendingGgaEpochTime = ''
let latestSpeedEpochTime = ''
let latestSpeedKmh: number | null = null
let latestSpeedQuality = 0
type MapTrackSource = 'GGA' | 'RMC'
let lastMapTrackEpochTime = ''
let lastMapTrackSource: MapTrackSource | null = null
let timelineProjectionActive = false
let timelineDeviationIndex = -1
let timelineMapIndex = -1

function trimHistory<T>(records: T[]): void {
  if (records.length > MAX_NMEA_DATA) {
    records.splice(0, Math.min(HISTORY_TRIM_SIZE, records.length - MAX_NMEA_DATA + HISTORY_TRIM_SIZE))
  }
}

function publishPendingData(): void {
  if (batchDepth > 0) return

  if (nmeaDataDirty) {
    nmeaDataDirty = false
    triggerRef(nmeaData)
  }
  if (ggaDataDirty) {
    ggaDataDirty = false
    triggerRef(ggaData)
  }
  if (deviationPointsDirty) {
    deviationPointsDirty = false
    triggerRef(deviationPoints)
  }
  if (mapTrackPointsDirty) {
    mapTrackPointsDirty = false
    triggerRef(mapTrackPoints)
  }
  if (satelliteDataDirty) {
    satelliteDataDirty = false
    const cutoff = Date.now() - SATELLITE_TTL_MS
    for (const [key, item] of latestSatelliteData) {
      if (Date.parse(item.timestamp) <= cutoff) latestSatelliteData.delete(key)
    }
    satelliteSnrData.value = [...latestSatelliteData.values()]
  }
  if (satelliteEpochHistoryDirty) {
    satelliteEpochHistoryDirty = false
    triggerRef(satelliteEpochHistory)
  }
  if (positionEpochHistoryDirty) {
    positionEpochHistoryDirty = false
    triggerRef(positionEpochHistory)
  }
  if (speedEpochHistoryDirty) {
    speedEpochHistoryDirty = false
    triggerRef(speedEpochHistory)
  }
  if (statusEpochHistoryDirty) {
    statusEpochHistoryDirty = false
    triggerRef(statusEpochHistory)
  }
}

function runInBatch<T>(callback: () => T): T {
  batchDepth += 1
  try {
    return callback()
  } finally {
    batchDepth -= 1
    publishPendingData()
  }
}

function beginBulkImport(): void {
  batchDepth += 1
}

function endBulkImport(): void {
  if (batchDepth === 0) return
  batchDepth -= 1
  publishPendingData()
}

function llhToEnu(latitude: number, longitude: number, firstLatitude: number, firstLongitude: number) {
  const enuE = (longitude - firstLongitude) * 111320 * Math.cos(firstLatitude * Math.PI / 180);
  const enuN = (latitude - firstLatitude) * 110574;
  const roundedE = Math.round(enuE * 1000) / 1000;
  const roundedN = Math.round(enuN * 1000) / 1000;
  return [roundedE, roundedN]
}

function addNmeaData(data: NmeaData) {
  nmeaData.value.push(data)
  trimHistory(nmeaData.value)
  nmeaDataDirty = true
  if (data.enuE !== null && data.enuN !== null) {
    deviationPoints.value.push([
      Number(data.enuE),
      Number(data.enuN),
      Number(data.quality ?? 0),
    ])
    trimHistory(deviationPoints.value)
    deviationPointsDirty = true
  }
  if (data.longitude !== null && data.latitude !== null) {
    upsertMapTrackPoint(
      Number(data.longitude),
      Number(data.latitude),
      Number(data.quality ?? 0),
      pendingGgaEpochTime,
      'GGA',
    )
  }
  publishPendingData()
}

// RMC-only streams still produce a map track, but when RMC and GGA describe the
// same epoch the GGA sample is authoritative because it carries the solution quality
// used by GNSS Deviation. Coalescing the pair also prevents a zero-length GGA segment
// from leaving every visible inter-epoch segment colored as an RMC single fix.
function upsertMapTrackPoint(
  longitude: number,
  latitude: number,
  quality: number,
  epochTime: string,
  source: MapTrackSource,
): boolean {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false
  if (longitude === 0 && latitude === 0) return false
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false

  const point: [number, number, number] = [
    Number(longitude),
    Number(latitude),
    Number(quality),
  ]
  const lastIndex = mapTrackPoints.value.length - 1
  const matchesLastEpoch =
    epochTime.length > 0 && epochTime === lastMapTrackEpochTime && lastIndex >= 0

  if (matchesLastEpoch && source !== lastMapTrackSource) {
    if (source === 'RMC') return false
    mapTrackPoints.value[lastIndex] = point
  } else {
    mapTrackPoints.value.push(point)
    trimHistory(mapTrackPoints.value)
  }

  lastMapTrackEpochTime = epochTime
  lastMapTrackSource = source
  mapTrackPointsDirty = true
  return true
}

function rebuildMapTrackFromPositionHistory(
  maxPoints = MAX_NMEA_DATA,
  endIndex = mapPositionEpochHistory.length - 1,
): void {
  const history = mapPositionEpochHistory
  const lastIndex = Math.min(history.length - 1, Math.max(-1, Math.floor(endIndex)))
  const sourceLength = lastIndex + 1
  const pointBudget = Math.max(2, Math.floor(maxPoints))
  const stride = Math.max(
    1,
    Math.ceil(Math.max(0, sourceLength - 1) / Math.max(1, pointBudget - 1)),
  )
  const points: Array<[number, number, number]> = []

  const appendIndex = (index: number) => {
    const longitude = history.getValue('LONGITUDE', index)
    const latitude = history.getValue('LATITUDE', index)
    if (
      longitude === null ||
      latitude === null ||
      (longitude === 0 && latitude === 0) ||
      Math.abs(longitude) > 180 ||
      Math.abs(latitude) > 90
    ) {
      return
    }
    const quality = history.getValue('QUALITY', index) ?? 0
    const previous = points[points.length - 1]
    if (previous && previous[0] === longitude && previous[1] === latitude) return
    points.push([longitude, latitude, quality])
  }

  for (let index = 0; index <= lastIndex; index += stride) appendIndex(index)
  if (lastIndex >= 0 && lastIndex % stride !== 0) {
    appendIndex(lastIndex)
  }

  mapTrackPoints.value = points
  timelineMapIndex = lastIndex
  lastMapTrackEpochTime = ''
  lastMapTrackSource = null
  mapTrackPointsDirty = true
  publishPendingData()
}

function appendMapPositionEpoch(
  time: string,
  longitude: number,
  latitude: number,
  quality: number,
): void {
  if (!time || !isFinite(longitude) || !isFinite(latitude)) return
  mapPositionEpochHistory.append(
    time,
    {
      LONGITUDE: longitude,
      LATITUDE: latitude,
      QUALITY: quality,
    },
    { replaceLast: true },
  )
}

function rebuildDeviationFromPositionHistory(
  maxPoints = MAX_NMEA_DATA,
  endIndex = positionEpochHistory.value.length - 1,
): void {
  const history = positionEpochHistory.value
  const lastIndex = Math.min(history.length - 1, Math.max(-1, Math.floor(endIndex)))
  const sourceLength = lastIndex + 1
  const pointBudget = Math.max(2, Math.floor(maxPoints))
  const selectedIndices = new Set<number>()

  if (sourceLength <= pointBudget) {
    for (let index = 0; index <= lastIndex; index += 1) selectedIndices.add(index)
  } else {
    const fieldBudget = Math.max(2, Math.floor(pointBudget / 2))
    for (const field of ['E', 'N']) {
      const series = history.extractSeries(field, 0, lastIndex, fieldBudget)
      for (let offset = 0; offset < series.points.length; offset += 2) {
        selectedIndices.add(series.points[offset])
      }
    }
    selectedIndices.add(0)
    selectedIndices.add(lastIndex)
  }

  deviationPoints.value = [...selectedIndices]
    .sort((left, right) => left - right)
    .map(
      (index): [number, number, number] => [
        history.getValue('E', index) ?? 0,
        history.getValue('N', index) ?? 0,
        history.getValue('QUALITY', index) ?? 0,
      ],
    )
  timelineDeviationIndex = lastIndex
  deviationPointsDirty = true
  publishPendingData()
}

function appendPositionEpoch(data: NmeaData): void {
  if (!pendingGgaEpochTime || data.enuE === null || data.enuN === null) return
  if (firstAltitude === null && data.altitude !== null) {
    firstAltitude = Number(data.altitude)
  }
  const up =
    data.altitude !== null && firstAltitude !== null
      ? Number(data.altitude) - firstAltitude
      : null
  positionEpochHistory.value.append(pendingGgaEpochTime, {
    E: Number(data.enuE),
    N: Number(data.enuN),
    U: up,
    QUALITY: Number(data.quality ?? 0),
  })
  positionEpochHistoryDirty = true
}

function appendSpeedEpoch(
  time: string,
  speedKmh: number,
  quality: number,
  replaceLast = false,
): void {
  if (!time || !Number.isFinite(speedKmh)) return
  latestSpeedEpochTime = time
  latestSpeedKmh = speedKmh
  latestSpeedQuality = quality
  speedEpochHistory.value.append(
    time,
    { SPEED: speedKmh, QUALITY: quality },
    { replaceLast },
  )
  speedEpochHistoryDirty = true
}

function finiteStatusValue(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function appendStatusEpoch(time: string, replaceLast = true): void {
  if (!time) return
  const status = useGnssStore().status
  const dateMatch = status.utcTime.match(/^(\d{4})\/(\d{2})\/(\d{2})/)
  const date = dateMatch
    ? Math.floor(
        Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])) /
          86_400_000,
      )
    : null
  statusEpochHistory.value.append(
    time,
    {
      DATE: date,
      QUALITY: finiteStatusValue(status.quality),
      LONGITUDE: finiteStatusValue(status.longitude),
      LATITUDE: finiteStatusValue(status.latitude),
      ALTITUDE: finiteStatusValue(status.altitude),
      ALTITUDE_MSL: finiteStatusValue(status.altitudeMsl),
      VELOCITY: finiteStatusValue(status.velocity),
      PDOP: finiteStatusValue(status.PDOP),
      HDOP: finiteStatusValue(status.HDOP),
      SATS_USED: finiteStatusValue(status.satsUsed),
      SATS_VISIBLE: finiteStatusValue(status.satsVisible),
      TWO_D_ACC: finiteStatusValue(status.twoDAcc),
      THREE_D_ACC: finiteStatusValue(status.threeDAcc),
    },
    { replaceLast },
  )
  statusEpochHistoryDirty = true
}

function applyStatusEpoch(index: number): void {
  const history = statusEpochHistory.value
  if (index < 0 || index >= history.length) return
  const status = useGnssStore().status
  const value = (field: string) => history.getValue(field, index)
  const text = (field: string) => {
    const fieldValue = value(field)
    return fieldValue === null ? '' : String(fieldValue)
  }
  const fixed = (field: string, digits: number) => {
    const fieldValue = value(field)
    return fieldValue === null ? '' : fieldValue.toFixed(digits)
  }
  const quality = value('QUALITY') ?? 0
  const date = value('DATE')
  const dateValue = date === null ? null : new Date(Math.trunc(date) * 86_400_000)
  const dateText = dateValue
    ? `${dateValue.getUTCFullYear()}/${String(dateValue.getUTCMonth() + 1).padStart(2, '0')}/${String(dateValue.getUTCDate()).padStart(2, '0')} `
    : ''

  status.utcTime = `${dateText}${history.formatTime(index)}`
  status.quality = quality
  status.fixMode = numberToQuality(quality)
  status.longitude = value('LONGITUDE') ?? ''
  status.latitude = value('LATITUDE') ?? ''
  status.altitude = value('ALTITUDE') ?? ''
  status.altitudeMsl = value('ALTITUDE_MSL') ?? ''
  status.velocity = fixed('VELOCITY', 2)
  status.PDOP = text('PDOP')
  status.HDOP = text('HDOP')
  status.satsUsed = text('SATS_USED')
  status.satsVisible = text('SATS_VISIBLE')
  status.twoDAcc = fixed('TWO_D_ACC', 2)
  status.threeDAcc = fixed('THREE_D_ACC', 2)
}

function appendTimelineDeviationThrough(targetIndex: number): void {
  const history = positionEpochHistory.value
  for (let index = timelineDeviationIndex + 1; index <= targetIndex; index += 1) {
    deviationPoints.value.push([
      history.getValue('E', index) ?? 0,
      history.getValue('N', index) ?? 0,
      history.getValue('QUALITY', index) ?? 0,
    ])
    trimHistory(deviationPoints.value)
  }
  timelineDeviationIndex = targetIndex
  deviationPointsDirty = true
}

function appendTimelineMapThrough(targetIndex: number): void {
  const history = mapPositionEpochHistory
  for (let index = timelineMapIndex + 1; index <= targetIndex; index += 1) {
    const longitude = history.getValue('LONGITUDE', index)
    const latitude = history.getValue('LATITUDE', index)
    if (
      longitude === null ||
      latitude === null ||
      (longitude === 0 && latitude === 0) ||
      Math.abs(longitude) > 180 ||
      Math.abs(latitude) > 90
    ) {
      continue
    }
    const previous = mapTrackPoints.value.at(-1)
    if (previous && previous[0] === longitude && previous[1] === latitude) continue
    mapTrackPoints.value.push([
      longitude,
      latitude,
      history.getValue('QUALITY', index) ?? 0,
    ])
    trimHistory(mapTrackPoints.value)
  }
  timelineMapIndex = targetIndex
  mapTrackPointsDirty = true
}

function syncTimelineProjection(elapsedMilliseconds: number): void {
  if (!timelineProjectionActive) return

  runInBatch(() => {
    const deviationTarget =
      positionEpochHistory.value.findNearestElapsedTime(elapsedMilliseconds)
    if (
      deviationTarget < timelineDeviationIndex ||
      deviationTarget - timelineDeviationIndex > TIMELINE_INCREMENTAL_POINT_LIMIT
    ) {
      rebuildDeviationFromPositionHistory(MAX_NMEA_DATA, deviationTarget)
    } else if (deviationTarget > timelineDeviationIndex) {
      appendTimelineDeviationThrough(deviationTarget)
    }

    const mapTarget = mapPositionEpochHistory.findNearestElapsedTime(elapsedMilliseconds)
    if (
      mapTarget < timelineMapIndex ||
      mapTarget - timelineMapIndex > TIMELINE_INCREMENTAL_POINT_LIMIT
    ) {
      rebuildMapTrackFromPositionHistory(MAX_NMEA_DATA, mapTarget)
    } else if (mapTarget > timelineMapIndex) {
      appendTimelineMapThrough(mapTarget)
    }
  })
}

function prepareTimelineProjection(mode: 'loaded' | 'replay'): void {
  timelineProjectionActive = mode === 'replay'
  timelineDeviationIndex = positionEpochHistory.value.length - 1
  timelineMapIndex = mapPositionEpochHistory.length - 1

  if (!timelineProjectionActive) return

  runInBatch(() => {
    deviationPoints.value = []
    mapTrackPoints.value = []
    timelineDeviationIndex = -1
    timelineMapIndex = -1
    lastMapTrackEpochTime = ''
    lastMapTrackSource = null
    deviationPointsDirty = true
    mapTrackPointsDirty = true
  })
}

function applyTimelineEpoch(index: number): void {
  applyStatusEpoch(index)
  const statusHistory = statusEpochHistory.value
  if (index < 0 || index >= statusHistory.length) return
  const elapsedMilliseconds = statusHistory.getElapsedTime(index)
  syncTimelineProjection(elapsedMilliseconds)
  if (satelliteDetailEpochHistory.length === 0) return
  const satelliteIndex = satelliteDetailEpochHistory.findNearestElapsedTime(
    elapsedMilliseconds,
  )
  if (satelliteIndex >= 0) {
    satelliteSnrData.value = satelliteDetailEpochHistory.getSnapshot(satelliteIndex)
  }
}

function addGgaData(data: GgaData) {
  ggaData.value.push(data)
  trimHistory(ggaData.value)
  ggaDataDirty = true
  publishPendingData()
}

function timeArrToString(time: number[]): string {
  const pad2 = (value: number) => String(Math.trunc(value)).padStart(2, '0')
  const seconds = Number(time[5] ?? 0).toFixed(3).padStart(6, '0')
  return `20${pad2(time[0])}/${pad2(time[1])}/${pad2(time[2])} ${pad2(time[3])}:${pad2(time[4])}:${seconds}`
}

function addSatelliteSnrData(data: SatelliteSnrData) {
  const item = {
    prn: data.prn,
    elevation: parseFloat(String(data.elevation)) || 0,
    azimuth: parseFloat(String(data.azimuth)) || 0,
    snr: parseFloat(String(data.snr)) || 0,
    constellation: data.constellation,
    timestamp: new Date().toISOString()
  }
  latestSatelliteData.set(`${item.constellation}-${item.prn}`, item)
  pendingSatelliteDetails.set(`${item.constellation}-${item.prn}`, item)
  satelliteDataDirty = true
  publishPendingData()
}

function commitSatelliteEpoch(rawGgaTime: string): void {
  satelliteEpochHistory.value.append(satelliteEpochAssembler.commit(rawGgaTime))
  satelliteDetailEpochHistory.append(
    rawGgaTime,
    pendingSatelliteDetails.size > 0 ? [...pendingSatelliteDetails.values()] : undefined,
  )
  pendingSatelliteDetails.clear()
  satelliteEpochHistoryDirty = true
  publishPendingData()
}

function clearSatelliteEpochHistory(): void {
  satelliteEpochAssembler.clear()
  satelliteEpochHistoryDirty = false
  satelliteEpochHistory.value.clear()
  triggerRef(satelliteEpochHistory)
}

enum NmeaType {
  GGA = 'GGA',
  GLL = 'GLL',
  GSA = 'GSA',
  RMC = 'RMC',
  VTG = 'VTG',
  GSV = 'GSV',
  GST = 'GST',
  UNKNOWN = 'UNKNOWN',
}

// NMEA数据接口定义
interface NmeaData {
  time: string | null
  firstLatitude: number | null
  firstLongitude: number | null
  latitude: number | null
  longitude: number | null
  altitude: number | null
  enuE: number | null
  enuN: number | null
  speed: number | null
  course: number | null
  satellites: number | null
  selectedSatellites: string[] | null
  pdop: number | null
  hdop: number | null
  vdop: number | null
  status: 'A' | 'V' | null // A=有效, V=无效
  quality: number | null
  mode: string | null
  date: string | null
  raw: string
}

// GGA语句结构
interface GgaData {
  time: string
  latitude: number
  nsIndicator: string
  longitude: number
  ewIndicator: string
  quality: string
  satellites: string
  hdop: string
  altitude: string
  altitudeUnit: string
  geoidHeight: string
  geoidUnit: string
  dgpsAge: string
  dgpsStation: string
}

// GSA语句结构
interface GsaData {
  mode: string
  fixType: string
  selectedSatellites: string[]
  pdop: string
  hdop: string
  vdop: string
}

// RMC语句结构
interface RmcData {
  time: string
  status: string
  latitude: string
  nsIndicator: string
  longitude: string
  ewIndicator: string
  speed: string
  course: string
  date: string
  magneticVariation: string
  variationDirection: string
  mode: string
}

// VTG语句结构
interface VtgData {
  courseTrue: string
  referenceTrue: string
  courseMagnetic: string
  referenceMagnetic: string
  speedKnots: string
  unitKnots: string
  speedKmh: string
  unitKmh: string
  mode: string
}

// GSV语句结构
interface GsvData {
  totalMessages: string
  messageNumber: string
  satellitesInView: string
  satellites: Array<{
    prn: string
    elevation: string
    azimuth: string
    snr: string
  }>
}

// GST语句结构（定位误差统计）
interface GstData {
  time: string
  rms: string
  stdMajor: string
  stdMinor: string
  orient: string
  stdLat: string
  stdLon: string
  stdAlt: string
}

// 添加卫星SNR数据接口
interface SatelliteSnrData extends SatelliteDetailSample {
  prn: string
  elevation: number
  azimuth: number
  snr: number
  constellation: string // GPS, GLONASS, BEIDOU, GALILEO等
  timestamp: string
}

const currentData = ref<NmeaData>({
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
  raw: ''
})

const currentGgaData = ref<GgaData>({
  time: '',
  latitude: 0,
  nsIndicator: '',
  longitude: 0,
  ewIndicator: '',
  quality: '',
  satellites: '',
  hdop: '',
  altitude: '',
  altitudeUnit: '',
  geoidHeight: '',
  geoidUnit: '',
  dgpsAge: '',
  dgpsStation: ''
})

// 将latestPosition移到模块顶层
const latestPosition = computed(() => {
  // 从后往前遍历，找到第一个有效位置
  for (let i = nmeaData.value.length - 1; i >= 0; i--) {
    const data = nmeaData.value[i]
    if (data.latitude !== null && data.longitude !== null) {
      return data
    }
  }
  return null
})

const enableWindow = ref(false);

const latestGgaPosition = computed(() => {
  // 从后往前遍历，找到第一个有效位置
  for (let i = ggaData.value.length - 1; i >= 0; i--) {
    const data = ggaData.value[i]
    if (data.latitude !== null && data.longitude !== null) {
      return data
    }
  }
  return null
})

export function numberToQuality (num: number) {
  // 0：无效解；1：单点定位解；2：伪距差分；4：固定解；5：浮动解。
  switch (num) {
    case 0:
      return t('data.qualityInvalid')
    case 1:
      return t('data.qualitySingle')
    case 2:
      return t('data.qualityDgnss')
    case 4:
      return t('data.qualityFix')
    case 5:
      return t('data.qualityFloat')
    default:
      return t('data.qualityUnknown')
  }
}

function rmcModeToQuality(status: RmcData['status'], mode: string): number {
  if (status !== 'A' || mode === 'N') return 0
  switch (mode) {
    case 'R':
      return 4
    case 'F':
      return 5
    case 'D':
      return 2
    default:
      return 1
  }
}

const streamParser = new NmeaStreamParser()

export function useNmea() {
  // 计算属性：信号质量
  const signalQuality = computed(() => {
    if (!currentData.value.satellites || !currentData.value.hdop) return t('data.signalNone')
    if (currentData.value.satellites >= 8 && currentData.value.hdop <= 2) return t('data.signalExcellent')
    if (currentData.value.satellites >= 4 && currentData.value.hdop <= 5) return t('data.signalGood')
    return t('data.signalFair')
  })

  // 计算属性：定位状态
  const fixStatus = computed(() => {
    return currentData.value.status === 'A' ? t('data.fixPositioned') : t('data.fixNotPositioned')
  })


  // 解析GGA语句
  function parseGga(sentence: string): Partial<NmeaData> {
    const gnssStore = useGnssStore()

    const parts = sentence.split(',')
    if (parts.length < 15) return {}

    let time = ''
    const timeParts = parts[1]
    const hasMatchingSpeed =
      latestSpeedEpochTime === timeParts && latestSpeedKmh !== null
    pendingGgaEpochTime = timeParts
    latestSpeedEpochTime = timeParts
    utcTime[3] = parseInt(timeParts.substring(0, 2))
    utcTime[4] = parseInt(timeParts.substring(2, 4))
    utcTime[5] = parseFloat(timeParts.substring(4))
    if (utcTime[0] !== 0) {
      time = timeArrToString(utcTime)
    }

    const latDeg = Math.floor(parseFloat(parts[2]) / 100)
    const latMin = parseFloat(parts[2]) - latDeg * 100
    const latRes = latDeg + latMin / 60

    const lonDeg = Math.floor(parseFloat(parts[4]) / 100)
    const lonMin = parseFloat(parts[4]) - lonDeg * 100
    const lonRes = lonDeg + lonMin / 60

    const data: GgaData = {
      time: time,
      latitude: latRes,
      nsIndicator: parts[3],
      longitude: lonRes,
      ewIndicator: parts[5],
      quality: parts[6],
      satellites: parts[7],
      hdop: parts[8],
      altitude: parts[9],
      altitudeUnit: parts[10],
      geoidHeight: parts[11],
      geoidUnit: parts[12],
      dgpsAge: parts[13],
      dgpsStation: parts[14].split('*')[0]
    }

    // GSV blocks in the supported receiver stream precede their matching GGA.
    // Commit here so every GGA epoch gets one speed-independent satellite snapshot.
    commitSatelliteEpoch(timeParts)
    addGgaData(data)

    gnssStore.status.utcTime = data.time
    const ggaQuality = parseInt(data.quality) || 0
    gnssStore.status.fixMode = numberToQuality(ggaQuality)
    gnssStore.status.quality = ggaQuality
    gnssStore.status.longitude = parseFloat(lonRes.toFixed(6))
    gnssStore.status.latitude = parseFloat(latRes.toFixed(6))
    gnssStore.status.altitude = parseFloat(data.altitude)
    gnssStore.status.altitudeMsl = parseFloat((parseFloat(data.altitude) + parseFloat(data.geoidHeight)).toFixed(2))
    gnssStore.status.HDOP = data.hdop
    gnssStore.status.satsUsed = data.satellites
    appendMapPositionEpoch(timeParts, lonRes, latRes, ggaQuality)
    if (hasMatchingSpeed && latestSpeedKmh !== null) {
      appendSpeedEpoch(timeParts, latestSpeedKmh, ggaQuality, true)
    } else {
      latestSpeedQuality = ggaQuality
    }
    appendStatusEpoch(timeParts)
    
    return {
      time: data.time,
      latitude: latRes,
      longitude: lonRes,
      altitude: parseFloat(data.altitude) || null,
      satellites: parseInt(data.satellites) || null,
      hdop: parseFloat(data.hdop) || null,
      status: data.quality === '0' ? 'V' : 'A',
      quality: parseInt(data.quality),
      raw: sentence
    }
  }

  // 解析GSV语句
  function parseGsv(sentence: string): Partial<NmeaData> {
    const gnssStore = useGnssStore()
    const parts = sentence.split(',')
    if (parts.length < 8) return {}
    
    const data: GsvData = {
      totalMessages: parts[1],
      messageNumber: parts[2],
      satellitesInView: parts[3],
      satellites: []
    }
    
    // 从语句头部提取星座类型
    const talkerId = sentence.substring(1, 3) // 获取GP, GL, GA, GB, GQ等
    const constellation = getConstellationFromTalkerId(talkerId)
    
    // 解析卫星数据（每颗卫星4个字段）
    for (let i = 4; i < parts.length - 1; i += 4) {
      if (i + 3 < parts.length) {
        let prn:any
        const elevation = parts[i + 1]
        const azimuth = parts[i + 2]
        const snr = parts[i + 3]?.split('*')[0] || ''

        if (constellation === 'GLONASS') {
          prn = parseInt(parts[i]) - 64
        } else {
          prn = parseInt(parts[i])
        }
        
        if (prn) {
          data.satellites.push({
            prn,
            elevation,
            azimuth,
            snr
          })
          
          addSatelliteSnrData({
            prn,
            elevation: parseFloat(elevation) || 0,
            azimuth: parseFloat(azimuth) || 0,
            snr: parseFloat(snr) || 0,
            constellation,
            timestamp: new Date().toISOString()
          })
        }
      }
    }

    satelliteEpochAssembler.addGsv({
      source: talkerId,
      constellation,
      totalMessages: Number(data.totalMessages),
      messageNumber: Number(data.messageNumber),
      satelliteIds: data.satellites.map(satellite => satellite.prn),
    })
    
    gnssStore.status.satsVisible = data.satellitesInView
    
    return {
      satellites: parseInt(data.satellitesInView) || null,
      raw: sentence
    }
  }

  // 解析RMC语句
  function parseRmc(sentence: string): Partial<NmeaData> {
    const gnssStore = useGnssStore()
    const parts = sentence.split(',')
    if (parts.length < 12) return {}
    
    const data: RmcData = {
      time: parts[1],
      status: parts[2],
      latitude: parts[3],
      nsIndicator: parts[4],
      longitude: parts[5],
      ewIndicator: parts[6],
      speed: parts[7],
      course: parts[8],
      date: parts[9],
      magneticVariation: parts[10],
      variationDirection: parts[11],
      mode: parts[12]?.split('*')[0] || ''
    }
    
    // 计算速度（节转km/h）
    const speedKnots = parseFloat(data.speed) || 0
    const speedKmh = speedKnots * 1.852
    gnssStore.status.velocity = speedKmh.toFixed(2)
    const timeParts = data.time // Hhmmss.ss
    const dateParts = data.date // ddmmyy
    utcTime[0] = parseInt(dateParts.substring(4, 6))
    utcTime[1] = parseInt(dateParts.substring(2, 4))
    utcTime[2] = parseInt(dateParts.substring(0, 2))
    utcTime[3] = parseInt(timeParts.substring(0, 2))
    utcTime[4] = parseInt(timeParts.substring(2, 4))
    utcTime[5] = parseFloat(timeParts.substring(4))
    gnssStore.status.utcTime = timeArrToString(utcTime)

    const latDeg = Math.floor(parseFloat(parts[3]) / 100)
    const latMin = parseFloat(parts[3]) - latDeg * 100
    const latRes = latDeg + latMin / 60

    const lonDeg = Math.floor(parseFloat(parts[5]) / 100)
    const lonMin = parseFloat(parts[5]) - lonDeg * 100
    const lonRes = lonDeg + lonMin / 60

    // 用 RMC 定位补充轨迹：RMC 是标准位置语句，许多 NMEA 流（如 RMC-only
    // 或 GGA 未定位）不含可用 GGA 定位，若仅依赖 GGA 则轨迹图会空白。
    // RMC 携带有效定位（status=A）时同样写入轨迹，保证导入数据可见。
    const rmcLon = lonRes
    const rmcLat = latRes
    const rmcPosValid =
      data.status === 'A' &&
      Number.isFinite(rmcLon) &&
      Number.isFinite(rmcLat) &&
      !(rmcLon === 0 && rmcLat === 0) &&
      Math.abs(rmcLat) <= 90 &&
      Math.abs(rmcLon) <= 180
    const rmcQuality = rmcModeToQuality(data.status, data.mode)
    const hasMatchingGga =
      lastMapTrackEpochTime === data.time && lastMapTrackSource === 'GGA'
    if (rmcPosValid) {
      const accepted = upsertMapTrackPoint(rmcLon, rmcLat, rmcQuality, data.time, 'RMC')
      if (accepted) {
        gnssStore.status.longitude = parseFloat(rmcLon.toFixed(6))
        gnssStore.status.latitude = parseFloat(rmcLat.toFixed(6))
        gnssStore.status.quality = rmcQuality
        gnssStore.status.fixMode = numberToQuality(rmcQuality)
        appendMapPositionEpoch(data.time, rmcLon, rmcLat, rmcQuality)
      }
    }
    appendSpeedEpoch(
      data.time,
      speedKmh,
      hasMatchingGga ? gnssStore.status.quality : rmcQuality,
      true,
    )
    appendStatusEpoch(data.time)

    return {
      time: timeArrToString(utcTime),
      date: data.date,
      latitude: latRes,
      longitude: lonRes,
      speed: speedKmh,
      course: parseFloat(data.course) || null,
      status: data.status as 'A' | 'V' | null,
      raw: sentence
    }
  }

  // 解析VTG语句
  function parseVtg(sentence: string): Partial<NmeaData> {
    const gnssStore = useGnssStore()
    const parts = sentence.split(',')
    if (parts.length < 9) return {}
    
    const data: VtgData = {
      courseTrue: parts[1],
      referenceTrue: parts[2],
      courseMagnetic: parts[3],
      referenceMagnetic: parts[4],
      speedKnots: parts[5],
      unitKnots: parts[6],
      speedKmh: parts[7],
      unitKmh: parts[8],
      mode: parts[9]?.split('*')[0] || ''
    }
    
    const speedKmh = parseFloat(data.speedKmh) || 0
    gnssStore.status.velocity = speedKmh.toFixed(2)
    appendSpeedEpoch(latestSpeedEpochTime, speedKmh, latestSpeedQuality, true)
    appendStatusEpoch(latestSpeedEpochTime)
    
    return {
      speed: speedKmh,
      course: parseFloat(data.courseTrue) || null,
      raw: sentence
    }
  }

  function parseGsa(sentence: string): Partial<NmeaData> {
    const gnssStore = useGnssStore()
    const parts = sentence.split(',')
    if (parts.length < 14) return {}
    const data: GsaData = {
      mode: parts[1],
      fixType: parts[2],
      selectedSatellites: parts.slice(3, 14).filter(Boolean),
      pdop: parts[15],
      hdop: parts[16],
      vdop: parts[17],
    }
    gnssStore.status.PDOP = data.pdop
    gnssStore.status.HDOP = data.hdop
    return {
      mode: data.mode,
      selectedSatellites: data.selectedSatellites,
      pdop: parseFloat(data.pdop),
      hdop: parseFloat(data.hdop),
      vdop: parseFloat(data.vdop),
      raw: sentence
    }
  }

  // 解析GST语句（定位误差统计）
  function parseGst(sentence: string): Partial<NmeaData> {
    const gnssStore = useGnssStore()
    const parts = sentence.split(',')
    if (parts.length < 9) return {}

    const data: GstData = {
      time: parts[1],
      rms: parts[2],
      stdMajor: parts[3],
      stdMinor: parts[4],
      orient: parts[5],
      stdLat: parts[6],
      stdLon: parts[7],
      stdAlt: parts[8].split('*')[0],
    }

    const stdLat = parseFloat(data.stdLat) || 0
    const stdLon = parseFloat(data.stdLon) || 0
    const stdAlt = parseFloat(data.stdAlt) || 0

    const twoDAcc = Math.hypot(stdLat, stdLon)
    const threeDAcc = Math.hypot(stdLat, stdLon, stdAlt)

    gnssStore.status.twoDAcc = twoDAcc.toFixed(2)
    gnssStore.status.threeDAcc = threeDAcc.toFixed(2)
    appendStatusEpoch(data.time)

    return {
      raw: sentence,
    }
  }

  // 主解析函数
  function parseNmeaInternal(sentence: string): NmeaType {
    if (!sentence || !sentence.startsWith('$')) {
      // return { ...currentData.value, raw: sentence }
      return NmeaType.UNKNOWN
    }

    if (!validateNmeaChecksum(sentence)) {
      console.warn('Invalid checksum:', sentence)
      // return { ...currentData.value, raw: sentence }
      return NmeaType.UNKNOWN
    }

    let parsedData: Partial<NmeaData> = {}

    if (sentence.includes('GGA')) {
      parsedData = parseGga(sentence)
      const newData = {
        ...currentData.value,
        ...parsedData,
      }

      if (firstLLh === null) {
        firstLLh = [newData.latitude, newData.longitude, newData.altitude];
      }

      newData.firstLatitude = firstLLh[0];
      newData.firstLongitude = firstLLh[1];

      if (!newData || !newData.latitude || !newData.longitude || !newData.firstLatitude || !newData.firstLongitude) {
        return NmeaType.UNKNOWN;
      }

      let enuEN = llhToEnu(newData.latitude, newData.longitude, newData.firstLatitude, newData.firstLongitude);
      newData.enuE = enuEN[0];
      newData.enuN = enuEN[1];

      currentData.value = newData;

      appendPositionEpoch(newData)
      addNmeaData(newData);

      return NmeaType.GGA
    } else if (sentence.includes('RMC')) {
      parsedData = parseRmc(sentence)
      currentData.value = {
        ...currentData.value,
        ...parsedData,
      }
      return NmeaType.RMC
    } else if (sentence.includes('VTG')) {
      parsedData = parseVtg(sentence)
      currentData.value = {
        ...currentData.value,
        ...parsedData,
      }
      return NmeaType.VTG
    } else if (sentence.includes('GSV')) {
      parsedData = parseGsv(sentence)
      return NmeaType.GSV
    } else if (sentence.includes('GSA')) {
      parsedData = parseGsa(sentence)
      return NmeaType.GSA
    } else if (sentence.includes('GST')) {
      parsedData = parseGst(sentence)
      return NmeaType.GST
    } else {
      return NmeaType.UNKNOWN
    }
  }

  function parseNmea(sentence: string): NmeaType {
    return runInBatch(() => parseNmeaInternal(sentence))
  }

  // 批量解析函数
  function parseNmeaBatch(sentences: string[]): NmeaData[] {
    // return sentences.map(sentence => parseNmea(sentence.trim()))
    console.warn('parseNmeaBatch not supported')
    return new Array<NmeaData>()
  }

  // 获取统计数据
  function getStatistics() {
    const validPositions = nmeaData.value.filter(d => 
      d.latitude !== null && d.longitude !== null
    )
    
    return {
      totalRecords: nmeaData.value.length,
      validPositions: validPositions.length,
      avgSatellites: validPositions.reduce((sum, d) => sum + (d.satellites || 0), 0) / validPositions.length || 0,
      avgHdop: validPositions.reduce((sum, d) => sum + (d.hdop || 0), 0) / validPositions.length || 0,
    }
  }

  // 清除数据
  function clearData() {
    batchDepth = 0
    nmeaDataDirty = false
    ggaDataDirty = false
    deviationPointsDirty = false
    mapTrackPointsDirty = false
    satelliteDataDirty = false
    satelliteEpochHistoryDirty = false
    positionEpochHistoryDirty = false
    speedEpochHistoryDirty = false
    statusEpochHistoryDirty = false
    firstLLh = null
    firstAltitude = null
    pendingGgaEpochTime = ''
    latestSpeedEpochTime = ''
    latestSpeedKmh = null
    latestSpeedQuality = 0
    lastMapTrackEpochTime = ''
    lastMapTrackSource = null
    timelineProjectionActive = false
    timelineDeviationIndex = -1
    timelineMapIndex = -1
    latestSatelliteData.clear()
    pendingSatelliteDetails.clear()
    satelliteEpochAssembler.clear()
    satelliteDetailEpochHistory.clear()
    utcTime.fill(0)
    streamParser.clear()
    nmeaData.value = []
    ggaData.value = []
    deviationPoints.value = []
    mapTrackPoints.value = []
    satelliteSnrData.value = []  // 确保清除卫星数据
    satelliteEpochHistory.value.clear()
    triggerRef(satelliteEpochHistory)
    positionEpochHistory.value.clear()
    triggerRef(positionEpochHistory)
    speedEpochHistory.value.clear()
    triggerRef(speedEpochHistory)
    mapPositionEpochHistory.clear()
    statusEpochHistory.value.clear()
    triggerRef(statusEpochHistory)
    currentData.value = {
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
      raw: ''
    }
    currentGgaData.value = {
      time: '',
      latitude: 0,
      nsIndicator: '',
      longitude: 0,
      ewIndicator: '',
      quality: '',
      satellites: '',
      hdop: '',
      altitude: '',
      altitudeUnit: '',
      geoidHeight: '',
      geoidUnit: '',
      dgpsAge: '',
      dgpsStation: ''
    }
    // 文件或数据源切换后，不保留上一次的状态或地图位置。
    const gnssStore = useGnssStore()
    gnssStore.resetStatus()
    gnssStore.resetTrack()
  }

  // 添加处理原始数据的函数
  function processRawData(rawData: string): void {
    runInBatch(() => {
      for (const sentence of streamParser.push(rawData)) parseNmeaInternal(sentence.trim())
    })
  }

  // 添加清除缓冲区的函数
  function clearBuffer(): void {
    streamParser.clear()
  }
  
  // 根据Talker ID判断星座类型
  function getConstellationFromTalkerId(talkerId: string): string {
    switch (talkerId) {
      case 'GP':
        return 'GPS'
      case 'GL':
        return 'GLONASS'
      case 'GA':
        return 'GALILEO'
      case 'GB':
        return 'BEIDOU'
      case 'GQ':
        return 'QZSS'
      default:
        return 'UNKNOWN'
    }
  }
  
  // 根据PRN号判断星座类型（保留作为备用）
  function getConstellationFromPrn(prn: string): string {
    const prnNum = parseInt(prn)
    if (isNaN(prnNum)) return 'UNKNOWN'
    
    if (prnNum >= 1 && prnNum <= 32) return 'GPS'
    if (prnNum >= 65 && prnNum <= 96) return 'GLO'
    if (prnNum >= 33 && prnNum <= 64) return 'SBS' // WAAS, EGNOS, etc.
    if (prnNum >= 193 && prnNum <= 200) return 'QZS'
    if (prnNum >= 201 && prnNum <= 235) return 'BDS'
    if (prnNum >= 301 && prnNum <= 336) return 'GAL'
    
    return 'UNKNOWN'
  }

    return {
      nmeaData,
      deviationPoints,
      mapTrackPoints,
      currentData,
      currentGgaData,
      latestPosition,
      latestGgaPosition,
      satelliteSnrData, // 添加卫星SNR数据
      satelliteEpochHistory,
      satelliteDetailEpochHistory,
      positionEpochHistory,
      speedEpochHistory,
      statusEpochHistory,
      signalQuality,
      fixStatus,
      enableWindow,
      // toggleSlideWindow,
      parseNmea,
      parseNmeaBatch,
      beginBulkImport,
      endBulkImport,
      rebuildMapTrackFromPositionHistory,
      rebuildDeviationFromPositionHistory,
      getStatistics,
      clearData,
      applyStatusEpoch,
      applyTimelineEpoch,
      prepareTimelineProjection,
      clearSatelliteEpochHistory,
      processRawData,  // 导出新函数
      clearBuffer     // 导出新函数
    }
  }

// 示例使用
// const { parseNmea, currentData, latestPosition } = useNmea()
// const result = parseNmea('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47')
