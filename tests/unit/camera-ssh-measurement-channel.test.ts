// @vitest-environment node
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CameraSshMeasurementChannel } from '../../electron/main/services/CameraSshMeasurementChannel'

const ssh = vi.hoisted(() => ({ connect: vi.fn(), exec: vi.fn(), end: vi.fn() }))
vi.mock('ssh2', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    Client: class extends EventEmitter {
      connect() {
        ssh.connect(this)
        return this
      }
      exec = ssh.exec
      end = ssh.end
    },
  }
})

describe('CameraSshMeasurementChannel 退出原因', () => {
  let stream: EventEmitter & { stderr: EventEmitter; close: () => void }

  beforeEach(() => {
    vi.clearAllMocks()
    stream = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), close: vi.fn() })
    ssh.connect.mockImplementation((client) => queueMicrotask(() => client.emit('ready')))
    ssh.exec.mockImplementation((_command, callback) => callback(null, stream))
  })

  afterEach(() => vi.useRealTimers())

  it('SSH 保持连接时超过 300 秒仍持续接收测量，不启动固定时限命令', async () => {
    vi.useFakeTimers()
    const channel = new CameraSshMeasurementChannel()
    const handlers = { onText: vi.fn(), onStatus: vi.fn(), onError: vi.fn() }
    await channel.start(
      { host: 'camera.test', port: 22, username: 'root', password: 'test' },
      handlers,
    )
    expect(ssh.exec.mock.calls[0][0]).not.toMatch(/\btimeout\b/)
    await vi.advanceTimersByTimeAsync(301_000)
    stream.emit('data', Buffer.from('write(13</dev/ttyS6>, "after-limit\\r\\n", 13) = 13\n'))
    expect(handlers.onText).toHaveBeenLastCalledWith('after-limit\r\n')
    expect(handlers.onError).not.toHaveBeenCalled()
    expect(channel.isActive()).toBe(true)
  })

  it('SSH 连接断开时退出测量状态，通知界面并允许重新建立通道', async () => {
    let client: EventEmitter | undefined
    ssh.connect.mockImplementation((value) => {
      client = value
      queueMicrotask(() => value.emit('ready'))
    })
    const channel = new CameraSshMeasurementChannel()
    const handlers = { onText: vi.fn(), onStatus: vi.fn(), onError: vi.fn() }
    await channel.start(
      { host: 'camera.test', port: 22, username: 'root', password: 'test' },
      handlers,
    )
    client?.emit('close')
    expect(channel.isActive()).toBe(false)
    expect(handlers.onStatus).toHaveBeenLastCalledWith(
      'stopped',
      expect.stringMatching(/SSH.*断开/),
    )
    expect(handlers.onError).toHaveBeenCalledOnce()
    stream.emit('close', 143)
    expect(handlers.onError).toHaveBeenCalledOnce()
  })

  it('旧 SSH 通道无响应时清理会超时返回，不阻塞再次连接', async () => {
    const channel = new CameraSshMeasurementChannel()
    await channel.start(
      { host: 'camera.test', port: 22, username: 'root', password: 'test' },
      { onText: vi.fn(), onStatus: vi.fn(), onError: vi.fn() },
    )
    ssh.exec.mockImplementation(() => undefined)
    vi.useFakeTimers()
    const completed = vi.fn()
    const pending = channel.stopAndVerify().then(completed)
    await vi.advanceTimersByTimeAsync(3100)
    expect(completed).toHaveBeenCalledWith(
      expect.objectContaining({
        straceCleared: false,
        tracerPidZero: false,
        tracerPid: 'unknown',
      }),
    )
    await pending
    expect(ssh.end).toHaveBeenCalled()
    expect(channel.isActive()).toBe(false)
  })

  it('采样启动命令没有返回时给出超时错误', async () => {
    ssh.exec.mockImplementation(() => undefined)
    vi.useFakeTimers()
    const channel = new CameraSshMeasurementChannel()
    const rejected = vi.fn()
    const pending = channel
      .start(
        { host: 'camera.test', port: 22, username: 'root', password: 'test' },
        { onText: vi.fn(), onStatus: vi.fn(), onError: vi.fn() },
      )
      .catch(rejected)
    await vi.advanceTimersByTimeAsync(5100)
    expect(rejected).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/启动采样.*超时/) }),
    )
    await pending
    expect(channel.isActive()).toBe(false)
  })

  it('SSH 在认证完成前关闭时立即报错', async () => {
    ssh.connect.mockImplementation((client) => queueMicrotask(() => client.emit('close')))
    const channel = new CameraSshMeasurementChannel()
    const rejected = vi.fn()
    const pending = channel
      .start(
        { host: 'camera.test', port: 22, username: 'root', password: 'test' },
        { onText: vi.fn(), onStatus: vi.fn(), onError: vi.fn() },
      )
      .catch(rejected)
    await new Promise((resolve) => setImmediate(resolve))
    expect(rejected).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/SSH.*关闭/) }),
    )
    await pending
  })

  it.each([
    [124, /退出码 124/],
    [1, /退出码 1/],
  ])('将采样退出码 %s 对应的原因交给测量状态', async (code, reason) => {
    const channel = new CameraSshMeasurementChannel()
    const handlers = { onText: vi.fn(), onStatus: vi.fn(), onError: vi.fn() }
    await channel.start(
      { host: 'camera.test', port: 22, username: 'root', password: 'test' },
      handlers,
    )

    stream.emit('close', code)

    expect(handlers.onError).toHaveBeenCalledWith(expect.stringMatching(reason))
    expect(handlers.onStatus).toHaveBeenLastCalledWith('stopped', expect.stringMatching(reason))
  })
})
