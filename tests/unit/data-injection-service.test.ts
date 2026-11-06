// @vitest-environment node
import net from 'node:net'
import dgram from 'node:dgram'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DataInjectionService,
  type InjectionTarget,
} from '../../electron/main/services/DataInjectionService'
import { NetworkConnectionService } from '../../electron/main/services/NetworkConnectionService'
import { NtripResponseParser } from '../../electron/main/services/NtripConnection'
import type { InjectionConnection } from '../../electron/main/services/InjectionConnection'
import { createDefaultInjectionSettings } from '../../src/core/data/DataInjection'

const services: DataInjectionService[] = []
const networks: NetworkConnectionService[] = []
const servers: net.Server[] = []
const sockets = new Set<net.Socket>()
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.stop()))
  await Promise.all(networks.splice(0).map((service) => service.close()))
  for (const socket of sockets) socket.destroy()
  sockets.clear()
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  )
})

async function listen(handler: (socket: net.Socket) => void): Promise<number> {
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.setNoDelay(true)
    handler(socket)
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not bind')
  return address.port
}

function config(port: number) {
  const settings = createDefaultInjectionSettings()
  Object.assign(settings.network, {
    host: '127.0.0.1',
    port,
    mountpoint: '/RTCM3',
    username: 'rover',
    password: 'secret',
    sendGga: false,
  })
  return settings
}

function recordTarget() {
  const chunks: Buffer[] = []
  const target: InjectionTarget = {
    id: 'serial:1',
    label: 'COM7',
    serialPath: 'COM7',
    write: async (data) => {
      chunks.push(Buffer.from(data))
    },
  }
  const service = new DataInjectionService(() => target, undefined, undefined, 20)
  services.push(service)
  return { service, chunks, target }
}

function serveRequest(socket: net.Socket, response: (request: string) => void) {
  let request = ''
  const receive = (data: Buffer) => {
    request += data.toString('ascii')
    if (request.includes('\r\n\r\n')) {
      socket.off('data', receive)
      response(request)
    }
  }
  socket.on('data', receive)
}

describe('data injection transport', () => {
  it('authenticates against a caster and forwards only binary correction bytes to the serial writer', async () => {
    const correction = Buffer.from([0xd3, 0, 0xff, 0x80, 13, 10])
    let request = ''
    const port = await listen((socket) =>
      serveRequest(socket, (value) => {
        request = value
        socket.write('ICY 20')
        setTimeout(() => socket.write(Buffer.concat([Buffer.from('0 OK\r\n\r\n'), correction])), 5)
      }),
    )
    const { service, chunks } = recordTarget()
    await service.start(config(port))
    await vi.waitFor(() => expect(Buffer.concat(chunks)).toEqual(correction))
    expect(request).toContain('GET /RTCM3 HTTP/1.0')
    expect(request).toContain(
      `Authorization: Basic ${Buffer.from('rover:secret').toString('base64')}`,
    )
    expect(service.getStatus()).toMatchObject({
      state: 'connected',
      receivedBytes: 6,
      forwardedBytes: 6,
      target: 'COM7',
    })
  })

  it('forwards NTRIP to the existing A TCP connection and returns checksum-valid fragmented GGA', async () => {
    const corrections = Buffer.from([0xd3, 0, 1, 0x42])
    let roverSocket: net.Socket | undefined
    const received: Buffer[] = []
    const roverPort = await listen((socket) => {
      roverSocket = socket
      socket.on('data', (data) => received.push(data))
    })
    const primary = new NetworkConnectionService()
    networks.push(primary)
    await primary.open(
      { protocol: 'tcp', host: '127.0.0.1', port: roverPort },
      { onData: vi.fn(), onDisconnected: vi.fn() },
    )
    const target: InjectionTarget = {
      id: 'network:1',
      label: 'Rover TCP',
      write: (data) => primary.sendBuffer(data),
    }
    const service = new DataInjectionService(() =>
      primary.getConnectionInfo() ? target : undefined,
    )
    services.push(service)
    primary.onRawData((data) => service.receivePrimary(data))
    let returnedGga = ''
    const casterPort = await listen((socket) =>
      serveRequest(socket, () => {
        socket.write(
          Buffer.concat([
            Buffer.from('HTTP/1.1 200 OK\r\nContent-Type: gnss/data\r\n\r\n'),
            corrections,
          ]),
        )
        socket.on('data', (data) => {
          returnedGga += data.toString('ascii')
        })
      }),
    )
    const settings = config(casterPort)
    settings.network.sendGga = true
    settings.network.ggaInterval = 1
    await service.start(settings)
    await vi.waitFor(() => expect(Buffer.concat(received)).toEqual(corrections))
    const body = 'GNGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,'
    const checksum = [...body]
      .reduce((sum, char) => sum ^ char.charCodeAt(0), 0)
      .toString(16)
      .toUpperCase()
      .padStart(2, '0')
    const gga = `$${body}*${checksum}\r\n`
    roverSocket!.write(gga.slice(0, 15))
    roverSocket!.write(gga.slice(15))
    await vi.waitFor(() => expect(returnedGga).toContain(gga), { timeout: 2500 })
    expect(service.getStatus().ggaSent).toBeGreaterThan(0)
  })

  it('receives raw TCP data and UDP datagrams without a text conversion', async () => {
    const payload = Buffer.from([0, 0xff, 0x80, 0xd3])
    const port = await listen((socket) => socket.write(payload))
    const { service, chunks } = recordTarget()
    const settings = config(port)
    settings.network.protocol = 'tcp'
    await service.start(settings)
    await vi.waitFor(() => expect(Buffer.concat(chunks)).toEqual(payload))
    await service.stop()
    chunks.length = 0
    const probe = dgram.createSocket('udp4')
    await new Promise<void>((resolve) => probe.bind(0, '127.0.0.1', resolve))
    const udpPort = probe.address().port
    await new Promise<void>((resolve) => probe.close(resolve))
    settings.network.protocol = 'udp'
    settings.network.port = udpPort
    await service.start(settings)
    const sender = dgram.createSocket('udp4')
    try {
      sender.send(payload, udpPort, '127.0.0.1')
      await vi.waitFor(() => expect(Buffer.concat(chunks)).toEqual(payload))
    } finally {
      sender.close()
    }
  })

  it.each([
    'HTTP/1.1 401 Unauthorized\r\n\r\n',
    'SOURCETABLE 200 OK\r\n',
    'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n',
  ])('rejects non-stream caster responses: %s', async (response) => {
    const port = await listen((socket) => serveRequest(socket, () => socket.write(response)))
    const { service, chunks } = recordTarget()
    await expect(service.start(config(port))).rejects.toThrow(/NTRIP/)
    expect(chunks).toEqual([])
    expect(service.getStatus().state).toBe('error')
  })

  it('reconnects with a fresh request and cancels future reconnects when stopped', async () => {
    let connections = 0
    let caster: net.Socket | undefined
    const requests: string[] = []
    const port = await listen((socket) =>
      serveRequest(socket, (request) => {
        requests.push(request)
        caster = socket
        socket.write(Buffer.concat([Buffer.from('ICY 200 OK\r\n'), Buffer.from([++connections])]))
      }),
    )
    const { service, chunks } = recordTarget()
    await service.start(config(port))
    await vi.waitFor(() => expect(Buffer.concat(chunks)).toEqual(Buffer.from([1])))
    caster!.destroy()
    await vi.waitFor(() => expect(Buffer.concat(chunks)).toEqual(Buffer.from([1, 2])))
    expect(requests).toHaveLength(2)
    await service.stop()
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(connections).toBe(2)
    expect(service.getStatus().state).toBe('idle')
  })

  it('cancels a pending NTRIP handshake and ignores late data', async () => {
    let accepted = false
    const port = await listen(() => {
      accepted = true
    })
    const { service, chunks } = recordTarget()
    const opening = service.start(config(port))
    const rejected = expect(opening).rejects.toThrow(/cancelled/)
    await vi.waitFor(() => expect(accepted).toBe(true))
    await service.stop()
    await rejected
    expect(chunks).toEqual([])
    expect(service.getStatus().state).toBe('idle')
  })

  it('refuses injection when A is disconnected or the serial source is the same port', async () => {
    const missing = new DataInjectionService(() => undefined)
    await expect(missing.start(config(2101))).rejects.toThrow(/Connect Data source A/)
    const { service } = recordTarget()
    const settings = config(2101)
    settings.source = 'serial'
    settings.serial.path = 'com7'
    await expect(service.start(settings)).rejects.toThrow(/must differ/)
  })

  it('preserves write order and stops on target changes or output congestion', async () => {
    let onData: (data: Uint8Array) => void = () => undefined
    let release = () => undefined
    let current: InjectionTarget | undefined = {
      id: 'serial:1',
      label: 'COM1',
      write: vi.fn(
        async () =>
          new Promise<void>((resolve) => {
            release = resolve
          }),
      ),
    }
    const writer = current.write
    const connection: InjectionConnection = {
      open: async (receive) => {
        onData = receive
      },
      close: vi.fn(async () => undefined),
      send: vi.fn(async () => undefined),
    }
    const service = new DataInjectionService(
      () => current,
      undefined,
      () => connection,
      10,
      8,
    )
    services.push(service)
    await service.start(config(2101))
    onData(Buffer.from([1, 2]))
    onData(Buffer.from([3]))
    expect(writer).toHaveBeenCalledTimes(1)
    current = undefined
    release()
    await vi.waitFor(() => expect(service.getStatus().state).toBe('error'))
    expect(writer).toHaveBeenCalledTimes(1)
    expect(service.getStatus().error).toContain('Data source A')

    current = { id: 'serial:2', label: 'COM2', write: async () => undefined }
    await service.start(config(2101))
    onData(Buffer.alloc(9))
    await vi.waitFor(() => expect(service.getStatus().state).toBe('error'))
    expect(service.getStatus().error).toContain('buffer limit')
  })
})

describe('NTRIP response framing', () => {
  it('decodes fragmented chunks and their extensions without forwarding HTTP framing', () => {
    const received: Buffer[] = []
    const connected = vi.fn()
    const ended = vi.fn()
    const parser = new NtripResponseParser(connected, (data) => received.push(data), ended)
    const response = Buffer.concat([
      Buffer.from('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n3;ext=1\r\n'),
      Buffer.from([0xd3, 0, 0xff]),
      Buffer.from('\r\n2\r\n'),
      Buffer.from([0x80, 13]),
      Buffer.from('\r\n0\r\n\r\n'),
    ])
    for (const byte of response) parser.push(Buffer.from([byte]))
    expect(Buffer.concat(received)).toEqual(Buffer.from([0xd3, 0, 0xff, 0x80, 13]))
    expect(connected).toHaveBeenCalledTimes(1)
    expect(ended).toHaveBeenCalledTimes(1)
  })

  it('bounds malformed response headers', () => {
    const parser = new NtripResponseParser(vi.fn(), vi.fn(), vi.fn())
    expect(() => parser.push(Buffer.from(`HTTP/1.1 200 OK\r\nFill: ${'x'.repeat(17000)}`))).toThrow(
      /too large/,
    )
  })
})
