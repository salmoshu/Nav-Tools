import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TerminalService } from '../../electron/main/services/TerminalService'
import type { HostKeyPromptEvent } from '@/core/terminal/TerminalTypes'

vi.mock('node-pty', () => ({ spawn: vi.fn() }))

afterEach(() => vi.useRealTimers())

describe('TerminalService SSH timeouts', () => {
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
