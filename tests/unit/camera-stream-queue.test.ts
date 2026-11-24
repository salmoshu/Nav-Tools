import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { CameraStreamService } from '../../electron/main/services/CameraStreamService'

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn, default: { spawn } }))

describe('camera video backpressure', () => {
  it('keeps one frame in flight and delivers only the newest waiting frame', () => {
    const process = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
      killed: false,
    })
    spawn.mockReturnValue(process)
    const send = vi.fn()
    const service = new CameraStreamService('ffmpeg')
    const frames = () => send.mock.calls
      .filter(([channel]) => channel === 'camera-stream-frame')
      .map(([, payload]) => payload as { frameId: number; bytes: Uint8Array })
    const write = (marker: number) =>
      process.stdout.emit('data', Buffer.from([0xff, 0xd8, marker, 0xff, 0xd9]))

    service.start(1, 'rtsp://127.0.0.1/video', { isDestroyed: () => false, send })
    write(1)
    write(2)
    write(3)
    expect(frames().map((frame) => frame.bytes[2])).toEqual([1])
    service.acknowledgeFrame(1, frames()[0].frameId)
    expect(frames().map((frame) => frame.bytes[2])).toEqual([1, 3])
    write(4)
    service.stop(1)
    service.acknowledgeFrame(1, frames()[1].frameId)
    write(5)
    expect(process.kill).toHaveBeenCalledOnce()
    expect(frames().map((frame) => frame.bytes[2])).toEqual([1, 3])
  })
})
