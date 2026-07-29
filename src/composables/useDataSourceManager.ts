import { reactive } from 'vue'
import {
  DataSourceStorage,
  type DataSourceSettings,
  type TextDataParser,
} from '@/core/data/DataSourceStorage'
import { JsonStorage, type StorageLike } from '@/core/storage/JsonStorage'
import { t } from '@/i18n'

export type TextDataParserGroup = 'general' | 'structured' | 'protocol' | 'custom'

export const textDataParserOptions: ReadonlyArray<{
  value: TextDataParser
  label: string
  description: string
  group: TextDataParserGroup
}> = [
  { value: 'raw', label: '无', description: t('data.parserRawDesc'), group: 'general' },
  { value: 'json', label: 'JSON', description: t('data.parserJsonDesc'), group: 'structured' },
  { value: 'csv', label: 'CSV', description: t('data.parserCsvDesc'), group: 'structured' },
  { value: 'nmea', label: 'NMEA', description: t('data.parserNmeaDesc'), group: 'protocol' },
  { value: 'regex', label: t('app.toolbar.regexPattern'), description: t('data.parserRegexDesc'), group: 'custom' },
]

// 注意：须用 type 而非 interface——interface 无隐式索引签名，
// 无法赋给 el-cascader 的 CascaderOption（带 [key: string]: unknown）。
export type TextDataParserCascaderOption = {
  value: string
  label: string
  children?: Array<{ value: TextDataParser; label: string }>
}

// 级联（二级菜单）选项：general 项（空）作为一级叶子直接可选、无二级菜单，
// 其余按类别分组展开，避免下拉列表过长。
// 注意：el-cascader 的 options 类型要求可变数组，此处不用 ReadonlyArray。
export const textDataParserCascaderOptions: TextDataParserCascaderOption[] = [
  ...textDataParserOptions
    .filter((option) => option.group === 'general')
    .map((option) => ({ value: option.value as string, label: option.label })),
  ...(['structured', 'protocol', 'custom'] as const).map((group) => ({
    value: group as string,
    label: t(`data.parserGroup${group.charAt(0).toUpperCase() + group.slice(1)}`),
    children: textDataParserOptions
      .filter((option) => option.group === group)
      .map((option) => ({ value: option.value, label: option.label })),
  })),
]

const memoryValues = new Map<string, string>()
const fallbackStorage: StorageLike = {
  getItem: (key) => memoryValues.get(key) ?? null,
  setItem: (key, value) => memoryValues.set(key, value),
  removeItem: (key) => memoryValues.delete(key),
}

let singleton:
  | {
      settings: DataSourceSettings
      saveSettings: () => void
    }
  | undefined

export function useDataSourceManager() {
  if (!singleton) {
    const browserStorage = typeof window === 'undefined' ? fallbackStorage : window.localStorage
    const storage = new DataSourceStorage(new JsonStorage(browserStorage))
    const settings = reactive(storage.load()) as DataSourceSettings
    singleton = {
      settings,
      saveSettings: () => storage.save(settings),
    }
  }

  return singleton
}

export function parserLabel(parser: TextDataParser): string {
  return textDataParserOptions.find((option) => option.value === parser)?.label ?? '无'
}
