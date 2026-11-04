export type RtkPostConstellation = 'G' | 'R' | 'E' | 'J' | 'C' | 'I'
export type RtkPostOutputFormat = 'llh' | 'xyz' | 'enu' | 'nmea'
export type RtkPostTimeFormat = 'tow' | 'hms'

export interface RtkPostOptions {
  mode: number
  frequency: number
  solutionType: 0 | 1 | 2
  ambiguityResolution: 'continuous' | 'instantaneous' | 'fix-and-hold'
  constellations: RtkPostConstellation[]
  elevationMaskDeg: number
  ratioThreshold: number
  startTime: string
  endTime: string
  intervalS: number | null
  outputFormat: RtkPostOutputFormat
  timeSystem: 'gpst' | 'utc'
  timeFormat: RtkPostTimeFormat
  timeDecimals: number
  outputStatus: 0 | 1 | 2
  traceLevel: number
}

export interface RtkPostSettings {
  executablePath: string
  roverObsPath: string
  baseObsPath: string
  navPaths: string[]
  configPath: string
  outputPath: string
  options: RtkPostOptions
}

export interface RtkPostRunRequest extends RtkPostSettings {
  runId: string
}

export interface RtkPostSolutionSummary {
  epochs: number
  fixed: number
  float: number
  sbas: number
  dgps: number
  single: number
  ppp: number
  other: number
  sizeBytes: number
  preview: string
}

export interface RtkPostRunResult {
  ok: boolean
  cancelled: boolean
  exitCode: number | null
  outputPath: string
  log: string
  error?: string
  solution?: RtkPostSolutionSummary
}

export interface RtkPostLogEvent {
  runId: string
  chunk: string
}

export const DEFAULT_RTKPOST_OPTIONS: Readonly<RtkPostOptions> = Object.freeze({
  mode: 2,
  frequency: 2,
  solutionType: 0,
  ambiguityResolution: 'continuous',
  constellations: ['G', 'R'],
  elevationMaskDeg: 15,
  ratioThreshold: 3,
  startTime: '',
  endTime: '',
  intervalS: null,
  outputFormat: 'llh',
  timeSystem: 'gpst',
  timeFormat: 'hms',
  timeDecimals: 3,
  outputStatus: 0,
  traceLevel: 0,
} satisfies RtkPostOptions)

export function createDefaultRtkPostSettings(): RtkPostSettings {
  return {
    executablePath: '',
    roverObsPath: '',
    baseObsPath: '',
    navPaths: [''],
    configPath: '',
    outputPath: '',
    options: {
      ...DEFAULT_RTKPOST_OPTIONS,
      constellations: [...DEFAULT_RTKPOST_OPTIONS.constellations],
    },
  }
}

export function defaultRtkPostOutputPath(
  roverObsPath: string,
  outputFormat: RtkPostOutputFormat,
): string {
  const source = roverObsPath.trim().replace(/[?#].*$/, '')
  if (!source) return ''
  const withoutCompression = source.replace(/\.(?:gz|z)$/i, '')
  const extension = withoutCompression.match(/\.[^./\\]+$/)?.[0] ?? ''
  const base = extension ? withoutCompression.slice(0, -extension.length) : withoutCompression
  return `${base}.${outputFormat === 'nmea' ? 'nmea' : 'pos'}`
}

export function buildRtkPostArgs(request: RtkPostRunRequest | RtkPostSettings): string[] {
  const rover = requiredPath(request.roverObsPath, '流动站 RINEX OBS')
  const output = requiredPath(request.outputPath, '解决方案输出')
  const options = request.options
  if (!options || !Number.isInteger(options.mode) || options.mode < 0 || options.mode > 9) {
    throw new Error('定位模式无效')
  }
  if (![1, 2, 3].includes(options.frequency)) throw new Error('频点数无效')
  if (![0, 1, 2].includes(options.solutionType)) throw new Error('解算方向无效')
  if (!['llh', 'xyz', 'enu', 'nmea'].includes(options.outputFormat)) {
    throw new Error('输出格式无效')
  }
  if (!['gpst', 'utc'].includes(options.timeSystem)) throw new Error('时间系统无效')
  if (!['tow', 'hms'].includes(options.timeFormat)) throw new Error('时间格式无效')
  if (![0, 1, 2].includes(options.outputStatus)) throw new Error('状态输出级别无效')
  assertRange(options.elevationMaskDeg, 0, 90, '高度截止角')
  assertRange(options.ratioThreshold, 0, 999, '模糊度 Ratio 阈值')
  assertIntegerRange(options.timeDecimals, 0, 9, '时间小数位')
  assertIntegerRange(options.traceLevel, 0, 5, '调试跟踪级别')
  if (!Array.isArray(options.constellations) || options.constellations.length === 0) {
    throw new Error('请至少选择一个卫星导航系统')
  }
  const constellations = [...new Set(options.constellations)]
  if (constellations.some((item) => !['G', 'R', 'E', 'J', 'C', 'I'].includes(item))) {
    throw new Error('卫星导航系统选项无效')
  }

  const relative = options.mode >= 1 && options.mode <= 6
  const base = relative ? requiredPath(request.baseObsPath, '基站 RINEX OBS') : ''
  if (!Array.isArray(request.navPaths)) throw new Error('导航文件列表无效')
  const nav = request.navPaths.filter((path) => path.trim()).map((path) => path.trim())
  const inputPaths = [rover, ...(base ? [base] : []), ...nav]
  if (inputPaths.length > 16) throw new Error('rnx2rtkp 最多支持 16 个输入文件')

  const args: string[] = []
  const config = optionalPath(request.configPath)
  if (config) args.push('-k', config)
  args.push('-o', output, '-p', String(options.mode), '-f', String(options.frequency))
  args.push('-m', String(options.elevationMaskDeg), '-sys', constellations.join(','))
  args.push('-v', String(options.ratioThreshold))
  if (options.solutionType === 1) args.push('-b')
  if (options.solutionType === 2) args.push('-c')
  if (options.ambiguityResolution === 'instantaneous') args.push('-i')
  else if (options.ambiguityResolution === 'fix-and-hold') args.push('-h')
  else if (options.ambiguityResolution !== 'continuous') throw new Error('模糊度固定模式无效')

  if (options.outputFormat === 'xyz') args.push('-e')
  else if (options.outputFormat === 'enu') args.push('-a')
  else if (options.outputFormat === 'nmea') args.push('-n')
  if (options.timeSystem === 'utc') args.push('-u')
  if (options.timeFormat === 'hms') args.push('-t')
  args.push('-d', String(options.timeDecimals))
  args.push('-y', String(options.outputStatus), '-x', String(options.traceLevel))

  const start = optionalTime(options.startTime, '开始时间')
  const end = optionalTime(options.endTime, '结束时间')
  if (start && end && start.epochMs >= end.epochMs) throw new Error('结束时间必须晚于开始时间')
  if (start) args.push('-ts', start.date, start.time)
  if (end) args.push('-te', end.date, end.time)
  if (options.intervalS !== null) {
    assertRange(options.intervalS, 0.000001, 86400, '历元间隔')
    args.push('-ti', String(options.intervalS))
  }
  args.push(...inputPaths)
  return args
}

export class RtkPostSolutionParser {
  private readonly headerLines: string[] = []
  private readonly solutionLines: string[] = []
  private readonly summary: RtkPostSolutionSummary = {
    epochs: 0,
    fixed: 0,
    float: 0,
    sbas: 0,
    dgps: 0,
    single: 0,
    ppp: 0,
    other: 0,
    sizeBytes: 0,
    preview: '',
  }

  public constructor(
    private readonly outputFormat: RtkPostOutputFormat,
    private readonly timeFormat: RtkPostTimeFormat,
  ) {}

  public addLine(line: string): void {
    const text = line.trimEnd()
    const trimmed = text.trim()
    if (!trimmed) return
    if (trimmed.startsWith('%')) {
      if (this.headerLines.length < 8) this.headerLines.push(text)
      return
    }
    const quality = this.readQuality(trimmed)
    if (quality === null) return
    this.summary.epochs++
    if (quality === 1) this.summary.fixed++
    else if (quality === 2) this.summary.float++
    else if (quality === 3) this.summary.sbas++
    else if (quality === 4) this.summary.dgps++
    else if (quality === 5) this.summary.single++
    else if (quality === 6) this.summary.ppp++
    else this.summary.other++
    if (this.solutionLines.length < 48) this.solutionLines.push(text)
  }

  public finish(sizeBytes: number): RtkPostSolutionSummary {
    return {
      ...this.summary,
      sizeBytes,
      preview: [...this.headerLines, ...this.solutionLines].join('\n'),
    }
  }

  private readQuality(line: string): number | null {
    if (this.outputFormat === 'nmea') {
      if (!/^\$[A-Z]{2}GGA,/.test(line)) return null
      return validQuality(line.split(',')[6])
    }
    const fields = line.split(/\s+/)
    const qualityIndex = (this.timeFormat === 'hms' ? 2 : 1) + 3
    if (!/^\d/.test(fields[0])) return null
    return validQuality(fields[qualityIndex])
  }
}

function validQuality(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const quality = Number(value)
  return quality >= 0 && quality <= 9 ? quality : null
}

function requiredPath(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`请设置${label}路径`)
  return value.trim()
}

function optionalPath(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function assertRange(value: number, min: number, max: number, label: string): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label}必须在 ${min} 到 ${max} 之间`)
  }
}

function assertIntegerRange(value: number, min: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label}必须是 ${min} 到 ${max} 之间的整数`)
  }
}

function optionalTime(
  value: string,
  label: string,
): { date: string; time: string; epochMs: number } | null {
  if (!value.trim()) return null
  const match = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}(?:\.\d{1,3})?))?$/)
  if (!match) throw new Error(`${label}格式应为 YYYY-MM-DDTHH:mm:ss`)
  const [, year, month, day, hour, minute, second = '0'] = match
  const secondNumber = Number(second)
  const epochMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Math.floor(secondNumber),
    Math.round((secondNumber % 1) * 1000),
  )
  const date = new Date(epochMs)
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day) ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    secondNumber >= 60
  ) {
    throw new Error(`${label}不是有效时间`)
  }
  return {
    date: `${year}/${month}/${day}`,
    time: `${hour}:${minute}:${second.padStart(2, '0')}`,
    epochMs,
  }
}
