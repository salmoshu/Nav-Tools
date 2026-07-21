// @vitest-environment node

import dgram from 'node:dgram'
import net from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NetworkConnectionService } from '../../electron/main/services/NetworkConnectionService'

const service = new NetworkConnectionService()

afterEach(async () => {
  await service.close()
})

describe('NetworkConnectionService', () => {
  it('receives TCP stream data', async () => {
    const server = net.createServer((socket) => socket.write('tcp-payload'))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('TCP test server did not bind')

    const received = new Promise<string>((resolve) => {
      void service.open(
        { protocol: 'tcp', host: '127.0.0.1', port: address.port },
        { onData: resolve, onDisconnected: vi.fn() },
      )
    })
    await expect(received).resolves.toBe('tcp-payload')
    await service.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('receives UDP datagrams on the configured local endpoint', async () => {
    const port = await findFreeUdpPort()
    const received = new Promise<string>((resolve) => {
      void service
        .open(
          { protocol: 'udp', host: '127.0.0.1', port },
          { onData: resolve, onDisconnected: vi.fn() },
        )
        .then(() => {
          const sender = dgram.createSocket('udp4')
          sender.send(Buffer.from('udp-payload'), port, '127.0.0.1', () => sender.close())
        })
    })
    await expect(received).resolves.toBe('udp-payload')
  })
})

async function findFreeUdpPort(): Promise<number> {
  const socket = dgram.createSocket('udp4')
  await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve))
  const address = socket.address()
  await new Promise<void>((resolve) => socket.close(resolve))
  return address.port
}
