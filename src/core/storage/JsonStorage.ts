export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export class JsonStorage {
  public constructor(private readonly storage: StorageLike) {}

  public read<T>(key: string, fallback: T, validate?: (value: unknown) => value is T): T {
    try {
      const raw = this.storage.getItem(key)
      if (raw === null) return fallback
      const parsed: unknown = JSON.parse(raw)
      if (validate) return validate(parsed) ? parsed : fallback
      return parsed as T
    } catch {
      return fallback
    }
  }

  public write<T>(key: string, value: T): void {
    this.storage.setItem(key, JSON.stringify(value))
  }

  public readRaw(key: string): string | null {
    return this.storage.getItem(key)
  }

  public writeRaw(key: string, value: string): void {
    this.storage.setItem(key, value)
  }

  public remove(key: string): void {
    this.storage.removeItem(key)
  }
}
