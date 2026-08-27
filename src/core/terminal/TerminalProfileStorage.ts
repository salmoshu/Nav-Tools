import { createTerminalId, type SshConnectionProfile } from './TerminalTypes'

const STORAGE_KEY = 'nav-tools:terminal-ssh-profiles:v1'

export class TerminalProfileStorage {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>) {}

  list(): SshConnectionProfile[] {
    try {
      const raw = this.storage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as { version: number; profiles: SshConnectionProfile[] }
      if (parsed.version !== 1 || !Array.isArray(parsed.profiles)) return []
      return parsed.profiles.map(normalizeProfile)
    } catch {
      return []
    }
  }

  save(profile: SshConnectionProfile): SshConnectionProfile {
    const normalized = normalizeProfile({ ...profile, source: 'nav-tools' })
    const profiles = this.list()
    const index = profiles.findIndex((entry) => entry.id === normalized.id)
    if (index >= 0) profiles[index] = normalized
    else profiles.push(normalized)
    this.persist(profiles)
    return cloneProfile(normalized)
  }

  remove(id: string): void {
    this.persist(this.list().filter((entry) => entry.id !== id))
  }

  private persist(profiles: SshConnectionProfile[]): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, profiles }))
  }
}

export function createSshProfile(): SshConnectionProfile {
  return {
    id: createTerminalId('ssh'),
    name: '',
    source: 'nav-tools',
    host: '',
    port: 22,
    username: '',
    authMethod: 'password',
    privateKeyPath: '',
    proxyJump: '',
    initialDirectory: '',
    forwards: [],
  }
}

function normalizeProfile(profile: SshConnectionProfile): SshConnectionProfile {
  const name = String(profile.name || profile.host || '').trim()
  const host = String(profile.host || '').trim()
  const username = String(profile.username || '').trim()
  if (!name || !host || !username)
    throw new Error('SSH profile name, host and username are required')
  const port = Number(profile.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SSH port is invalid')
  return {
    ...profile,
    id: String(profile.id || createTerminalId('ssh')),
    name,
    host,
    username,
    port,
    source: profile.source === 'ssh-config' ? 'ssh-config' : 'nav-tools',
    privateKeyPath: String(profile.privateKeyPath || ''),
    proxyJump: String(profile.proxyJump || ''),
    initialDirectory: String(profile.initialDirectory || ''),
    forwards: Array.isArray(profile.forwards) ? profile.forwards.map((rule) => ({ ...rule })) : [],
  }
}

function cloneProfile(profile: SshConnectionProfile): SshConnectionProfile {
  return { ...profile, forwards: profile.forwards.map((rule) => ({ ...rule })) }
}
