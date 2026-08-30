import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TerminalService } from '../../electron/main/services/TerminalService'
import type { HostKeyPromptEvent } from '@/core/terminal/TerminalTypes'

const ptyHarness = vi.hoisted(() => ({
  dataHandler: undefined as ((data: string) => void) | undefined,
  process: {
    onData: vi.fn((handler: (data: string) => void) => {
      ptyHarness.dataHandler = handler
    }),
    onExit: vi.fn(),
    resize: vi.fn(),
    write: vi.fn(),
    kill: vi.fn(),
  },
}))

vi.mock('node-pty', () => ({ spawn: vi.fn(() => ptyHarness.process) }))

afterEach(() => vi.useRealTimers())

describe('TerminalService SSH timeouts', () => {
  it('aborts an in-flight SSH creation request by request id', async () => {
    const service = new TerminalService(
      path.join(tmpdir(), `nav-tools-cancel-create-${Date.now()}`),
      () => undefined,
    )
    ;(
      service as unknown as {
        createSshSession(request: unknown, signal: AbortSignal): Promise<never>
      }
    ).createSshSession = vi.fn(
      (_request: unknown, signal: AbortSignal) =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () =>
            reject(new DOMException('cancelled', 'AbortError')),
          ),
        ),
    )

    const pending = service.create({
      requestId: 'connect-request',
      kind: 'ssh',
      cols: 80,
      rows: 24,
      sshProfile: {
        id: 'robot',
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
      },
    })

    expect(service.cancelCreate('connect-request')).toBe(true)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(service.cancelCreate('connect-request')).toBe(false)
  })

  it('ignores a late resize after its terminal session has already been removed', () => {
    const service = new TerminalService(
      path.join(tmpdir(), `nav-tools-late-resize-${Date.now()}`),
      () => undefined,
    )

    expect(() => service.resize('removed-session', 80, 24)).not.toThrow()
  })

  it('does not classify terminal redraw output caused by a resize as tab activity', async () => {
    vi.useFakeTimers()
    const broadcasts: Array<{ channel: string; payload: unknown }> = []
    const service = new TerminalService(
      path.join(tmpdir(), `nav-tools-resize-output-${Date.now()}`),
      (channel, payload) => broadcasts.push({ channel, payload }),
    )
    const session = await service.create({
      kind: 'local',
      localShell: 'powershell',
      cols: 80,
      rows: 24,
    })
    broadcasts.length = 0

    service.resize(session.id, 100, 30)
    ptyHarness.dataHandler?.('\u001b[2J\u001b[HPS> ')

    expect(broadcasts).toContainEqual({
      channel: 'terminal-output',
      payload: {
        sessionId: session.id,
        data: '\u001b[2J\u001b[HPS> ',
        activity: false,
      },
    })

    await vi.advanceTimersByTimeAsync(251)
    ptyHarness.dataHandler?.('build finished\r\n')

    expect(broadcasts).toContainEqual({
      channel: 'terminal-output',
      payload: {
        sessionId: session.id,
        data: 'build finished\r\n',
        activity: true,
      },
    })
  })

  it('rejects an unanswered host-key prompt instead of waiting forever', async () => {
    vi.useFakeTimers()
    const broadcasts: Array<{ channel: string; payload: unknown }> = []
    const service = new TerminalService(
      path.join(tmpdir(), `nav-tools-host-key-${Date.now()}`),
      (channel, payload) => broadcasts.push({ channel, payload }),
    )
    const decision = vi.fn()

    await (
      service as unknown as {
        verifyHostKey(
          host: string,
          port: number,
          key: Buffer,
          callback: (accepted: boolean) => void,
        ): Promise<void>
      }
    ).verifyHostKey('192.0.2.10', 22, Buffer.from('test-host-key'), decision)

    expect(decision).not.toHaveBeenCalled()
    expect(broadcasts).toHaveLength(1)
    expect(broadcasts[0].channel).toBe('terminal-host-key-prompt')
    expect(broadcasts[0].payload).toMatchObject({
      host: '192.0.2.10',
      port: 22,
    } satisfies Partial<HostKeyPromptEvent>)

    await vi.advanceTimersByTimeAsync(30_000)

    expect(decision).toHaveBeenCalledOnce()
    expect(decision).toHaveBeenCalledWith(false)
  })
})
