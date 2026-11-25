import { RTKLIB_EX_OPTION_ROWS } from './RtkLibExOptionSchema'

export type RtkLibExParameters = Record<string, string>
export type RtkLibExOutputFormat = 'llh' | 'xyz' | 'enu' | 'nmea'

export interface RtkLibExOption {
  key: string
  group: string
  format: 0 | 1 | 2 | 3
  defaultValue: string
  detail: string
  choices: { code: string; label: string }[]
}

export const RTKLIB_EX_OPTIONS: readonly RtkLibExOption[] = RTKLIB_EX_OPTION_ROWS.map(
  ([key, format, defaultValue, detail]) => ({
    key,
    group: key.split('-', 1)[0],
    format,
    defaultValue,
    detail,
    choices:
      format === 3
        ? detail.split(',').map((entry) => {
            const [code, label] = entry.split(':', 2)
            return { code, label }
          })
        : [],
  }),
)

const optionsByKey = new Map(RTKLIB_EX_OPTIONS.map((option) => [option.key, option]))
const textLimits = new Map([
  ['ant1-anttype', 63],
  ['ant2-anttype', 63],
  ['out-fieldsep', 63],
  ['misc-rnxopt1', 255],
  ['misc-rnxopt2', 255],
  ['misc-pppopt', 255],
])

function optionFor(key: string): RtkLibExOption | undefined {
  return optionsByKey.get(key === 'pos2-rejionno' ? 'pos2-rejphase' : key)
}

function normalizeOption(option: RtkLibExOption, input: string): string {
  if (/[\r\n\0#]/.test(input)) throw new Error(`Invalid RTKLIB-EX value: ${option.key}`)
  const value = input.trim()
  if (option.format === 3) {
    const choice = option.choices.find(({ code, label }) => code === value || label === value)
    if (choice) return choice.label
  } else if (option.format === 2) {
    // RTKLIB-EX copies these values into fixed-size native buffers.
    if (new TextEncoder().encode(value).length <= (textLimits.get(option.key) ?? 1023)) return value
  } else {
    const number = Number(value)
    const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
    if (option.format === 1 && decimal.test(value) && Number.isFinite(number)) return String(number)
    if (
      option.format === 0 &&
      /^[+-]?\d+$/.test(value) &&
      number >= -2147483648 &&
      number <= 2147483647
    )
      return String(number)
  }
  throw new Error(`Invalid RTKLIB-EX value: ${option.key} = ${value}`)
}

export function parseRtkLibExConfig(source: string): RtkLibExParameters {
  const parameters: RtkLibExParameters = {}
  for (const rawLine of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = /^\s*([\w-]+)\s*=(.*)$/.exec(rawLine.split('#', 1)[0])
    const option = match && optionFor(match[1])
    if (option && match) parameters[option.key] = normalizeOption(option, match[2])
  }
  return parameters
}

export function restoreRtkLibExParameters(value: unknown): RtkLibExParameters {
  const parameters: RtkLibExParameters = {}
  if (!value || typeof value !== 'object') return parameters
  for (const [key, raw] of Object.entries(value)) {
    const option = optionFor(key)
    if (option && typeof raw === 'string') {
      try {
        parameters[option.key] = normalizeOption(option, raw)
      } catch {
        // Ignore obsolete or invalid values saved by an older local build.
      }
    }
  }
  return parameters
}

export function validateRtkLibExParameters(params: RtkLibExParameters): RtkLibExParameters {
  const normalized: RtkLibExParameters = {}
  for (const [key, raw] of Object.entries(params)) {
    const option = optionFor(key)
    if (!option || typeof raw !== 'string') throw new Error(`Unknown RTKLIB-EX option: ${key}`)
    normalized[option.key] = normalizeOption(option, raw)
  }
  return normalized
}

export function buildRtkLibExConfig(params: RtkLibExParameters): string {
  const values = validateRtkLibExParameters(params)
  const lines = ['# RTKLIB-EX 2.5.1']
  for (const option of RTKLIB_EX_OPTIONS) {
    const value = values[option.key] ?? option.defaultValue
    if (value || Object.hasOwn(values, option.key)) lines.push(`${option.key}=${value}`)
  }
  return lines.join('\n') + '\n'
}

export function rtkLibExPositionMode(params?: RtkLibExParameters): number {
  const option = optionsByKey.get('pos1-posmode')!
  const raw = params?.[option.key] ?? option.defaultValue
  return Number(option.choices.find(({ code, label }) => code === raw || label === raw)?.code ?? 2)
}

export function rtkLibExOutputFormat(params?: RtkLibExParameters): RtkLibExOutputFormat {
  const option = optionsByKey.get('out-solformat')!
  const raw = params?.[option.key] ?? option.defaultValue
  const value = option.choices.find(({ code, label }) => code === raw || label === raw)?.label
  return value === 'xyz' || value === 'enu' || value === 'nmea' ? value : 'llh'
}
