import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const electronState = vi.hoisted(() => ({
  userData: '',
  handler: undefined as ((request: Request) => Promise<Response>) | undefined,
  fetch: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => electronState.userData,
    getVersion: () => '1.8.3',
  },
  net: { fetch: electronState.fetch },
  protocol: {
    registerSchemesAsPrivileged: vi.fn(),
    handle: vi.fn((_scheme: string, handler: (request: Request) => Promise<Response>) => {
      electronState.handler = handler
    }),
  },
}))

import { OfflineTileService } from '../../electron/main/services/OfflineTileService'

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])

describe('OfflineTileService automatic cache', () => {
  let tempDir = ''
  let service: OfflineTileService

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'nav-tools-map-cache-'))
    electronState.userData = tempDir
    electronState.handler = undefined
    electronState.fetch.mockReset()
    service = new OfflineTileService()
    service.registerHandler()
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  async function request(tile = '10/512/511', viewport = false) {
    const query = viewport ? '?cache=viewport' : ''
    return electronState.handler!({ url: `nav-tiles://tiles/${tile}.png${query}` } as Request)
  }

  function cachedPath(tile = '10/512/511') {
    return path.join(tempDir, 'map-tile-cache', `${tile}.png`)
  }

  it('does not cache a non-image response in the viewport', async () => {
    electronState.fetch.mockResolvedValueOnce(
      new Response('<html>rate limited</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    )
    const response = await request(undefined, true)
    expect(response.status).toBe(200)
    await expect(readFile(cachedPath())).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not cache quality zero, origin or invalid IPC points', async () => {
    service.updateTrack([
      [0, 0, 1],
      [0.1, 0.1, 0],
      ['bad', 0.1, 1],
    ])
    electronState.fetch.mockResolvedValueOnce(
      new Response(PNG, {
        headers: { 'content-type': 'image/png', 'cache-control': 'max-age=3600' },
      }),
    )
    await request()
    await expect(readFile(cachedPath())).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('continues to cache tiles within the active corridor in the standalone map', async () => {
    service.updateTrack([[0.1, 0.1, 1]])
    electronState.fetch.mockResolvedValueOnce(
      new Response(PNG, {
        headers: { 'content-type': 'image/png', 'cache-control': 'max-age=3600' },
      }),
    )
    await request()
    await expect(readFile(cachedPath())).resolves.toEqual(Buffer.from(PNG))
  })

  it('does not persist no-store responses even in Deviation map mode', async () => {
    electronState.fetch.mockResolvedValueOnce(
      new Response(PNG, { headers: { 'content-type': 'image/png', 'cache-control': 'no-store' } }),
    )
    await request(undefined, true)
    await expect(readFile(cachedPath())).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('gives concurrent requests independent response bodies while downloading a tile once', async () => {
    electronState.fetch.mockResolvedValueOnce(
      new Response(PNG, {
        headers: { 'content-type': 'image/png', 'cache-control': 'max-age=3600' },
      }),
    )

    const responses = await Promise.all([request(), request(undefined, true)])
    expect(electronState.fetch).toHaveBeenCalledTimes(1)
    const bodies = await Promise.all(responses.map((response) => response.arrayBuffer()))
    expect(bodies.map((body) => new Uint8Array(body))).toEqual([PNG, PNG])
    await expect(readFile(cachedPath())).resolves.toEqual(Buffer.from(PNG))
  })

  it('reuses viewed Deviation map tiles after restart even when there has never been a fix', async () => {
    electronState.fetch.mockImplementation(
      async () =>
        new Response(PNG, {
          headers: { 'content-type': 'image/png', 'cache-control': 'max-age=3600' },
        }),
    )
    await request(undefined, true)
    await request('10/512/512', true)

    electronState.fetch.mockReset()
    electronState.fetch.mockRejectedValue(new Error('Offline'))
    const restarted = new OfflineTileService()
    restarted.registerHandler()
    const responses = await Promise.all([request(undefined, true), request('10/512/512', true)])

    expect(responses.map((response) => response.status)).toEqual([200, 200])
    const bodies = await Promise.all(responses.map((response) => response.arrayBuffer()))
    expect(bodies.map((body) => new Uint8Array(body))).toEqual([PNG, PNG])
    expect(electronState.fetch).not.toHaveBeenCalled()
  })

  it('revalidates an expired viewport tile and reuses the body on 304', async () => {
    electronState.fetch.mockResolvedValueOnce(
      new Response(PNG, {
        headers: { 'content-type': 'image/png', 'cache-control': 'max-age=0', etag: '"tile-v1"' },
      }),
    )
    await request(undefined, true)

    new OfflineTileService().registerHandler()
    electronState.fetch.mockResolvedValueOnce(
      new Response(null, {
        status: 304,
        headers: { 'cache-control': 'max-age=3600, must-revalidate' },
      }),
    )
    const refreshed = await request(undefined, true)
    expect(electronState.fetch).toHaveBeenLastCalledWith(
      'https://tile.openstreetmap.org/10/512/511.png',
      { headers: expect.objectContaining({ 'If-None-Match': '"tile-v1"' }) },
    )
    expect(new Uint8Array(await refreshed.arrayBuffer())).toEqual(PNG)
    await request(undefined, true)
    expect(electronState.fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps manually provided tiles ahead of the automatic viewport cache', async () => {
    electronState.fetch.mockResolvedValue(
      new Response(PNG, { headers: { 'content-type': 'image/png' } }),
    )
    await request(undefined, true)
    const manualTile = path.join(tempDir, 'offline-tiles', '10', '512', '511.png')
    const manualBytes = new Uint8Array([...PNG, 1])
    await mkdir(path.dirname(manualTile), { recursive: true })
    await writeFile(manualTile, manualBytes)
    const response = await request(undefined, true)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(manualBytes)
    expect(electronState.fetch).toHaveBeenCalledTimes(1)
  })
})
