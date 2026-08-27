import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { TerminalService } from '../../electron/main/services/TerminalService'
import { sshConnectionKey, type SshConnectionProfile } from '@/core/terminal/TerminalTypes'

vi.mock('node-pty', () => ({ spawn: vi.fn() }))

interface TrackedSession {
  type: 'pty' | 'ssh'
  info: { id: string; cwd?: string }
  oscTail: string
}

function createService() {
  const broadcasts: Array<{ channel: string; payload: unknown }> = []
  const service = new TerminalService(path.join(tmpdir(), `nav-tools-cwd-${Date.now()}`), (c, p) =>
    broadcasts.push({ channel: c, payload: p }),
  )
  const trackCwd = (session: TrackedSession, data: string) =>
    (
      service as unknown as {
        trackCwd(session: TrackedSession, data: string): void
      }
    ).trackCwd(session, data)
  return { broadcasts, trackCwd }
}

function makeProfile(overrides: Partial<SshConnectionProfile> = {}): SshConnectionProfile {
  return {
    id: 'p1',
    name: 'Robot',
    source: 'nav-tools',
    host: '192.0.2.10',
    port: 22,
    username: 'root',
    authMethod: 'password',
    privateKeyPath: '',
    proxyJump: '',
    initialDirectory: '',
    forwards: [],
    ...overrides,
  }
}

describe('TerminalService cwd tracking (OSC 7 / OSC 9;9)', () => {
  it('parses OSC 7 terminated by BEL and broadcasts terminal-cwd', () => {
    const { broadcasts, trackCwd } = createService()
    const session: TrackedSession = { type: 'ssh', info: { id: 's1' }, oscTail: '' }

    trackCwd(session, 'prompt$ \x1b]7;file://ubuntu/home/winchell/projects\x07')

    expect(session.info.cwd).toBe('/home/winchell/projects')
    expect(broadcasts).toContainEqual({
      channel: 'terminal-cwd',
      payload: { sessionId: 's1', cwd: '/home/winchell/projects' },
    })
  })

  it('parses OSC 7 terminated by ST and ignores unchanged cwd', () => {
    const { broadcasts, trackCwd } = createService()
    const session: TrackedSession = { type: 'ssh', info: { id: 's1' }, oscTail: '' }

    trackCwd(session, '\x1b]7;file://ubuntu/opt/data\x1b\\')
    trackCwd(session, '\x1b]7;file://ubuntu/opt/data\x1b\\')

    expect(session.info.cwd).toBe('/opt/data')
    expect(broadcasts.filter((entry) => entry.channel === 'terminal-cwd')).toHaveLength(1)
  })

  it('reassembles an OSC 7 sequence split across output chunks', () => {
    const { broadcasts, trackCwd } = createService()
    const session: TrackedSession = { type: 'ssh', info: { id: 's1' }, oscTail: '' }

    trackCwd(session, 'text \x1b]7;file://ubuntu/ho')
    expect(session.info.cwd).toBeUndefined()
    trackCwd(session, 'me/winchell\x07 trailing')

    expect(session.info.cwd).toBe('/home/winchell')
    expect(broadcasts).toContainEqual({
      channel: 'terminal-cwd',
      payload: { sessionId: 's1', cwd: '/home/winchell' },
    })
  })

  it('parses ConPTY style OSC 9;9 cwd reports', () => {
    const { trackCwd } = createService()
    const session: TrackedSession = { type: 'pty', info: { id: 's2' }, oscTail: '' }

    trackCwd(session, '\x1b]9;9;"C:\\Users\\essz"\x07')

    expect(session.info.cwd).toBe('C:\\Users\\essz')
  })

  it('converts MSYS drive paths reported by git-bash into Windows paths', () => {
    const { trackCwd } = createService()
    const session: TrackedSession = { type: 'pty', info: { id: 's3' }, oscTail: '' }

    trackCwd(session, '\x1b]7;file://host/c/Users/essz/work\x07')

    expect(session.info.cwd).toBe('C:/Users/essz/work')
  })
})

describe('sshConnectionKey', () => {
  it('matches profiles with identical connection parameters', () => {
    expect(sshConnectionKey(makeProfile())).toBe(sshConnectionKey(makeProfile({ id: 'other' })))
  })

  it('differentiates profiles by host, port, username and auth method', () => {
    const base = sshConnectionKey(makeProfile())
    expect(sshConnectionKey(makeProfile({ host: '192.0.2.11' }))).not.toBe(base)
    expect(sshConnectionKey(makeProfile({ port: 2222 }))).not.toBe(base)
    expect(sshConnectionKey(makeProfile({ username: 'admin' }))).not.toBe(base)
    expect(sshConnectionKey(makeProfile({ authMethod: 'agent' }))).not.toBe(base)
  })
})
