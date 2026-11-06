import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
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

  async function request(tile = '10/512/511') {
    return electronState.handler!({ url: `nav-tiles://tiles/${tile}.png` } as Request)
  }

  it('keeps browsing online without a valid track and rejects non-image responses', async () => {
    electronState.fetch.mockResolvedValueOnce(
      new Response('<html>rate limited</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    )
    const response = await request()
    expect(response.status).toBe(200)
    await expect(
      readdir(path.join(tempDir, 'map-tile-cache'), { recursive: true }),
    ).resolves.toBeDefined()
    expect(await readdir(path.join(tempDir, 'map-tile-cache'), { recursive: true })).not.toContain(
      '512',
    )
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
    expect(await readdir(path.join(tempDir, 'map-tile-cache'), { recursive: true })).not.toContain(
      '512',
    )
  })

  it('persists only cacheable image responses inside the active corridor', async () => {
    service.updateTrack([[0.1, 0.1, 1]])
    electronState.fetch.mockResolvedValueOnce(
      new Response(PNG, {
        headers: { 'content-type': 'image/png', 'cache-control': 'max-age=3600' },
      }),
    )
    await request()
    const tilePath = path.join(tempDir, 'map-tile-cache', '10', '512', '511.png')
    await expect(readFile(tilePath)).resolves.toEqual(Buffer.from(PNG))

    electronState.fetch.mockResolvedValueOnce(
      new Response(PNG, { headers: { 'content-type': 'image/png', 'cache-control': 'no-store' } }),
    )
    await request('10/513/512')
    await expect(
      readFile(path.join(tempDir, 'map-tile-cache', '10', '513', '512.png')),
    ).rejects.toThrow()
  })

  it('gives concurrent requests independent response bodies while downloading a tile once', async () => {
    service.updateTrack([[0.1, 0.1, 1]])
    electronState.fetch.mockResolvedValueOnce(
      new Response(PNG, {
        headers: { 'content-type': 'image/png', 'cache-control': 'max-age=3600' },
      }),
    )

    const responses = await Promise.all([request(), request()])
    expect(electronState.fetch).toHaveBeenCalledTimes(1)
    const bodies = await Promise.all(responses.map((response) => response.arrayBuffer()))
    expect(bodies.map((body) => new Uint8Array(body))).toEqual([PNG, PNG])
  })

  it('loads all cached tiles before serving concurrent requests after an offline restart', async () => {
    service.updateTrack([
      [0.1, 0.1, 1],
      [0.1, -0.1, 1],
    ])
    electronState.fetch.mockImplementation(
      async () =>
        new Response(PNG, {
          headers: { 'content-type': 'image/png', 'cache-control': 'max-age=3600' },
        }),
    )
    await request()
    await request('10/512/512')

    electronState.fetch.mockReset()
    electronState.fetch.mockRejectedValue(new Error('Offline'))
    const restarted = new OfflineTileService()
    restarted.registerHandler()
    const responses = await Promise.all([request(), request('10/512/512')])

    expect(responses.map((response) => response.status)).toEqual([200, 200])
    const bodies = await Promise.all(responses.map((response) => response.arrayBuffer()))
    expect(bodies.map((body) => new Uint8Array(body))).toEqual([PNG, PNG])
    expect(electronState.fetch).not.toHaveBeenCalled()
  })
})
