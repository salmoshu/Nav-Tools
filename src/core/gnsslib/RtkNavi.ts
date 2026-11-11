import type { RtkPostConstellation } from './RtkPost'

export type RtkNaviStreamType = 'serial' | 'file' | 'tcpsvr' | 'tcpcli' | 'ntripcli'
export type RtkNaviInputFormat =
  | 'rtcm2'
  | 'rtcm3'
  | 'oem4'
  | 'ubx'
  | 'swift'
  | 'hemis'
  | 'skytraq'
  | 'javad'
  | 'nvs'
  | 'binex'
  | 'rt17'
  | 'sbf'
  | 'sp3'

export interface RtkNaviInputStream {
  enabled: boolean
  type: RtkNaviStreamType
  path: string
  format: RtkNaviInputFormat
  timeTag: boolean
  replaySpeed: number
}

export interface RtkNaviOptions {
  mode: number
  frequency: number
  elevationMaskDeg: number
  ambiguityResolution: 'off' | 'continuous' | 'instantaneous' | 'fix-and-hold'
  constellations: RtkPostConstellation[]
  baseConfigPath: string
  basePositionMode: 'rtcm' | 'rinexhead' | 'llh'
  baseLatitudeDeg: number
  baseLongitudeDeg: number
  baseHeightM: number
}

export interface RtkNaviSettings {
  executablePath: string
  outputPath: string
  inputs: RtkNaviInputStream[]
  options: RtkNaviOptions
}

export interface RtkNaviStartRequest extends RtkNaviSettings {
  runId: string
}

export type RtkNaviRunState = 'idle' | 'running' | 'stopping' | 'stopped' | 'error'

export interface RtkNaviStatus {
  runId: string
  state: RtkNaviRunState
  outputPath: string
  pid?: number
  error?: string
}

export interface RtkNaviSolution {
  time: string
  latitude: number
  longitude: number
  height: number
  quality: number
  satellites: number
  age: number | null
  ratio: number | null
}

export interface RtkNaviSolutionEvent {
  records?: string[]
  runId: string
  epochs: number
  qualityCounts: Record<number, number>
  solution: RtkNaviSolution
}

export interface RtkNaviLogEvent {
  runId: string
  chunk: string
}

export function createDefaultRtkNaviSettings(): RtkNaviSettings {
  return {
    executablePath: '',
    outputPath: '',
    inputs: [
      createInput('file', true),
      createInput('ntripcli', false),
      createInput('tcpcli', false),
    ],
    options: {
      mode: 2,
      frequency: 2,
      elevationMaskDeg: 15,
      ambiguityResolution: 'continuous',
      constellations: ['G', 'R'],
      baseConfigPath: '',
      basePositionMode: 'rtcm',
      baseLatitudeDeg: 0,
      baseLongitudeDeg: 0,
      baseHeightM: 0,
    },
  }
}

export function buildRtkNaviStreamPath(stream: RtkNaviInputStream): string {
  const streamPath = safeValue(stream.path, '输入流路径').trim()
  if (!streamPath) throw new Error('已启用的输入流必须设置路径')
  if (stream.type !== 'file') return streamPath
  if (!Number.isFinite(stream.replaySpeed) || stream.replaySpeed <= 0) {
    throw new Error('文件回放倍速必须大于 0')
  }
  return `${streamPath}${stream.timeTag ? '::T' : ''}${
    stream.replaySpeed === 1 ? '' : `::x${stream.replaySpeed}`
  }`
}

export function buildRtkNaviConfig(request: RtkNaviSettings, outputPath: string): string {
  if (!Array.isArray(request.inputs) || request.inputs.length !== 3) {
    throw new Error('RTKNAVI 必须配置流动站、基站和改正数三路输入')
  }
  if (!request.inputs[0].enabled) throw new Error('流动站输入必须启用')
  const relative = request.options.mode >= 1 && request.options.mode <= 6
  if (relative && !request.inputs[1].enabled) {
    throw new Error('相对定位模式必须启用基站输入')
  }
  if (
    !Number.isInteger(request.options.mode) ||
    request.options.mode < 0 ||
    request.options.mode > 9
  ) {
    throw new Error('定位模式无效')
  }
  if (![1, 2, 3].includes(request.options.frequency)) throw new Error('频点数无效')
  if (
    !Number.isFinite(request.options.elevationMaskDeg) ||
    request.options.elevationMaskDeg < 0 ||
    request.options.elevationMaskDeg > 90
  ) {
    throw new Error('高度截止角必须在 0 到 90 度之间')
  }
  if (
    !['off', 'continuous', 'instantaneous', 'fix-and-hold'].includes(
      request.options.ambiguityResolution,
    )
  ) {
    throw new Error('模糊度固定模式无效')
  }
  const navsys = navigationSystemMask(request.options.constellations)
  const output = safeValue(outputPath, '解决方案输出路径').trim()
  if (!output) throw new Error('解决方案输出路径无效')

  const lines = [
    'console-passwd =',
    'console-timetype =gpst',
    'console-soltype =deg',
    'console-solflag =3',
  ]
  for (const [index, stream] of request.inputs.entries()) {
    const slot = index + 1
    lines.push(`inpstr${slot}-type =${stream.enabled ? stream.type : 'off'}`)
    lines.push(`inpstr${slot}-path =${stream.enabled ? buildRtkNaviStreamPath(stream) : ''}`)
    lines.push(`inpstr${slot}-format =${stream.format}`)
  }
  lines.push(
    'inpstr2-nmeareq =off',
    'outstr1-type =file',
    `outstr1-path =${output}`,
    'outstr1-format =llh',
    'outstr2-type =off',
    'outstr2-path =',
    'outstr2-format =nmea',
    'logstr1-type =off',
    'logstr2-type =off',
    'logstr3-type =off',
    'misc-svrcycle =10',
    'misc-timeout =30000',
    'misc-reconnect =3000',
    'misc-nmeacycle =0',
    'misc-buffsize =32768',
    'misc-navmsgsel =all',
    'misc-startcmd =',
    'misc-stopcmd =',
    'file-cmdfile1 =',
    'file-cmdfile2 =',
    'file-cmdfile3 =',
    `pos1-posmode =${positionModeName(request.options.mode)}`,
    `pos1-frequency =${['', 'l1', 'l1+l2', 'l1+l2+l5'][request.options.frequency]}`,
    'pos1-soltype =forward',
    `pos1-elmask =${request.options.elevationMaskDeg}`,
    `pos1-navsys =${navsys}`,
    `pos2-armode =${request.options.ambiguityResolution}`,
    'out-solformat =llh',
    'out-outhead =on',
    'out-timesys =gpst',
    'out-timeform =hms',
    'out-timendec =3',
    'out-degform =deg',
    'out-outstat =off',
    'ant1-postype =single',
    `ant2-postype =${request.options.basePositionMode}`,
  )
  if (request.options.basePositionMode === 'llh') {
    assertRange(request.options.baseLatitudeDeg, -90, 90, '基站纬度')
    assertRange(request.options.baseLongitudeDeg, -180, 180, '基站经度')
    if (!Number.isFinite(request.options.baseHeightM)) throw new Error('基站高程无效')
    lines.push(
      `ant2-pos1 =${request.options.baseLatitudeDeg}`,
      `ant2-pos2 =${request.options.baseLongitudeDeg}`,
      `ant2-pos3 =${request.options.baseHeightM}`,
    )
  }
  return `${lines.join('\n')}\n`
}

export function parseRtkNaviSolutionLine(line: string): RtkNaviSolution | null {
  const fields = line.trim().split(/\s+/)
  if (fields.length < 7 || !/^\d{4}\/\d{2}\/\d{2}$/.test(fields[0])) return null
  const latitude = Number(fields[2])
  const longitude = Number(fields[3])
  const height = Number(fields[4])
  const quality = Number(fields[5])
  const satellites = Number(fields[6])
  if (
    ![latitude, longitude, height, quality, satellites].every(Number.isFinite) ||
    !Number.isInteger(quality) ||
    quality < 0 ||
    quality > 9
  ) {
    return null
  }
  return {
    time: `${fields[0]} ${fields[1]}`,
    latitude,
    longitude,
    height,
    quality,
    satellites,
    age: optionalNumber(fields[13]),
    ratio: optionalNumber(fields[14]),
  }
}

function createInput(type: RtkNaviStreamType, enabled: boolean): RtkNaviInputStream {
  return { enabled, type, path: '', format: 'rtcm3', timeTag: true, replaySpeed: 1 }
}

function navigationSystemMask(constellations: RtkPostConstellation[]): number {
  if (!Array.isArray(constellations) || constellations.length === 0) {
    throw new Error('请至少选择一个卫星导航系统')
  }
  const bits: Record<RtkPostConstellation, number> = { G: 1, R: 4, E: 8, J: 16, C: 32, I: 64 }
  let mask = 0
  for (const constellation of new Set(constellations)) {
    if (!(constellation in bits)) throw new Error('卫星导航系统选项无效')
    mask |= bits[constellation]
  }
  return mask
}

function positionModeName(mode: number): string {
  const names = [
    'single',
    'dgps',
    'kinematic',
    'static',
    'static-start',
    'movingbase',
    'fixed',
    'ppp-kine',
    'ppp-static',
    'ppp-fixed',
  ]
  return names[mode]
}

function optionalNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function safeValue(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label}无效`)
  if (/[\r\n]/.test(value)) throw new Error(`${label}不能包含换行符`)
  return value
}

function assertRange(value: number, min: number, max: number, label: string): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label}必须在 ${min} 到 ${max} 之间`)
  }
}
