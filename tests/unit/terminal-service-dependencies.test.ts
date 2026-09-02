import { EventEmitter } from 'node:events'
import type { IPty } from 'node-pty'
import type { Client, ClientChannel } from 'ssh2'
import { describe, expect, it, vi } from 'vitest'
import { TerminalService } from '../../electron/main/services/TerminalService'
import {
  createNodeTerminalServiceHost,
  type TerminalPortForwarder,
  type TerminalServiceHost,
} from '../../electron/main/services/TerminalServiceHost'
import type { TerminalCreateRequest } from '@/core/terminal/TerminalTypes'

function createHost(overrides: Partial<TerminalServiceHost> = {}): TerminalServiceHost {
  return {
    ...createNodeTerminalServiceHost(),
    platform: 'linux',
    environment: {},
    homedir: () => '/home/tester',
    username: () => 'tester',
    now: () => 1_000,
    createId: (prefix) => `${prefix}-test`,
    ...overrides,
  }
}

function createPty(): IPty {
  return {
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  } as unknown as IPty
}

function sshRequest(): TerminalCreateRequest {
  return {
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
      initialDirectory: '/srv/project',
      forwards: [],
    },
    sshSecrets: { password: 'secret' },
  }
}

describe('TerminalService constructor dependencies', () => {
  it('uses the injected runtime and process adapter when detecting capabilities', async () => {
    const executeFile = vi.fn(async () => Buffer.from('Ubuntu\r\nDebian\r\n', 'utf16le'))
    const service = new TerminalService(
      'C:\\data',
      () => undefined,
      createHost({ platform: 'win32', executeFile }),
    )

    await expect(service.getCapabilities()).resolves.toEqual({
      platform: 'win32',
      localShells: [
        { kind: 'powershell', label: 'PowerShell', executable: 'powershell.exe' },
        { kind: 'cmd', label: 'Command Prompt', executable: 'cmd.exe' },
      ],
      wslDistros: ['Ubuntu', 'Debian'],
      sshAvailable: true,
    })
    expect(executeFile).toHaveBeenCalledWith('wsl.exe', ['--list', '--quiet'], {
      windowsHide: true,
    })
  })

  it('creates and controls a local session through the injected PTY adapter', async () => {
    const processHandle = createPty()
    const spawnPty = vi.fn(() => processHandle)
    const service = new TerminalService(
      '/data',
      () => undefined,
      createHost({
        environment: { SHELL: '/bin/fish' },
        spawnPty: spawnPty as TerminalServiceHost['spawnPty'],
      }),
    )

    const session = await service.create({ kind: 'local', cols: 80, rows: 24 })
    service.write(session.id, 'pwd\r')
    service.resize(session.id, 100, 30)
    await service.close(session.id)

    expect(session).toMatchObject({
      id: 'term-test',
      kind: 'local',
      title: 'fish',
      cwd: '/home/tester',
    })
    expect(spawnPty).toHaveBeenCalledWith(
      '/bin/fish',
      ['-l'],
      expect.objectContaining({ cwd: '/home/tester', cols: 80, rows: 24 }),
    )
    expect(processHandle.write).toHaveBeenCalledWith('pwd\r')
    expect(processHandle.resize).toHaveBeenCalledWith(100, 30)
    expect(processHandle.kill).toHaveBeenCalledOnce()
  })

  it('creates SSH clients and port forwarders only through injected factories', async () => {
    const stream = Object.assign(new EventEmitter(), {
      stderr: new EventEmitter(),
      write: vi.fn(),
      setWindow: vi.fn(),
      close: vi.fn(),
    }) as unknown as ClientChannel
    const client = Object.assign(new EventEmitter(), {
      connect: vi.fn(() => {
        client.emit('ready')
        return client
      }),
      shell: vi.fn(
        (
          _options: unknown,
          callback: (error: Error | undefined, channel: ClientChannel) => void,
        ) => {
          callback(undefined, stream)
          return client
        },
      ),
      end: vi.fn(),
      destroy: vi.fn(),
    }) as unknown as Client
    const forwarder: TerminalPortForwarder = {
      startEnabled: vi.fn(async () => undefined),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      stopAll: vi.fn(async () => undefined),
    }
    const createSshClient = vi.fn(() => client)
    const createPortForwarder = vi.fn(() => forwarder)
    const service = new TerminalService(
      '/data',
      () => undefined,
      createHost({ createSshClient, createPortForwarder }),
    )

    const session = await service.create(sshRequest())
    await service.close(session.id)

    expect(session).toMatchObject({
      id: 'term-test',
      kind: 'ssh',
      title: 'Robot',
      cwd: '/srv/project',
    })
    expect(stream.write).toHaveBeenCalledWith("cd -- '/srv/project'\r")
    expect(createSshClient).toHaveBeenCalledOnce()
    expect(createPortForwarder).toHaveBeenCalledWith(
      client,
      'ssh-connection-test',
      expect.any(Function),
    )
    expect(forwarder.startEnabled).toHaveBeenCalledWith([])
    expect(forwarder.stopAll).toHaveBeenCalledOnce()
    expect(client.end).toHaveBeenCalledOnce()
  })
})
