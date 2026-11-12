import type { RtkPostConstellation, RtkPostOptions } from './RtkPost'

type OptionKey = keyof RtkPostOptions
type NumericKey = {
  [K in OptionKey]: RtkPostOptions[K] extends number ? K : never
}[OptionKey]
type BooleanKey = {
  [K in OptionKey]: RtkPostOptions[K] extends boolean ? K : never
}[OptionKey]
type Reader = (raw: string, options: Partial<RtkPostOptions>) => boolean

function assign<K extends OptionKey>(
  options: Partial<RtkPostOptions>,
  key: K,
  value: RtkPostOptions[K],
): void {
  options[key] = value
}

function numberReader<K extends NumericKey>(
  key: K,
  min = -Infinity,
  max = Infinity,
  integer = false,
): Reader {
  return (raw, options) => {
    const value = Number(raw)
    if (
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isInteger(value))
    )
      return false
    assign(options, key, value as RtkPostOptions[K])
    return true
  }
}

function enumReader<K extends OptionKey>(
  key: K,
  values: Readonly<Record<string, RtkPostOptions[K]>>,
): Reader {
  return (raw, options) => {
    const value = values[raw.trim().toLowerCase()]
    if (value === undefined) return false
    assign(options, key, value)
    return true
  }
}

function booleanReader(key: BooleanKey): Reader {
  return (raw, options) => {
    const value = raw.trim().toLowerCase()
    if (['1', 'on', 'true', 'yes'].includes(value)) assign(options, key, true)
    else if (['0', 'off', 'false', 'no'].includes(value)) assign(options, key, false)
    else return false
    return true
  }
}

const positioningModes = {
  '0': 0,
  single: 0,
  '1': 1,
  dgps: 1,
  '2': 2,
  kinematic: 2,
  '3': 3,
  static: 3,
  '4': 4,
  'static-start': 4,
  '5': 5,
  movingbase: 5,
  '6': 6,
  fixed: 6,
  '7': 7,
  'ppp-kine': 7,
  'ppp-kinematic': 7,
  '8': 8,
  'ppp-static': 8,
  '9': 9,
  'ppp-fixed': 9,
} as const

const readers: Readonly<Record<string, Reader>> = {
  'pos1-posmode': enumReader('mode', positioningModes),
  'pos1-frequency': enumReader('frequency', {
    '1': 1,
    l1: 1,
    '2': 2,
    'l1+l2': 2,
    '3': 3,
    'l1+l2+l5': 3,
    '4': 4,
    'l1+l5': 4,
  }),
  'pos1-soltype': enumReader('solutionType', {
    '0': 0,
    forward: 0,
    '1': 1,
    backward: 1,
    '2': 2,
    combined: 2,
  }),
  'pos1-elmask': numberReader('elevationMaskDeg', 0, 90),
  'pos1-navsys': (raw, options) => {
    const mask = Number(raw)
    if (!Number.isInteger(mask) || mask <= 0) return false
    const bits: Array<[number, RtkPostConstellation]> = [
      [1, 'G'],
      [4, 'R'],
      [8, 'E'],
      [32, 'C'],
      [16, 'J'],
      [64, 'I'],
    ]
    const constellations = bits.filter(([bit]) => (mask & bit) !== 0).map(([, name]) => name)
    if (constellations.length === 0) return false
    assign(options, 'constellations', constellations)
    return true
  },
  'pos1-tint': (raw, options) => {
    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0) return false
    assign(options, 'intervalS', value === 0 ? null : value)
    return true
  },
  'pos1-ts': timeReader('startTime'),
  'pos1-te': timeReader('endTime'),
  'pos2-armode': enumReader('ambiguityResolution', {
    '0': 'off',
    off: 'off',
    '1': 'continuous',
    continuous: 'continuous',
    '2': 'instantaneous',
    instantaneous: 'instantaneous',
    '3': 'fix-and-hold',
    'fix-and-hold': 'fix-and-hold',
  }),
  'pos2-gloarmode': enumReader('gloArMode', {
    '0': 'off',
    off: 'off',
    '1': 'on',
    on: 'on',
    '2': 'autocal',
    autocal: 'autocal',
    '3': 'fix-and-hold',
    'fix-and-hold': 'fix-and-hold',
  }),
  'pos2-bdsarmode': booleanReader('bdsArEnabled'),
  'pos2-arfilter': booleanReader('arFilterEnabled'),
  'pos2-arthres': numberReader('ratioThreshold', 0, 999),
  'pos2-arthresmin': numberReader('ratioMin', 0, 999),
  'pos2-arthresmax': numberReader('ratioMax', 0, 999),
  'pos2-arthres1': numberReader('maxPosVar', 0),
  'pos2-arthres2': numberReader('gloHwBiasM'),
  'pos2-arlockcnt': numberReader('minLockCount', 0, Infinity, true),
  'pos2-arelmask': numberReader('arElevationMaskDeg', 0, 90),
  'pos2-arminfix': numberReader('minFixCount', 0, Infinity, true),
  'pos2-elmaskhold': numberReader('holdElevationMaskDeg', 0, 90),
  'pos2-dopthres': numberReader('dopplerSlipThresholdHz', 0),
  'pos2-thresdop': numberReader('dopplerSlipThresholdHz', 0),
  'pos2-slipthres': numberReader('gfSlipThresholdM', 0),
  'pos2-maxage': numberReader('maxAgeS', 0),
  'pos2-aroutcnt': numberReader('arResetOutageEpochs', 0, Infinity, true),
  'pos2-rejcode': numberReader('codeOutlierM', 0),
  'pos2-rejionno': numberReader('phaseOutlierM', 0),
  'pos2-armaxiter': numberReader('filterIterations', 1, Infinity, true),
  'pos2-syncsol': booleanReader('syncSolutionEnabled'),
  'pos2-baselen': numberReader('baselineLengthM', 0),
  'pos2-basesig': numberReader('baselineSigmaM', 0),
  'pos2-minfixsats': numberReader('minFixSats', 0, Infinity, true),
  'pos2-minholdsats': numberReader('minHoldSats', 0, Infinity, true),
  'pos2-mindropsats': numberReader('minDropSats', 0, Infinity, true),
  'pos2-varholdamb': numberReader('holdAmbVar', 0),
  'pos2-gainholdamb': numberReader('holdAmbGain', 0),
  'stats-eratio1': numberReader('errorRatioL1', 0),
  'stats-eratio2': numberReader('errorRatioL2', 0),
  'stats-eratio5': numberReader('errorRatioL5', 0),
  'stats-errphase': numberReader('phaseErrorM', 0),
  'stats-errphaseel': numberReader('phaseElevationErrorM', 0),
  'stats-errphasebl': numberReader('phaseBaselineErrorM', 0),
  'stats-errsnr': numberReader('phaseSnrErrorM', 0),
  'stats-snrmax': numberReader('snrMaxDbHz', 0),
  'stats-errrcv': numberReader('receiverErrorM', 0),
  'stats-errdoppler': numberReader('dopplerErrorHz', 0),
  'stats-stdbias': numberReader('initialBiasStdM', 0),
  'stats-stdiono': numberReader('initialIonoStdM', 0),
  'stats-stdtrop': numberReader('initialTropStdM', 0),
  'stats-prnaccelh': numberReader('receiverAccelHorizontalMps2', 0),
  'stats-prnaccelv': numberReader('receiverAccelVerticalMps2', 0),
  'stats-prnbias': numberReader('processBiasM', 0),
  'stats-prniono': numberReader('processIonoM', 0),
  'stats-prntrop': numberReader('processTropM', 0),
  'stats-clkstab': numberReader('clockStabilitySps', 0),
  'out-solformat': enumReader('outputFormat', {
    '0': 'llh',
    llh: 'llh',
    '1': 'xyz',
    xyz: 'xyz',
    '2': 'enu',
    enu: 'enu',
    '3': 'nmea',
    nmea: 'nmea',
  }),
  'out-timesys': enumReader('timeSystem', { '0': 'gpst', gpst: 'gpst', '1': 'utc', utc: 'utc' }),
  'out-timeform': enumReader('timeFormat', { '0': 'tow', tow: 'tow', '1': 'hms', hms: 'hms' }),
  'out-timendec': numberReader('timeDecimals', 0, 9, true),
  'out-outstat': enumReader('outputStatus', {
    '0': 0,
    off: 0,
    '1': 1,
    state: 1,
    states: 1,
    '2': 2,
    residual: 2,
    residuals: 2,
  }),
  'ant2-postype': enumReader('basePositionMode', {
    '0': 'llh',
    llh: 'llh',
    '1': 'xyz',
    xyz: 'xyz',
    '2': 'single',
    single: 'single',
    '3': 'posfile',
    posfile: 'posfile',
    '4': 'rinexhead',
    rinexhead: 'rinexhead',
    '5': 'rtcm',
    rtcm: 'rtcm',
    '6': 'raw',
    raw: 'raw',
  }),
  'out-trace': numberReader('traceLevel', 0, 5, true),
}

function timeReader(key: 'startTime' | 'endTime'): Reader {
  return (raw, options) => {
    const match = raw
      .trim()
      .match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$/)
    if (!match) return false
    assign(options, key, `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`)
    return true
  }
}

function entries(text: string): Array<[string, string]> {
  const result: Array<[string, string]> = []
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z][\w-]*)\s*=\s*(.*)$/)
    if (!match) continue
    result.push([match[1].toLowerCase(), match[2].split('#', 1)[0].trim()])
  }
  return result
}

export interface ParsedRtkPostConfig {
  options: Partial<RtkPostOptions>
  recognizedKeys: string[]
}

export function parseRtkPostConfig(text: string): ParsedRtkPostConfig {
  const options: Partial<RtkPostOptions> = {}
  const recognizedKeys: string[] = []
  for (const [key, raw] of entries(text)) {
    const reader = readers[key]
    if (!reader || !reader(raw, options)) continue
    if (!recognizedKeys.includes(key)) recognizedKeys.push(key)
  }
  return { options, recognizedKeys }
}

type Writer = (options: RtkPostOptions) => string | undefined
const text =
  (key: OptionKey): Writer =>
  (options) =>
    String(options[key])
const number = (key: NumericKey): Writer => text(key)
const boolean =
  (key: BooleanKey): Writer =>
  (options) =>
    options[key] ? 'on' : 'off'
const configTime =
  (key: 'startTime' | 'endTime'): Writer =>
  (options) => {
    const value = options[key].trim()
    if (!value) return undefined
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](.+)$/)
    return match ? `${match[1]}/${match[2]}/${match[3]} ${match[4]}` : undefined
  }
const writers: Readonly<Record<string, Writer>> = {
  'pos1-posmode': text('mode'),
  'pos1-frequency': text('frequency'),
  'pos1-soltype': text('solutionType'),
  'pos1-elmask': number('elevationMaskDeg'),
  'pos1-navsys': (options) => {
    const bits: Record<RtkPostConstellation, number> = { G: 1, R: 4, E: 8, C: 32, J: 16, I: 64 }
    return String(options.constellations.reduce((mask, name) => mask | bits[name], 0))
  },
  'pos1-tint': (options) => (options.intervalS === null ? undefined : String(options.intervalS)),
  'pos1-ts': configTime('startTime'),
  'pos1-te': configTime('endTime'),
  'pos2-armode': text('ambiguityResolution'),
  'pos2-gloarmode': text('gloArMode'),
  'pos2-bdsarmode': boolean('bdsArEnabled'),
  'pos2-arfilter': boolean('arFilterEnabled'),
  'pos2-arthres': number('ratioThreshold'),
  'pos2-arthresmin': number('ratioMin'),
  'pos2-arthresmax': number('ratioMax'),
  'pos2-arthres1': number('maxPosVar'),
  'pos2-arthres2': number('gloHwBiasM'),
  'pos2-arlockcnt': number('minLockCount'),
  'pos2-arelmask': number('arElevationMaskDeg'),
  'pos2-arminfix': number('minFixCount'),
  'pos2-elmaskhold': number('holdElevationMaskDeg'),
  'pos2-dopthres': number('dopplerSlipThresholdHz'),
  'pos2-thresdop': number('dopplerSlipThresholdHz'),
  'pos2-slipthres': number('gfSlipThresholdM'),
  'pos2-maxage': number('maxAgeS'),
  'pos2-aroutcnt': number('arResetOutageEpochs'),
  'pos2-rejcode': number('codeOutlierM'),
  'pos2-rejionno': number('phaseOutlierM'),
  'pos2-armaxiter': number('filterIterations'),
  'pos2-syncsol': boolean('syncSolutionEnabled'),
  'pos2-baselen': number('baselineLengthM'),
  'pos2-basesig': number('baselineSigmaM'),
  'pos2-minfixsats': number('minFixSats'),
  'pos2-minholdsats': number('minHoldSats'),
  'pos2-mindropsats': number('minDropSats'),
  'pos2-varholdamb': number('holdAmbVar'),
  'pos2-gainholdamb': number('holdAmbGain'),
  'stats-eratio1': number('errorRatioL1'),
  'stats-eratio2': number('errorRatioL2'),
  'stats-eratio5': number('errorRatioL5'),
  'stats-errphase': number('phaseErrorM'),
  'stats-errphaseel': number('phaseElevationErrorM'),
  'stats-errphasebl': number('phaseBaselineErrorM'),
  'stats-errsnr': number('phaseSnrErrorM'),
  'stats-snrmax': number('snrMaxDbHz'),
  'stats-errrcv': number('receiverErrorM'),
  'stats-errdoppler': number('dopplerErrorHz'),
  'stats-stdbias': number('initialBiasStdM'),
  'stats-stdiono': number('initialIonoStdM'),
  'stats-stdtrop': number('initialTropStdM'),
  'stats-prnaccelh': number('receiverAccelHorizontalMps2'),
  'stats-prnaccelv': number('receiverAccelVerticalMps2'),
  'stats-prnbias': number('processBiasM'),
  'stats-prniono': number('processIonoM'),
  'stats-prntrop': number('processTropM'),
  'stats-clkstab': number('clockStabilitySps'),
  'out-solformat': text('outputFormat'),
  'out-timesys': text('timeSystem'),
  'out-timeform': text('timeFormat'),
  'out-timendec': number('timeDecimals'),
  'out-outstat': text('outputStatus'),
  'ant2-postype': text('basePositionMode'),
  'out-trace': number('traceLevel'),
}

export function mergeRtkPostConfig(source: string, options: RtkPostOptions): string {
  const values = Object.fromEntries(
    Object.entries(writers).map(([key, write]) => [key, write(options)]),
  )
  const seen = new Set<string>()
  const output: string[] = []
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z][\w-]*)\s*=/)
    const key = match?.[1].toLowerCase()
    if (!key || !Object.prototype.hasOwnProperty.call(values, key)) {
      output.push(line)
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    const value = values[key]
    if (value === undefined) continue
    const comment = line.includes('#') ? ` ${line.slice(line.indexOf('#')).trimStart()}` : ''
    output.push(`${key}=${value}${comment}`)
  }
  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key) && value !== undefined) output.push(`${key}=${value}`)
  }
  while (output.length > 0 && output[output.length - 1] === '') output.pop()
  if (output.length === 0) output.push('# Open-GNSS / Nav-Tools processing options', '')
  return `${output.join('\n')}\n`
}
