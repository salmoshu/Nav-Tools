import { reactive } from 'vue'
import { DETECTABLE_FORMATS, type DetectableFormat } from '@/core/data/DataFormat'

const STORAGE_KEY = 'nav-tools:auto-format-settings'
const defaults: Record<string, DetectableFormat[]> = {
  gnss: ['nmea', 'rtklib-pos'],
  gnssraw: ['rtcm3', 'rinex'],
  gnsslib: ['nmea', 'rtklib-pos'],
  lidar: ['mcap'],
  serial: ['nmea', 'rtklib-pos', 'json', 'csv'],
  motor: ['nmea', 'rtklib-pos', 'json', 'csv'],
}

function readSettings(): Record<string, DetectableFormat[]> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => Array.isArray(value))
        .map(([key, value]) => [
          key,
          [
            ...new Set(
              (value as unknown[]).filter(
                (item): item is DetectableFormat =>
                  typeof item === 'string' &&
                  (DETECTABLE_FORMATS as readonly string[]).includes(item),
              ),
            ),
          ],
        ]),
    )
  } catch {
    return {}
  }
}

const saved = reactive<Record<string, DetectableFormat[]>>(readSettings())
if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return
    const next = readSettings()
    for (const key of Object.keys(saved)) delete saved[key]
    Object.assign(saved, next)
  })

export function useAutoFormatSettings() {
  function formatsFor(
    id: string | undefined,
    windowIds: readonly string[] = [],
  ): DetectableFormat[] {
    if (id && saved[id]) return saved[id]
    if (id && defaults[id]) return defaults[id]
    if (windowIds.some((name) => name.startsWith('gnssraw-'))) return defaults.gnssraw
    if (windowIds.some((name) => name.startsWith('lidar-'))) return defaults.lidar
    if (windowIds.some((name) => name.startsWith('gnss-'))) return defaults.gnss
    return defaults.serial
  }
  function setFormats(id: string, formats: readonly DetectableFormat[]): void {
    saved[id] = DETECTABLE_FORMATS.filter((format) => formats.includes(format))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
  }
  function resetFormats(id: string): void {
    delete saved[id]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
  }
  return { formatsFor, setFormats, resetFormats }
}
