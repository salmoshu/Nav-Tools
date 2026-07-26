import { ref, shallowRef, triggerRef, computed } from 'vue'
import { useGnssStore } from '@/stores/gnss'
import { NmeaStreamParser, validateNmeaChecksum } from '@/core/data/NmeaStreamParser'

const MAX_NMEA_DATA = 12*3600    // 12h
const HISTORY_TRIM_SIZE = 3600
const SATELLITE_TTL_MS = 3000
const nmeaData = shallowRef<NmeaData[]>([])
const ggaData = shallowRef<GgaData[]>([])
const deviationPoints = shallowRef<Array<[number, number, number]>>([])
const mapTrackPoints = shallowRef<Array<[number, number, number]>>([])
const satelliteSnrData = shallowRef<SatelliteSnrData[]>([])
const latestSatelliteData = new Map<string, SatelliteSnrData>()
const utcTime = [0, 0, 0, 0, 0, 0]
let firstLLh: [number | null, number | null, number | null] | null = null
let batchDepth = 0
let nmeaDataDirty = false
let ggaDataDirty = false
let deviationPointsDirty = false
let mapTrackPointsDirty = false
let satelliteDataDirty = false

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
    mapTrackPoints.value.push([
      Number(data.longitude),
      Number(data.latitude),
      Number(data.quality ?? 0),
    ])
    trimHistory(mapTrackPoints.value)
    mapTrackPointsDirty = true
  }
  publishPendingData()
}

function addGgaData(data: GgaData) {
  ggaData.value.push(data)
  trimHistory(ggaData.value)
  ggaDataDirty = true
  publishPendingData()
}

function timeArrToString (time: any) {
  // time = [0, 0, 0, 0, 0, 0]
  return `20${time[0]}/${time[1]}/${time[2]} ${time[3]}:${time[4]}:${time[5]}`
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
  satelliteDataDirty = true
  publishPendingData()
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
interface SatelliteSnrData {
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
      return 'Invalid'
    case 1:
      return 'Single'
    case 2:
      return 'DGNSS'
    case 4:
      return 'Fix'
    case 5:
      return 'Float'
    default:
      return 'Unknown'
  }
}

const streamParser = new NmeaStreamParser()

export function useNmea() {
  // 计算属性：信号质量
  const signalQuality = computed(() => {
    if (!currentData.value.satellites || !currentData.value.hdop) return '无信号'
    if (currentData.value.satellites >= 8 && currentData.value.hdop <= 2) return '优秀'
    if (currentData.value.satellites >= 4 && currentData.value.hdop <= 5) return '良好'
    return '一般'
  })

  // 计算属性：定位状态
  const fixStatus = computed(() => {
    return currentData.value.status === 'A' ? '已定位' : '未定位'
  })


  // 解析GGA语句
  function parseGga(sentence: string): Partial<NmeaData> {
    const gnssStore = useGnssStore()

    const parts = sentence.split(',')
    if (parts.length < 15) return {}

    let time = ''
    const timeParts = parts[1]
    utcTime[3] = parseInt(timeParts.substring(0, 2))
    utcTime[4] = parseInt(timeParts.substring(2, 4))
    utcTime[5] = parseFloat(timeParts.substring(4, 6))
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

    addGgaData(data)

    gnssStore.status.utcTime = data.time
    gnssStore.status.fixMode = numberToQuality(parseInt(data.quality))
    gnssStore.status.quality = parseInt(data.quality) || 0
    gnssStore.status.longitude = parseFloat(lonRes.toFixed(6))
    gnssStore.status.latitude = parseFloat(latRes.toFixed(6))
    gnssStore.status.altitude = parseFloat(data.altitude)
    gnssStore.status.altitudeMsl = parseFloat((parseFloat(data.altitude) + parseFloat(data.geoidHeight)).toFixed(2))
    gnssStore.status.HDOP = data.hdop
    gnssStore.status.satsUsed = data.satellites
    
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
    utcTime[5] = parseFloat(timeParts.substring(4, 6))

    const latDeg = Math.floor(parseFloat(parts[3]) / 100)
    const latMin = parseFloat(parts[3]) - latDeg * 100
    const latRes = latDeg + latMin / 60

    const lonDeg = Math.floor(parseFloat(parts[5]) / 100)
    const lonMin = parseFloat(parts[5]) - lonDeg * 100
    const lonRes = lonDeg + lonMin / 60

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

      addNmeaData(newData);

      return NmeaType.GGA
    } else if (sentence.includes('RMC')) {
      parsedData = parseRmc(sentence)
      return NmeaType.RMC
    } else if (sentence.includes('VTG')) {
      parsedData = parseVtg(sentence)
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
    firstLLh = null
    latestSatelliteData.clear()
    utcTime.fill(0)
    streamParser.clear()
    nmeaData.value = []
    ggaData.value = []
    deviationPoints.value = []
    mapTrackPoints.value = []
    satelliteSnrData.value = []  // 确保清除卫星数据
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
    // 通知地图视图：底层 GNSS 数据已清空，应同步清除本地轨迹
    useGnssStore().resetTrack()
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
      signalQuality,
      fixStatus,
      enableWindow,
      // toggleSlideWindow,
      parseNmea,
      parseNmeaBatch,
      getStatistics,
      clearData,
      processRawData,  // 导出新函数
      clearBuffer     // 导出新函数
    }
  }

// 示例使用
// const { parseNmea, currentData, latestPosition } = useNmea()
// const result = parseNmea('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47')
