import net from 'node:net'
import {
  parseNtripSourceTable,
  type NtripCasterOptions,
  type NtripMountpoint,
} from '../../../src/core/data/NtripSourceTable'
import { NtripResponseParser } from './NtripConnection'

const MAX_SOURCE_TABLE_BYTES = 2 * 1024 * 1024

export async function fetchNtripMountpoints(
  options: NtripCasterOptions,
  { signal, timeoutMs = 10000 }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<NtripMountpoint[]> {
  if (
    !options ||
    typeof options.host !== 'string' ||
    !options.host.trim() ||
    /\s/.test(options.host.trim())
  )
    throw new Error('Enter a valid NTRIP caster host')
  if (
    [...options.host].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new Error('Enter a valid NTRIP caster host')
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535)
    throw new Error('NTRIP caster port must be between 1 and 65535')
  if (typeof options.username !== 'string' || typeof options.password !== 'string')
    throw new Error('Invalid NTRIP credentials')
  signal?.throwIfAborted()

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: options.host.trim(), port: options.port })
    const chunks: Buffer[] = []
    let size = 0
    let tail = ''
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      socket.destroy()
      if (error) return reject(error)
      const table = Buffer.concat(chunks).toString('utf8')
      if (!/(?:^|\r?\n)(?:STR;|ENDSOURCETABLE(?:\r?\n|$))/.test(table))
        return reject(new Error('The caster did not return an NTRIP source table'))
      resolve(parseNtripSourceTable(table))
    }
    const abort = () => finish(new Error('NTRIP source table request cancelled'))
    const timer = setTimeout(
      () => finish(new Error('NTRIP source table request timed out')),
      timeoutMs,
    )
    signal?.addEventListener('abort', abort, { once: true })
    const parser = new NtripResponseParser(
      () => undefined,
      (data) => {
        size += data.length
        if (size > MAX_SOURCE_TABLE_BYTES)
          return finish(new Error('NTRIP source table is too large'))
        chunks.push(Buffer.from(data))
        tail = (tail + data.toString('utf8')).slice(-128)
      },
      () => finish(),
      'source-table',
    )
    socket.once('connect', () => {
      const host = options.host.trim()
      const headers = [
        'GET / HTTP/1.1',
        `Host: ${host.includes(':') ? `[${host}]` : host}:${options.port}`,
        'Ntrip-Version: Ntrip/2.0',
        'User-Agent: NTRIP Nav-Tools',
        'Accept: gnss/sourcetable, text/plain, */*',
        'Accept-Encoding: identity',
        'Connection: close',
      ]
      if (options.username || options.password)
        headers.push(
          `Authorization: Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}`,
        )
      socket.write(`${headers.join('\r\n')}\r\n\r\n`)
    })
    socket.on('data', (data) => {
      if (settled) return
      try {
        parser.push(data)
        // Some legacy casters keep the TCP connection open after the table.
        if (/(?:^|\r?\n)ENDSOURCETABLE(?:\r?\n)?$/.test(tail)) finish()
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)))
      }
    })
    socket.once('error', (error) => finish(error))
    socket.once('end', () => finish())
    socket.once('close', () => {
      if (!settled) finish(new Error('NTRIP source table connection closed'))
    })
  })
}
