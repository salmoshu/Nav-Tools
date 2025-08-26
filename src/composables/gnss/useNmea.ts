import { ref, computed } from 'vue'
import { useGnssStore } from '@/stores/gnss'

const MAX_NMEA_DATA = 3600
const MAX_SNR_DATA = 50*3

// 使用环形缓冲区管理nmeaData
let nmeaDataIndex = 0
let satelliteSnrIndex = 0
const nmeaRegex = /\$(?:[^*]*)\*[0-9A-F]{2}/gi;
const nmeaDataBuffer = Array(MAX_NMEA_DATA).fill(null)
const nmeaData = ref<NmeaData[]>([])
const satelliteSnrBuffer = Array(MAX_SNR_DATA).fill(null)
const satelliteSnrData = ref<SatelliteSnrData[]>([])

// 优化parseNmea函数中的数组操作
function addNmeaData(data: NmeaData) {
  nmeaDataBuffer[nmeaDataIndex] = data
  nmeaDataIndex = (nmeaDataIndex + 1) % MAX_NMEA_DATA
  
  // 更新响应式数据
  // nmeaData.value = nmeaDataBuffer.filter(item => item !== null)
  nmeaData.value = nmeaDataBuffer.slice(0, nmeaDataIndex)
}

function addSatelliteSnrData(data: SatelliteSnrData) {
  satelliteSnrBuffer[satelliteSnrIndex] = {
    prn: data.prn,
    elevation: parseFloat(String(data.elevation)) || 0,
    azimuth: parseFloat(String(data.azimuth)) || 0,
    snr: parseFloat(String(data.snr)) || 0,
    constellation: data.constellation,
    timestamp: new Date().toISOString()
  }

  // 通常不会超过50*3，为了进行异常处理，则覆盖前面的卫星信息
  satelliteSnrIndex = (satelliteSnrIndex + 1) % MAX_SNR_DATA

  // 更新响应式数据，保留最新3s内的数据
  satelliteSnrData.value = satelliteSnrBuffer.filter(item => item !== null && item.timestamp > new Date(Date.now() - 3000).toISOString())
}

enum NmeaType {
  GGA = 'GGA',
  GLL = 'GLL',
  GSA = 'GSA',
  RMC = 'RMC',
  VTG = 'VTG',
  GSV = 'GSV',
  UNKNOWN = 'UNKNOWN',
}

// NMEA数据接口定义
interface NmeaData {
  timestamp: string
  latitude: number | null
  longitude: number | null
  altitude: number | null
  speed: number | null
  course: number | null
  satellites: number | null
  selectedSatellites: string[] | null
  pdop: number | null
  hdop: number | null
  vdop: number | null
  status: 'A' | 'V' | null // A=有效, V=无效
  mode: string | null
  date: string | null
  time: string | null
  raw: string
}

// GGA语句结构
export interface GgaData {
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
  timestamp: new Date().toISOString(),
  latitude: null,
  longitude: null,
  altitude: null,
  speed: null,
  course: null,
  satellites: null,
  selectedSatellites: null,
  pdop: null,
  hdop: null,
  vdop: null,
  status: null,
  mode: null,
  date: null,
  time: null,
  raw: ''
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

export function useNmea() {
  // 添加数据缓冲区
  const buffer = ref('')

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
    // 从索引1开始（跳过$），到*之前结束
    const asteriskIndex = sentence.indexOf('*')
    const endIndex = asteriskIndex !== -1 ? asteriskIndex : sentence.length
    
    for (let i = 1; i < endIndex; i++) {
      checksum ^= sentence.charCodeAt(i)
    }
    return checksum.toString(16).toUpperCase().padStart(2, '0')
  }
  
  // 工具函数：验证校验和
  function validateChecksum(sentence: string): boolean {
    // 检查是否以$开头
    if (!sentence.startsWith('$')) {
      return false
    }
    
    const asteriskIndex = sentence.indexOf('*')
    if (asteriskIndex === -1 || asteriskIndex >= sentence.length - 1) {
      return false
    }
    
    // 提取校验和（仅取*后两位）
    const checksum = sentence.substring(asteriskIndex + 1, asteriskIndex + 3).toUpperCase()
    
    // 验证校验和格式是否为两位十六进制数
    if (!/^[0-9A-F]{2}$/.test(checksum)) {
      return false
    }
    
    // 计算校验和
    const calculatedChecksum = calculateChecksum(sentence)
    
    // 开发环境下输出详细信息
    if (import.meta.env.DEV && calculatedChecksum !== checksum) {
      console.warn(`校验和不匹配: 计算值=${calculatedChecksum}, 实际值=${checksum}, 语句=${sentence}`)
    }
    
    return calculatedChecksum === checksum
  }

  // 解析GGA语句
  function parseGga(sentence: string): Partial<NmeaData> {
    const gnssStore = useGnssStore()

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

    gnssStore.status.utcTime = data.time
    gnssStore.status.fixMode = '???'
    gnssStore.status.TTFF = '???'
    gnssStore.status.longitude = String(parseFloat(data.longitude) / 100)
    gnssStore.status.latitude = String(parseFloat(data.latitude) / 100)
    gnssStore.status.altitude = data.altitude
    gnssStore.status.altitudeMsl = data.geoidHeight
    gnssStore.status.velocity = '???'
    gnssStore.status.threeDAcc = '???'
    gnssStore.status.twoDAcc = '???'
    gnssStore.status.PDOP = '???'
    gnssStore.status.HDOP = data.hdop
    gnssStore.status.satsUsed = data.satellites
    gnssStore.status.satsVisible = '???'
    
    return {
      time: data.time,
      timestamp: new Date().toISOString(),
      latitude: parseCoordinate(data.latitude, data.nsIndicator),
      longitude: parseCoordinate(data.longitude, data.ewIndicator),
      altitude: parseFloat(data.altitude) || null,
      satellites: parseInt(data.satellites) || null,
      hdop: parseFloat(data.hdop) || null,
      status: data.quality === '0' ? 'V' : 'A',
      raw: sentence
    }
  }

  // 解析GSV语句
  function parseGsv(sentence: string): Partial<NmeaData> {
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
    
    // 限制SNR数据数量
    if (satelliteSnrData.value.length > MAX_SNR_DATA) {
      satelliteSnrData.value.shift()
    }
    
    return {
      satellites: parseInt(data.satellitesInView) || null,
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

  function parseGsa(sentence: string): Partial<NmeaData> {
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
    return {
      mode: data.mode,
      selectedSatellites: data.selectedSatellites,
      pdop: parseFloat(data.pdop),
      hdop: parseFloat(data.hdop),
      vdop: parseFloat(data.vdop),
      raw: sentence
    }
  }

  // 主解析函数
  function parseNmea(sentence: string): NmeaType {
    if (!sentence || !sentence.startsWith('$')) {
      // return { ...currentData.value, raw: sentence }
      return NmeaType.UNKNOWN
    }

    if (!validateChecksum(sentence)) {
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
        timestamp: new Date().toISOString()
      }
      currentData.value = newData
      addNmeaData(newData)
      return NmeaType.GGA
    } else if (sentence.includes('GLL')) {
      parsedData = parseGll(sentence)
      return NmeaType.GLL
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
    } else {
      return NmeaType.UNKNOWN
    }
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
      lastUpdate: validPositions.length > 0 ? validPositions[validPositions.length - 1].timestamp : null
    }
  }

  // 清除数据
  function clearData() {
    nmeaData.value = []
    satelliteSnrData.value = []  // 确保清除卫星数据
    currentData.value = {
      timestamp: new Date().toISOString(),
      latitude: null,
      longitude: null,
      altitude: null,
      speed: null,
      course: null,
      satellites: null,
      selectedSatellites: null,
      pdop: null,
      hdop: null,
      vdop: null,
      status: null,
      mode: null,
      date: null,
      time: null,
      raw: ''
    }
  }

  // 添加处理原始数据的函数
  function processRawData(rawData: string): void {
    // 将新数据追加到缓冲区
    buffer.value += rawData;

    // 限制缓冲区大小，防止内存泄漏
    if (buffer.value.length > 50000) {
      buffer.value = buffer.value.substring(buffer.value.length - 10000)
    }

    // 查找第一个 $ 的位置
    const firstDollarIndex = buffer.value.indexOf('$');
    if (firstDollarIndex > 0) {
      // 丢弃 $ 之前的无效数据
      buffer.value = buffer.value.substring(firstDollarIndex);
    } else if (firstDollarIndex === -1) {
      // 如果缓冲区中没有 $，清空缓冲区
      buffer.value = '';
      return;
    }

    const completeSentences: string[] = [];

    // 提取所有完整的 NMEA 语句
    let lastMatchEnd = 0
    const matches = Array.from(buffer.value.matchAll(nmeaRegex));
    for (const match of matches) {
      completeSentences.push(match[0]);
      lastMatchEnd = match.index + match[0].length;
    }

    // 更新缓冲区，丢弃已处理的完整语句及无法构成完整语句的片段
    if (completeSentences.length > 0) {
      // 保留最后一个完整语句结束后的内容
      buffer.value = buffer.value.substring(lastMatchEnd);
    } else {
      // 如果没有找到完整语句，检查缓冲区中是否有可能是完整语句的开头
      const lastDollarIndex = buffer.value.lastIndexOf('$');
      if (lastDollarIndex > 0) {
        // 保留最后一个 $ 之后的内容，丢弃之前的数据
        buffer.value = buffer.value.substring(lastDollarIndex);
      } else if (lastDollarIndex === -1 && buffer.value.length > 0) {
        // 如果没有 $，清空缓冲区
        buffer.value = '';
      }
    }

    for (const sentence of completeSentences) {
      const type = parseNmea(sentence.trim());
      // 打印时间戳
      // const now = new Date();
      // const timestamp = now.toLocaleTimeString() + '.' + now.getMilliseconds().toString().padStart(3, '0');
      // console.log(timestamp, type)
    }
  }

  // 添加清除缓冲区的函数
  function clearBuffer(): void {
    buffer.value = ''
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
      currentData,
      latestPosition,
      satelliteSnrData, // 添加卫星SNR数据
      signalQuality,
      fixStatus,
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