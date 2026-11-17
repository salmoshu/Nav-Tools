import { ref, watch, type Ref } from 'vue'
import { JsonStorage } from '@/core/storage/JsonStorage'

const STORAGE_KEY = 'nav-tools:view-selections:v1'
const storage = new JsonStorage(localStorage)

type SelectionValue = string | number

function readSelections(): Record<string, SelectionValue> {
  const value = storage.read<Record<string, SelectionValue>>(
    STORAGE_KEY,
    {},
    (candidate): candidate is Record<string, SelectionValue> =>
      typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate),
  )
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) => typeof item === 'string' || typeof item === 'number',
    ),
  )
}

export function usePersistentSelection<T extends SelectionValue>(
  key: string,
  fallback: T,
  allowed: readonly T[] | (() => readonly T[]),
): Ref<T> {
  const options = typeof allowed === 'function' ? allowed : () => allowed
  const stored = readSelections()[key]
  const selected = ref(
    stored !== undefined && options().includes(stored as T) ? (stored as T) : fallback,
  ) as Ref<T>

  watch(
    selected,
    (value) => {
      if (!options().includes(value)) {
        selected.value = fallback
        return
      }
      const selections = readSelections()
      selections[key] = value
      try {
        storage.write(STORAGE_KEY, selections)
      } catch {
        // The current view still works when persistent storage is unavailable.
      }
    },
    { flush: 'sync' },
  )

  return selected
}
