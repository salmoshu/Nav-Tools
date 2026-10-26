import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Client, ClientChannel } from 'ssh2'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CameraScriptInjector,
  type CameraScriptEvent,
  type CameraScriptRequest,
} from '../../electron/main/services/CameraScriptInjector'

const tempDirectories: string[] = []

async function createFiles(names: string[]): Promise<string[]> {
  const directory = await fs.promises.mkdtemp(path.join(tmpdir(), 'navtools-camera-script-'))
  tempDirectories.push(directory)
  return Promise.all(
    names.map(async (name) => {
      const localPath = path.join(directory, name)
      await fs.promises.writeFile(localPath, 'echo test\n')
      return localPath
    }),
  )
}

function request(localPaths: string[]): CameraScriptRequest {
  return {
    host: '192.0.2.14',
    port: 22,
    username: 'root',
    password: 'secret',
    localPaths,
    timeoutS: 30,
  }
}

class FakeSsh {
  public readonly client: Client
  public readonly uploads: Array<{ localPath: string; remotePath: string }> = []
  public readonly commands: string[] = []
  public readonly connect = vi.fn()
  public readonly end = vi.fn()
  public firstExecution: Promise<void>
  private announceFirstExecution: () => void = () => undefined
  private executionIndex = 0
  private announced = false

  public constructor(
    private readonly exitCodes: number[] = [0, 0],
    private readonly holdExecution = false,
  ) {
    this.firstExecution = new Promise((resolve) => {
      this.announceFirstExecution = resolve
    })
    const client = new EventEmitter()
    const stream = () =>
      Object.assign(new EventEmitter(), {
        stderr: new EventEmitter(),
        close: vi.fn(function (this: EventEmitter) {
          this.emit('close')
        }),
      }) as unknown as ClientChannel
    Object.assign(client, {
      connect: this.connect.mockImplementation(() => {
        queueMicrotask(() => client.emit('ready'))
        return client
      }),
      end: this.end,
      sftp: (callback: (error: Error | undefined, sftp: unknown) => void) => {
        callback(undefined, {
          fastPut: (localPath: string, remotePath: string, done: (error?: Error) => void) => {
            this.uploads.push({ localPath, remotePath })
            queueMicrotask(() => done())
          },
        })
      },
      exec: (
        command: string,
        callback: (error: Error | undefined, channel: ClientChannel) => void,
      ) => {
        this.commands.push(command)
        const channel = stream()
        callback(undefined, channel)
        if (command.includes('__EXIT')) {
          if (!this.announced) {
            this.announced = true
            this.announceFirstExecution()
          }
          if (!this.holdExecution) {
            const code = this.exitCodes[this.executionIndex++] ?? 0
            queueMicrotask(() => {
              channel.emit('data', Buffer.from(`__EXIT:${code}\n`))
              channel.emit('close')
            })
          }
        } else {
          queueMicrotask(() => channel.emit('close'))
        }
        return client
      },
    })
    this.client = client as unknown as Client
  }
}

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => fs.promises.rm(directory, { recursive: true, force: true })),
  )
})

describe('CameraScriptInjector 多文件生命周期', () => {
  it('在一个 SSH 连接中按顺序执行并清理多个脚本', async () => {
    const paths = await createFiles(['first.sh', 'second.sh'])
    const ssh = new FakeSsh()
    const injector = new CameraScriptInjector(() => ssh.client)
    const events: CameraScriptEvent[] = []

    await injector.run(request(paths), (event) => events.push(event))

    expect(ssh.connect).toHaveBeenCalledOnce()
    expect(ssh.uploads.map((upload) => path.basename(upload.localPath))).toEqual([
      'first.sh',
      'second.sh',
    ])
    expect(ssh.uploads.every((upload) => upload.remotePath.startsWith('/tmp/'))).toBe(true)
    expect(ssh.commands.filter((command) => command.includes('__EXIT'))).toHaveLength(2)
    expect(ssh.commands.filter((command) => command.startsWith('rm -f'))).toHaveLength(2)
    expect(
      events.filter((event) => event.type === 'state' && event.state === 'running'),
    ).toHaveLength(2)
    expect(events.at(-1)).toMatchObject({
      type: 'state',
      state: 'success',
      detail: '全部 2 个脚本执行完成（退出码 0）',
    })
    expect(ssh.end).toHaveBeenCalledOnce()
  })

  it('任一脚本失败后不执行后续文件', async () => {
    const paths = await createFiles(['first.sh', 'second.sh'])
    const ssh = new FakeSsh([3, 0])
    const injector = new CameraScriptInjector(() => ssh.client)
    const events: CameraScriptEvent[] = []

    await expect(injector.run(request(paths), (event) => events.push(event))).rejects.toThrow(
      '脚本 first.sh 退出码 3',
    )

    expect(ssh.uploads).toHaveLength(1)
    expect(ssh.commands.filter((command) => command.includes('__EXIT'))).toHaveLength(1)
    expect(events.at(-1)).toMatchObject({ type: 'state', state: 'error' })
  })

  it('停止当前脚本后不开始队列中的下一项，并拒绝并发执行', async () => {
    const paths = await createFiles(['first.sh', 'second.sh'])
    const ssh = new FakeSsh([0, 0], true)
    const injector = new CameraScriptInjector(() => ssh.client)
    const events: CameraScriptEvent[] = []
    const running = injector.run(request(paths), (event) => events.push(event))
    await ssh.firstExecution

    await expect(injector.run(request(paths), () => undefined)).rejects.toThrow('已有脚本正在执行')
    injector.stop()
    await running

    expect(ssh.uploads).toHaveLength(1)
    expect(ssh.commands.filter((command) => command.includes('__EXIT'))).toHaveLength(1)
    expect(events.at(-1)).toMatchObject({ type: 'state', state: 'stopped' })
    expect(injector.isActive()).toBe(false)
  })

  it('成对发布包只进入部署器，不建立脚本 SSH 连接', async () => {
    const paths = await createFiles([
      'e-wagon-0.5.3-aarch64-20261026_0845.tar.gz',
      'e-wagon-lidar-1.3.2-aarch64-20261026_0846.tar.gz',
    ])
    const ssh = new FakeSsh()
    const deployer = {
      run: vi.fn(async (_request: unknown, _packages: unknown, onOutput: (text: string) => void) =>
        onOutput('deployment output\n'),
      ),
      stop: vi.fn(),
    }
    const injector = new CameraScriptInjector(() => ssh.client, deployer)
    const events: CameraScriptEvent[] = []

    await injector.run(request([paths[1], paths[0]]), (event) => events.push(event))

    expect(deployer.run).toHaveBeenCalledWith(
      expect.objectContaining({ host: '192.0.2.14' }),
      { hostPath: paths[0], lidarPath: paths[1] },
      expect.any(Function),
    )
    expect(ssh.connect).not.toHaveBeenCalled()
    expect(events).toContainEqual({ type: 'output', text: 'deployment output\n' })
    expect(events.at(-1)).toMatchObject({ type: 'state', state: 'success' })
  })
})
