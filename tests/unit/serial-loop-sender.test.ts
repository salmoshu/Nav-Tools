import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SerialLoopSender,
  validateSerialLoopFrequency,
} from '../../src/core/serial/SerialLoopSender'

describe('SerialLoopSender', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends immediately and repeats at the configured frequency until stopped', () => {
    vi.useFakeTimers()
    const sender = new SerialLoopSender()
    const send = vi.fn()

    sender.start(2, send)
    expect(send).toHaveBeenCalledTimes(1)
    expect(sender.running).toBe(true)
    vi.advanceTimersByTime(499)
    expect(send).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(send).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1000)
    expect(send).toHaveBeenCalledTimes(4)

    sender.stop()
    vi.advanceTimersByTime(1000)
    expect(send).toHaveBeenCalledTimes(4)
    expect(sender.running).toBe(false)
  })

  it('restarts with a new frequency instead of stacking timers', () => {
    vi.useFakeTimers()
    const sender = new SerialLoopSender()
    const first = vi.fn()
    const second = vi.fn()

    sender.start(1, first)
    sender.start(10, second)
    vi.advanceTimersByTime(110)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
  })

  it('stops when a send fails and rejects invalid frequencies', () => {
    vi.useFakeTimers()
    const sender = new SerialLoopSender()
    sender.start(1, () => {
      throw new Error('disconnected')
    })
    expect(sender.running).toBe(false)
    expect(() => sender.start(Number.NaN, vi.fn())).toThrow(RangeError)
    expect(() => sender.start(0, vi.fn())).toThrow(RangeError)
    expect(() => sender.start(101, vi.fn())).toThrow(RangeError)
    expect(validateSerialLoopFrequency(0.1)).toBe(0.1)
    expect(validateSerialLoopFrequency(100)).toBe(100)
  })
})
