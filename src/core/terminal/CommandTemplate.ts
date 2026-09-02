/**
 * 预设命令模板：`{{name:default|opt1|opt2}}` 是命令里的一处可填参数；
 * `{{name:bool}}` / `{{name:bool=true}}` 分别是默认未勾选 / 勾选的布尔参数。
 *
 * 解析与插值都是纯函数，可单测。插值时**参数值一律按目标 shell 家族转义**——
 * 这是 L2 与 L1 的唯一本质差别：L1 的命令串是作者写死的，L2 的参数值来自
 * 用户填的表单，若不转义，一个 `; rm -rf ~` 就能截断命令。
 *
 * 转义的代价：转义后参数总是一个独立的 shell 单词。`-j{{jobs}}` 会变成
 * `-j'8'`，bash / PowerShell 的引号粘连会还原成 `-j8`（行为正确）；cmd 不做
 * 引号粘连，`-j"8"` 会连引号一起传给程序。cmd 本就没有可靠的转义机制
 * （见 ShellQuote 注释），这里选择「安全优先、cmd 下可能报错」而非相反。
 */

import { quoteShellArg, type ShellFamily } from './ShellQuote'

/** `{{...}}` 占位符；内部不允许再出现花括号，避免嵌套歧义 */
const FIELD_PATTERN = /\{\{([^{}]*)\}\}/g
const BOOLEAN_TYPE_PATTERN = /^bool(?:=(true|false))?$/

export type CommandTemplateFieldType = 'text' | 'select' | 'boolean'

export interface CommandTemplateField {
  name: string
  type: CommandTemplateFieldType
  /** 未填时的取值，也是候选列表的第一项 */
  defaultValue: string
  /** 下拉候选值；文本与布尔字段为空 */
  options: string[]
}

/** 抽出命令里的参数占位符；重复的 name 只保留首次出现（后者取不到独立值） */
export function parseCommandTemplate(command: string): CommandTemplateField[] {
  const fields: CommandTemplateField[] = []
  const seen = new Set<string>()
  for (const match of command.matchAll(FIELD_PATTERN)) {
    const field = parseField(match[1])
    if (!field || seen.has(field.name)) continue
    seen.add(field.name)
    fields.push(field)
  }
  return fields
}

/** 按用户填的值插值；未提供的参数取默认值。无法解析的占位符原样保留 */
export function interpolateCommandTemplate(
  command: string,
  values: Record<string, string>,
  family: ShellFamily,
): string {
  return command.replace(FIELD_PATTERN, (whole, body: string) => {
    const field = parseField(body)
    if (!field) return whole
    const value =
      field.type === 'boolean'
        ? normalizeBooleanValue(values[field.name], field.defaultValue)
        : (values[field.name] ?? field.defaultValue)
    return quoteShellArg(value, family)
  })
}

/**
 * 解析占位符内部：`name:default|opt1|opt2`。
 * 先按 `|` 切候选，首段再按第一个 `:` 切成名字与首个候选值。
 * 解析不出来返回 null（调用方按字面文本处理，不做半截替换）。
 */
function parseField(body: string): CommandTemplateField | null {
  const segments = body.split('|').map((segment) => segment.trim())
  const head = segments[0] ?? ''
  const colon = head.indexOf(':')
  const name = (colon >= 0 ? head.slice(0, colon) : head).trim()
  if (!name) return null
  const first = colon >= 0 ? head.slice(colon + 1).trim() : ''
  const booleanType = segments.length === 1 ? BOOLEAN_TYPE_PATTERN.exec(first) : null
  if (booleanType) {
    return {
      name,
      type: 'boolean',
      defaultValue: booleanType[1] ?? 'false',
      options: [],
    }
  }
  const options = [first, ...segments.slice(1)].filter(Boolean)
  return {
    name,
    type: options.length > 1 ? 'select' : 'text',
    defaultValue: options[0] ?? '',
    options,
  }
}

/** 布尔值只接受白名单字面量；篡改后的任意字符串退回模板默认值 */
function normalizeBooleanValue(value: string | undefined, defaultValue: string): string {
  if (value === 'true' || value === 'false') return value
  return defaultValue === 'true' ? 'true' : 'false'
}
