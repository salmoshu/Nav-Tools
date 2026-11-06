// @vitest-environment node
import net from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { parseNtripSourceTable } from '../../src/core/data/NtripSourceTable'
import { fetchNtripMountpoints } from '../../electron/main/services/NtripSourceTableService'

const servers: net.Server[] = []
const sockets = new Set<net.Socket>()
const table =
  'CAS;caster\r\nSTR;VRS;"City; centre";RTCM 3.2;;2;GPS+GLO;\r\nSTR;BASE;Station;RTCM 3.3;;2;GPS+GAL;\r\nSTR;VRS;Duplicate;RTCM 3.2;\r\nENDSOURCETABLE\r\n'

afterEach(async () => {
  for (const socket of sockets) socket.destroy()
  sockets.clear()
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  )
})

async function caster(reply: (socket: net.Socket, request: string) => void) {
  const server = net.createServer((socket) => {
    sockets.add(socket)
    let request = ''
    socket.on('data', (data) => {
      request += data.toString('ascii')
      if (request.includes('\r\n\r\n')) reply(socket, request)
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No caster port')
  return { host: '127.0.0.1', port: address.port, username: 'rover', password: 'fixture-secret' }
}

describe('NTRIP source tables', () => {
  it('returns unique sorted mountpoints with quoted metadata and ignores other record types', () => {
    const result = parseNtripSourceTable(table)
    expect(result.map((entry) => entry.mountpoint)).toEqual(['BASE', 'VRS'])
    expect(result[1]).toEqual({
      mountpoint: 'VRS',
      identifier: 'City; centre',
      format: 'RTCM 3.2',
      navigationSystem: 'GPS+GLO',
    })
    expect(
      parseNtripSourceTable(
        'STR;;Missing;RTCM\nSTR;bad name;Invalid;RTCM\nSTR;UNFINISHED;"broken;RTCM',
      ),
    ).toEqual([])
  })

  it.each(['legacy', 'http', 'chunked'] as const)(
    'fetches an authenticated %s table without a mountpoint or primary connection',
    async (mode) => {
      let request = ''
      const options = await caster((socket, incoming) => {
        request = incoming
        const response =
          mode === 'chunked'
            ? `HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Type: gnss/sourcetable\r\n\r\n${Buffer.byteLength(table).toString(16)}\r\n${table}\r\n0\r\n\r\n`
            : `${mode === 'legacy' ? 'SOURCETABLE' : 'HTTP/1.1'} 200 OK\r\nContent-Type: text/plain\r\n\r\n${table}`
        socket.write(response.slice(0, 9))
        setImmediate(() => socket.write(response.slice(9)))
        // Deliberately keep the connection open: the terminator must finish retrieval.
      })
      expect((await fetchNtripMountpoints(options)).map((entry) => entry.mountpoint)).toEqual([
        'BASE',
        'VRS',
      ])
      expect(request).toContain('GET / HTTP/1.1\r\n')
      expect(request).toContain(
        `Authorization: Basic ${Buffer.from('rover:fixture-secret').toString('base64')}`,
      )
    },
  )

  it('accepts an empty table and reports authentication failures without exposing credentials', async () => {
    const empty = await caster((socket) => socket.end('SOURCETABLE 200 OK\r\n\r\nENDSOURCETABLE'))
    await expect(fetchNtripMountpoints(empty)).resolves.toEqual([])
    const denied = await caster((socket) => socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n'))
    await expect(fetchNtripMountpoints(denied)).rejects.toThrow('401 Unauthorized')
  })

  it('bounds stalled requests and supports cancellation', async () => {
    const options = await caster(() => undefined)
    await expect(fetchNtripMountpoints(options, { timeoutMs: 50 })).rejects.toThrow('timed out')
    const controller = new AbortController()
    const pending = fetchNtripMountpoints(options, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toThrow('cancelled')
  })

  it('rejects oversized tables and successful HTML pages instead of treating them as mountpoint lists', async () => {
    const large = await caster((socket) =>
      socket.end(`HTTP/1.1 200 OK\r\n\r\n${'x'.repeat(2 * 1024 * 1024 + 1)}`),
    )
    await expect(fetchNtripMountpoints(large)).rejects.toThrow('too large')
    const html = await caster((socket) =>
      socket.end('HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html>login</html>'),
    )
    await expect(fetchNtripMountpoints(html)).rejects.toThrow('did not return')
  })
})
