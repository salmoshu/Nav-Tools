import { describe, expect, it } from 'vitest'
import { IapProfileStorage } from '@/core/iap/IapProfileStorage'
import { IGK_IAP_TEMPLATE } from '@/core/iap/IapProtocol'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

describe('IapProfileStorage', () => {
  it('always exposes the immutable IGK template first', () => {
    const storage = new IapProfileStorage(new MemoryStorage())
    expect(storage.list()[0]).toMatchObject({ id: 'builtin-igk-iap', builtin: true })
    expect(() => storage.remove(IGK_IAP_TEMPLATE.id)).toThrow('cannot be removed')
  })

  it('saves, exports and imports custom protocol templates', () => {
    const first = new IapProfileStorage(new MemoryStorage())
    first.save({
      id: 'custom-one',
      name: 'Custom One',
      config: { ...IGK_IAP_TEMPLATE.config, baudRate: 921600 },
    })

    const exported = first.exportJson()
    const second = new IapProfileStorage(new MemoryStorage())
    expect(second.importJson(exported)).toHaveLength(1)
    expect(second.list()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'custom-one', name: 'Custom One' })]),
    )
    expect(second.list().find((entry) => entry.id === 'custom-one')?.config.baudRate).toBe(921600)
  })

  it('rejects malformed template files', () => {
    const storage = new IapProfileStorage(new MemoryStorage())
    expect(() => storage.importJson('{"schema":"other","version":1,"profiles":[]}')).toThrow(
      'Unsupported',
    )
  })
})
