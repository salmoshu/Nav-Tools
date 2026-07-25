import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mock activeDataTransport
vi.mock('@/core/device/ActiveDataTransport', () => ({
  activeDataTransport: {
    current: 'serial' as string | undefined,
    activate: vi.fn(),
    clear: vi.fn(),
    sendChannel: vi.fn(),
  },
}))

import { useConsole } from '@/composables/flow/useConsole'

describe('useConsole none-format line buffering', () => {
  let console: ReturnType<typeof useConsole>

  beforeEach(() => {
    vi.useFakeTimers()
    console = useConsole(true)
    console.clearMessages()
    console.dataFormat.value = 'none'
  })

  afterEach(() => {
    vi.useRealTimers()
    console.clearMessages()
  })

  it('emits a complete line immediately when newline is present', () => {
    console.addMessage('[ctl] mode=OK speed=LOW(3)\r\n')

    // Flush pending messages (200ms batch timer)
    vi.advanceTimersByTime(250)

    expect(console.messages.value.length).toBe(1)
    expect(console.messages.value[0].raw).toBe('[ctl] mode=OK speed=LOW(3)')
  })

  it('buffers partial data without a newline and does not emit', () => {
    console.addMessage('[ctl] mode=OK speed=L')

    // Advance past the batch flush timer but before the none-flush timer (300ms)
    vi.advanceTimersByTime(250)

    // No message should be emitted yet because there's no newline
    expect(console.messages.value.length).toBe(0)
  })

  it('assembles split chunks into a single complete message', () => {
    // Simulate serial port delivering a message in 3 chunks
    console.addMessage('[ctl] mode=SYS_ERROR speed=LOW(3')
    vi.advanceTimersByTime(250)
    expect(console.messages.value.length).toBe(0)

    console.addMessage(') dir=FORWARD(1) ult=9999.000m a')
    vi.advanceTimersByTime(250)
    expect(console.messages.value.length).toBe(0)

    console.addMessage('ngle=0.00 dist=0.00\r\n')
    vi.advanceTimersByTime(250)

    // Should be a single complete message
    expect(console.messages.value.length).toBe(1)
    expect(console.messages.value[0].raw).toBe(
      '[ctl] mode=SYS_ERROR speed=LOW(3) dir=FORWARD(1) ult=9999.000m angle=0.00 dist=0.00',
    )
  })

  it('splits multiple lines in a single chunk into separate messages', () => {
    console.addMessage('line1\nline2\nline3\n')

    vi.advanceTimersByTime(250)

    expect(console.messages.value.length).toBe(3)
    expect(console.messages.value[0].raw).toBe('line1')
    expect(console.messages.value[1].raw).toBe('line2')
    expect(console.messages.value[2].raw).toBe('line3')
  })

  it('flushes buffered data after 300ms of inactivity (no newline)', () => {
    console.addMessage('no-newline-here')

    // Before flush timer (300ms), no message
    vi.advanceTimersByTime(250)
    expect(console.messages.value.length).toBe(0)

    // After none-flush timer (300ms) + batch flush (200ms) = 500ms total
    vi.advanceTimersByTime(300)
    expect(console.messages.value.length).toBe(1)
    expect(console.messages.value[0].raw).toBe('no-newline-here')
  })

  it('resets the flush timer when new data arrives before timeout', () => {
    console.addMessage('part1 ')

    // Advance 200ms (before flush)
    vi.advanceTimersByTime(200)
    expect(console.messages.value.length).toBe(0)

    // More data arrives, resetting the timer
    console.addMessage('part2 ')

    // Advance 200ms again (total 400ms since part1, 200ms since part2)
    vi.advanceTimersByTime(200)
    expect(console.messages.value.length).toBe(0)

    // After 300ms from part2 (none-flush at 500ms) + batch flush (200ms) = 700ms total
    vi.advanceTimersByTime(300)
    expect(console.messages.value.length).toBe(1)
    expect(console.messages.value[0].raw).toBe('part1 part2 ')
  })

  it('clearMessages resets the buffer and cancels pending flush', () => {
    console.addMessage('buffered-data-no-newline')

    vi.advanceTimersByTime(100)
    console.clearMessages()

    // Advance past the flush timer - nothing should be emitted
    vi.advanceTimersByTime(500)
    expect(console.messages.value.length).toBe(0)
  })

  it('handles \\r\\n line endings correctly', () => {
    console.addMessage('hello\r\nworld\r\n')

    vi.advanceTimersByTime(250)

    expect(console.messages.value.length).toBe(2)
    expect(console.messages.value[0].raw).toBe('hello')
    expect(console.messages.value[1].raw).toBe('world')
  })

  it('handles standalone \\r as line separator', () => {
    console.addMessage('hello\rworld\r')

    vi.advanceTimersByTime(250)

    expect(console.messages.value.length).toBe(2)
    expect(console.messages.value[0].raw).toBe('hello')
    expect(console.messages.value[1].raw).toBe('world')
  })

  it('skips empty lines', () => {
    console.addMessage('line1\n\n\nline2\n')

    vi.advanceTimersByTime(250)

    expect(console.messages.value.length).toBe(2)
    expect(console.messages.value[0].raw).toBe('line1')
    expect(console.messages.value[1].raw).toBe('line2')
  })

  it('keeps the last incomplete line in buffer for next chunk', () => {
    console.addMessage('line1\nincomplete')

    vi.advanceTimersByTime(250)
    expect(console.messages.value.length).toBe(1)
    expect(console.messages.value[0].raw).toBe('line1')

    // Next chunk completes the line
    console.addMessage('-data\n')
    vi.advanceTimersByTime(250)

    expect(console.messages.value.length).toBe(2)
    expect(console.messages.value[1].raw).toBe('incomplete-data')
  })
})
