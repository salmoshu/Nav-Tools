import { reactive } from 'vue'
import {
  DataSourceStorage,
  type DataSourceSettings,
  type TextDataParser,
} from '@/core/data/DataSourceStorage'
import { JsonStorage, type StorageLike } from '@/core/storage/JsonStorage'
import { t } from '@/i18n'

export const textDataParserOptions: ReadonlyArray<{
  value: TextDataParser
  label: string
  description: string
}> = [
  { value: 'raw', label: 'Raw', description: t('data.parserRawDesc') },
  { value: 'json', label: 'JSON', description: t('data.parserJsonDesc') },
  { value: 'nmea', label: 'NMEA', description: t('data.parserNmeaDesc') },
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
  return textDataParserOptions.find((option) => option.value === parser)?.label ?? 'Raw'
}
