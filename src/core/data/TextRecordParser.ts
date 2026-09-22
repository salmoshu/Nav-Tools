export type TextDataParser = 'raw' | 'json' | 'nmea' | 'regex' | 'csv'
export type ParsedTextValue = string | number | boolean | null
export type ParsedTextRecord = Record<string, ParsedTextValue>

export const DEFAULT_KEY_VALUE_REGEX = String.raw`(?<key>[^\s=]+)=(?<value>"[^"]*"|'[^']*'|[^\s]+)`

export interface TextRecordParseResult {
  valid: boolean
  record?: ParsedTextRecord
  error?: string
}

interface RegexDefinition {
  source: string
  flags: string
}

function parseRegexDefinition(definition: string): RegexDefinition {
  const trimmed = definition.trim()
  if (!trimmed) throw new Error('Regex pattern is empty')
  if (!trimmed.startsWith('/')) return { source: trimmed, flags: 'g' }

  let closingSlash = -1
  for (let index = trimmed.length - 1; index > 0; index -= 1) {
    if (trimmed[index] !== '/') continue
    let backslashes = 0
    for (let cursor = index - 1; cursor >= 0 && trimmed[cursor] === '\\'; cursor -= 1) {
      backslashes += 1
    }
    if (backslashes % 2 === 0) {
      closingSlash = index
      break
    }
  }
  if (closingSlash <= 0) throw new Error('Regex literal is missing its closing slash')

  return {
    source: trimmed.slice(1, closingSlash),
    flags: trimmed.slice(closingSlash + 1),
  }
}

export function createRecordRegex(definition = DEFAULT_KEY_VALUE_REGEX): RegExp {
  const { source, flags } = parseRegexDefinition(definition)
  const normalizedFlags = flags.includes('g') ? flags : `${flags}g`
  return new RegExp(source, normalizedFlags)
}

export function parseTextValue(rawValue: string): ParsedTextValue {
  const value = rawValue.trim()
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1)
  }

  const enumNumber = value.match(/\(([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)\)\s*$/i)
  if (enumNumber) return Number(enumNumber[1])

  const numberWithOptionalUnit = value.match(
    /^([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)(?:[A-Za-z%°/_]+)?$/i,
  )
  if (numberWithOptionalUnit) return Number(numberWithOptionalUnit[1])

  if (/^true$/i.test(value)) return true
  if (/^false$/i.test(value)) return false
  if (/^null$/i.test(value)) return null
  return value
}

function assignRecordValue(
  record: ParsedTextRecord,
  rawKey: string | undefined,
  rawValue: string | undefined,
): void {
  const key = rawKey?.trim()
  if (!key || rawValue === undefined) return
  record[key] = parseTextValue(rawValue)
}

export function parseRegexRecord(
  input: string,
  definition = DEFAULT_KEY_VALUE_REGEX,
): TextRecordParseResult {
  try {
    const expression = createRecordRegex(definition)
    const record: ParsedTextRecord = {}
    let match: RegExpExecArray | null

    while ((match = expression.exec(input)) !== null) {
      const groups = match.groups
      if (groups?.key !== undefined && groups.value !== undefined) {
        assignRecordValue(record, groups.key, groups.value)
      } else if (groups && Object.keys(groups).length > 0) {
        for (const [key, value] of Object.entries(groups)) {
          if (value !== undefined) record[key] = parseTextValue(value)
        }
      } else {
        assignRecordValue(record, match[1], match[2])
      }

      if (match[0].length === 0) expression.lastIndex += 1
    }

    if (Object.keys(record).length === 0) {
      return { valid: false, error: 'Regex did not extract any fields' }
    }
    return { valid: true, record }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * RFC4180 行切分：双引号包裹的字段内逗号不切分，`""` 还原为字面引号。
 * 引号只在字段起始位置（前置内容为空）生效，其余位置按字面字符处理（宽松策略）。
 */
export function splitCsvLine(input: string): string[] {
  const fields: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          current += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        current += char
      }
      continue
    }
    if (char === '"' && current.trim() === '') {
      quoted = true
      current = ''
      continue
    }
    if (char === ',') {
      fields.push(current)
      current = ''
      continue
    }
    current += char
  }
  fields.push(current)
  return fields
}

/**
 * 表头行探测（保守策略）：存在非空单元格，且所有非空单元格都不是纯数值。
 * 只要有一个数值单元格就当作数据行，避免把首行数据误吞成表头。
 */
export function isCsvHeaderRow(cells: string[]): boolean {
  let hasTextCell = false
  for (const cell of cells) {
    const value = cell.trim()
    if (value === '') continue
    if (Number.isFinite(Number(value))) return false
    hasTextCell = true
  }
  return hasTextCell
}

/** 表头单元格 → 字段 key：空表头回退为列号（1 起，与无表头模式一致），重名追加 _2/_3 后缀。 */
export function csvHeaderKeys(cells: string[]): string[] {
  const used = new Set<string>()
  return cells.map((cell, index) => {
    const base = cell.trim() || String(index + 1)
    let key = base
    let suffix = 2
    while (used.has(key)) {
      key = `${base}_${suffix}`
      suffix += 1
    }
    used.add(key)
    return key
  })
}

export function parseCsvRecord(input: string): TextRecordParseResult {
  const record: ParsedTextRecord = {}
  const fields = splitCsvLine(input)

  fields.forEach((rawField, index) => {
    const value = rawField.trim()
    if (value === '') return
    const key = String(index + 1)
    record[key] = parseTextValue(value)
  })

  if (Object.keys(record).length === 0) {
    return { valid: false, error: 'CSV did not extract any fields' }
  }
  return { valid: true, record }
}

/** 表头感知变体：按列号映射到表头 key；超出表头范围的列回退为列号 key。 */
export function parseCsvRecordWithKeys(input: string, keys: string[]): TextRecordParseResult {
  const record: ParsedTextRecord = {}
  const fields = splitCsvLine(input)

  fields.forEach((rawField, index) => {
    const value = rawField.trim()
    if (value === '') return
    const key = keys[index] ?? String(index + 1)
    record[key] = parseTextValue(value)
  })

  if (Object.keys(record).length === 0) {
    return { valid: false, error: 'CSV did not extract any fields' }
  }
  return { valid: true, record }
}

export function parseTextRecord(
  input: string,
  parser: TextDataParser,
  regexPattern = DEFAULT_KEY_VALUE_REGEX,
): TextRecordParseResult {
  if (parser === 'csv') return parseCsvRecord(input)
  if (parser === 'regex') return parseRegexRecord(input, regexPattern)
  if (parser !== 'json') return { valid: false, error: `Parser ${parser} is not record-based` }

  try {
    const parsed = JSON.parse(input)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { valid: false, error: 'JSON record must be an object' }
    }
    return { valid: true, record: parsed as ParsedTextRecord }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
