import { describe, expect, it } from 'vitest'
import { RecentInputFiles } from '@/core/file/RecentInputFiles'
import { JsonStorage, type StorageLike } from '@/core/storage/JsonStorage'

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>()

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  public removeItem(key: string): void {
    this.values.delete(key)
  }
}

const RECENT_KEY = 'nav-tools:recent-input-files'
const LEGACY_MCAP_KEY = 'nav-tools:lidar:recent-mcap-files'

describe('RecentInputFiles', () => {
  it('records new entries at the front and dedupes by path', () => {
    const store = new RecentInputFiles(new JsonStorage(new MemoryStorage()))
    store.record({ path: '/a.log', name: 'a.log', sizeBytes: 1 })
    store.record({ path: '/b.mcap', name: 'b.mcap', sizeBytes: 2 })
    store.record({ path: '/a.log', name: 'a.log', sizeBytes: 3 })
    const list = store.list()
    expect(list.map((item) => item.path)).toEqual(['/a.log', '/b.mcap'])
    expect(list[0].sizeBytes).toBe(3)
  })

  it('caps the list at 10 entries', () => {
    const store = new RecentInputFiles(new JsonStorage(new MemoryStorage()))
    for (let index = 0; index < 12; index += 1) {
      store.record({ path: `/f${index}.log`, name: `f${index}.log`, sizeBytes: index })
    }
    const list = store.list()
    expect(list).toHaveLength(10)
    expect(list[0].path).toBe('/f11.log')
    expect(list.at(-1)?.path).toBe('/f2.log')
  })

  it('remove deletes the matching entry', () => {
    const store = new RecentInputFiles(new JsonStorage(new MemoryStorage()))
    store.record({ path: '/a.log', name: 'a.log', sizeBytes: 1 })
    store.record({ path: '/b.log', name: 'b.log', sizeBytes: 2 })
    store.remove('/a.log')
    expect(store.list().map((item) => item.path)).toEqual(['/b.log'])
  })

  it('migrates legacy MCAP entries once, keeping the newer openedAt per path', () => {
    const memory = new MemoryStorage()
    const storage = new JsonStorage(memory)
    storage.write(LEGACY_MCAP_KEY, [
      { path: '/old.mcap', name: 'old.mcap', sizeBytes: 1, openedAt: 100 },
      { path: '/shared.mcap', name: 'shared.mcap', sizeBytes: 1, openedAt: 100 },
    ])
    storage.write(RECENT_KEY, [
      { path: '/shared.mcap', name: 'shared.mcap', sizeBytes: 2, openedAt: 200 },
    ])
    const store = new RecentInputFiles(storage)
    const list = store.list()
    expect(list.map((item) => item.path)).toEqual(['/shared.mcap', '/old.mcap'])
    expect(list[0].sizeBytes).toBe(2)
    expect(memory.getItem(LEGACY_MCAP_KEY)).toBeNull()

    // 迁移只发生一次：之后出现的旧键内容不再并入
    storage.write(LEGACY_MCAP_KEY, [
      { path: '/late.mcap', name: 'late.mcap', sizeBytes: 1, openedAt: 300 },
    ])
    expect(store.list().map((item) => item.path)).toEqual(['/shared.mcap', '/old.mcap'])
  })
})
