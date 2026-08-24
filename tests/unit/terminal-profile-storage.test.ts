import { describe, expect, it } from 'vitest'
import { createSshProfile, TerminalProfileStorage } from '@/core/terminal/TerminalProfileStorage'
import { createPortForwardRule } from '@/core/terminal/TerminalTypes'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

describe('TerminalProfileStorage', () => {
  it('persists SSH profiles and all three port-forwarding types without secrets', () => {
    const backend = new MemoryStorage()
    const storage = new TerminalProfileStorage(backend)
    const profile = createSshProfile()
    Object.assign(profile, { name: 'Robot', host: '10.0.0.8', username: 'root' })
    profile.forwards = [
      createPortForwardRule('local'),
      createPortForwardRule('remote'),
      createPortForwardRule('dynamic'),
    ]

    storage.save(profile)
    const restored = new TerminalProfileStorage(backend).list()[0]
    expect(restored.forwards.map((rule) => rule.kind)).toEqual(['local', 'remote', 'dynamic'])
    expect(JSON.stringify(restored)).not.toContain('password')
    expect(JSON.stringify(restored)).not.toContain('passphrase')
  })

  it('rejects incomplete profiles', () => {
    const storage = new TerminalProfileStorage(new MemoryStorage())
    expect(() => storage.save(createSshProfile())).toThrow('required')
  })
})
