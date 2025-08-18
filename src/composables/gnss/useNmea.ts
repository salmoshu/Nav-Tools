import { ref, computed } from 'vue'

// NMEA数据接口定义
export interface NmeaData {
  timestamp: string
  latitude: number | null
  longitude: number | null
  altitude: number | null
  speed: number | null
  course: number | null
  satellites: number | null
  hdop: number | null
  status: 'A' | 'V' | null // A=有效, V=无效
  mode: string | null
  date: string | null
  time: string | null
  raw: string
}

// GGA语句结构
interface GgaData {
  time: string
  latitude: string
  nsIndicator: string
  longitude: string
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

// GLL语句结构
interface GllData {
  latitude: string
  nsIndicator: string
  longitude: string
  ewIndicator: string
  time: string
  status: string
  mode: string
}

// GSA语句结构
interface GsaData {
  mode: string
  fixType: string
  satellites: string[]
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

export function useNmea() {
  const nmeaData = ref<NmeaData[]>([])
  const currentData = ref<NmeaData>({
    timestamp: new Date().toISOString(),
    latitude: null,
    longitude: null,
    altitude: null,
    speed: null,
    course: null,
    satellites: null,
    hdop: null,
    status: null,
    mode: null,
    date: null,
    time: null,
    raw: ''
  })

  // 计算属性：最新位置
  const latestPosition = computed(() => {
    const validData = nmeaData.value.filter(d => d.latitude !== null && d.longitude !== null)
    return validData.length > 0 ? validData[validData.length - 1] : null
  })

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

  // 工具函数：解析度分格式为十进制度
  function parseCoordinate(coord: string, direction: string): number {
    if (!coord || !direction) return 0
    
    const degrees = parseFloat(coord.substring(0, 2))
    const minutes = parseFloat(coord.substring(2))
    const decimal = degrees + minutes / 60
    
    return direction === 'S' || direction === 'W' ? -decimal : decimal
  }

  // 工具函数：计算校验和
  function calculateChecksum(sentence: string): string {
    let checksum = 0
    for (let i = 1; i < sentence.length; i++) {
      checksum ^= sentence.charCodeAt(i)
    }
    return checksum.toString(16).toUpperCase().padStart(2, '0')
  }

  // 工具函数：验证校验和
  function validateChecksum(sentence: string): boolean {
    const asteriskIndex = sentence.indexOf('*')
    if (asteriskIndex === -1) return false
    
    const data = sentence.substring(0, asteriskIndex)
    const checksum = sentence.substring(asteriskIndex + 1)
    return calculateChecksum(data) === checksum
  }

  // 解析GGA语句
  function parseGga(sentence: string): Partial<NmeaData> {
    const parts = sentence.split(',')
    if (parts.length < 15) return {}
    
    const data: GgaData = {
      time: parts[1],
      latitude: parts[2],
      nsIndicator: parts[3],
      longitude: parts[4],
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
    
    return {
      time: data.time,
      latitude: parseCoordinate(data.latitude, data.nsIndicator),
      longitude: parseCoordinate(data.longitude, data.ewIndicator),
      altitude: parseFloat(data.altitude) || null,
      satellites: parseInt(data.satellites) || null,
      hdop: parseFloat(data.hdop) || null,
      status: data.quality === '0' ? 'V' : 'A',
      raw: sentence
    }
  }

  // 解析GLL语句
  function parseGll(sentence: string): Partial<NmeaData> {
    const parts = sentence.split(',')
    if (parts.length < 7) return {}
    
    const data: GllData = {
      latitude: parts[1],
      nsIndicator: parts[2],
      longitude: parts[3],
      ewIndicator: parts[4],
      time: parts[5],
      status: parts[6],
      mode: parts[7]?.split('*')[0] || ''
    }
    
    return {
      time: data.time,
      latitude: parseCoordinate(data.latitude, data.nsIndicator),
      longitude: parseCoordinate(data.longitude, data.ewIndicator),
      status: data.status as 'A' | 'V' | null,
      raw: sentence
    }
  }

  // 解析RMC语句
  function parseRmc(sentence: string): Partial<NmeaData> {
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
    
    return {
      time: data.time,
      date: data.date,
      latitude: parseCoordinate(data.latitude, data.nsIndicator),
      longitude: parseCoordinate(data.longitude, data.ewIndicator),
      speed: speedKmh,
      course: parseFloat(data.course) || null,
      status: data.status as 'A' | 'V' | null,
      raw: sentence
    }
  }

  // 解析VTG语句
  function parseVtg(sentence: string): Partial<NmeaData> {
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
    
    return {
      speed: speedKmh,
      course: parseFloat(data.courseTrue) || null,
      raw: sentence
    }
  }

  // 主解析函数
  function parseNmea(sentence: string): NmeaData {
    if (!sentence || !sentence.startsWith('$')) {
      return { ...currentData.value, raw: sentence }
    }
    
    if (!validateChecksum(sentence)) {
      console.warn('Invalid checksum:', sentence)
      return { ...currentData.value, raw: sentence }
    }
    
    let parsedData: Partial<NmeaData> = {}
    
    if (sentence.includes('GGA')) {
      parsedData = parseGga(sentence)
    } else if (sentence.includes('GLL')) {
      parsedData = parseGll(sentence)
    } else if (sentence.includes('RMC')) {
      parsedData = parseRmc(sentence)
    } else if (sentence.includes('VTG')) {
      parsedData = parseVtg(sentence)
    }
    
    const newData = {
      ...currentData.value,
      ...parsedData,
      timestamp: new Date().toISOString()
    }
    
    currentData.value = newData
    nmeaData.value.push(newData)
    
    // 限制历史数据数量
    if (nmeaData.value.length > 1000) {
      nmeaData.value.shift()
    }
    
    return newData
  }

  // 批量解析函数
  function parseNmeaBatch(sentences: string[]): NmeaData[] {
    return sentences.map(sentence => parseNmea(sentence.trim()))
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
      lastUpdate: validPositions.length > 0 ? validPositions[validPositions.length - 1].timestamp : null
    }
  }

  // 清除数据
  function clearData() {
    nmeaData.value = []
    currentData.value = {
      timestamp: new Date().toISOString(),
      latitude: null,
      longitude: null,
      altitude: null,
      speed: null,
      course: null,
      satellites: null,
      hdop: null,
      status: null,
      mode: null,
      date: null,
      time: null,
      raw: ''
    }
  }

  return {
    nmeaData,
    currentData,
    latestPosition,
    signalQuality,
    fixStatus,
    parseNmea,
    parseNmeaBatch,
    getStatistics,
    clearData
  }
}

// 示例使用
// const { parseNmea, currentData, latestPosition } = useNmea()
// const result = parseNmea('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47')