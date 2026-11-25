import { app, net, protocol } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  DEFAULT_TRACK_CORRIDOR_RADIUS_METRES,
  MAX_TRACK_POINTS,
  sanitizeMapTrackPoints,
  selectTileCacheLruVictims,
  tileCacheFreshness,
  tileBounds,
  tileIntersectsTrackCorridor,
  tileKey,
  type MapTrackPoint,
  type TileCoordinate,
} from '../../../src/core/gnss/MapTileCache'

export const OFFLINE_TILE_SCHEME = 'nav-tiles'
export const ONLINE_TILE_BASE_URL = 'https://tile.openstreetmap.org'
export const AUTO_TILE_CACHE_MAX_BYTES = 1024 ** 3
export const AUTO_TILE_CACHE_HIGH_WATER_BYTES = Math.floor(AUTO_TILE_CACHE_MAX_BYTES * 0.9)
export const AUTO_TILE_CACHE_LOW_WATER_BYTES = Math.floor(AUTO_TILE_CACHE_MAX_BYTES * 0.8)

const META_SUFFIX = '.meta.json'
const USER_AGENT_SUFFIX = '(https://www.openstreetmap.org/copyright)'
const CACHE_TOUCH_INTERVAL_MS = 60_000

interface TileRequestPolicy {
  cacheVisible: boolean
}

interface AutoTileMetadata {
  version: 1
  key: string
  size: number
  lastUsedAt: number
  expiresAt: number
  contentType: string
  etag?: string
  lastModified?: string
}
interface CachedTile {
  tile: TileCoordinate
  key: string
  filePath: string
  metadataPath: string
  metadata: AutoTileMetadata
}

function hasImageSignature(bytes: Uint8Array): boolean {
  const png = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length >= png.length && png.every((value, index) => bytes[index] === value)) return true
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true
  if (bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)) === 'GIF8') return true
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
    return true
  return false
}

function isImageResponse(response: Response, bytes: Uint8Array): boolean {
  const contentType =
    response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? ''
  return contentType.startsWith('image/') && hasImageSignature(bytes)
}

function responseFromBytes(
  bytes: Uint8Array,
  headers: Headers,
  status = 200,
  statusText?: string,
): Response {
  return new Response(bytes as unknown as ArrayBuffer, { status, statusText, headers })
}

export class OfflineTileService {
  private readonly trackCorridorRadiusMetres = DEFAULT_TRACK_CORRIDOR_RADIUS_METRES
  private trackPoints: MapTrackPoint[] = []
  private loadPromise: Promise<void> | null = null
  private readonly cachedTiles = new Map<string, CachedTile>()
  private totalCacheBytes = 0
  private cleanupPromise: Promise<void> | null = null
  private readonly inFlight = new Map<
    string,
    { policy: TileRequestPolicy; response: Promise<Response> }
  >()

  public registerPrivilegedScheme(): void {
    protocol.registerSchemesAsPrivileged([
      {
        scheme: OFFLINE_TILE_SCHEME,
        privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
      },
    ])
  }

  public getTilesDir(): string {
    return path.join(app.getPath('userData'), 'offline-tiles')
  }

  public getAutoCacheDir(): string {
    return path.join(app.getPath('userData'), 'map-tile-cache')
  }

  /** Accept only sanitized points and keep the active route in the main process. */
  public updateTrack(points: unknown): void {
    this.trackPoints = sanitizeMapTrackPoints(points, MAX_TRACK_POINTS)
  }

  public getTrackPointsForTesting(): readonly MapTrackPoint[] {
    return this.trackPoints
  }

  public registerHandler(): void {
    protocol.handle(OFFLINE_TILE_SCHEME, (request) => this.handleRequest(request))
  }

  private async handleRequest(request: Request): Promise<Response> {
    const parsed = this.parseTileRequest(request.url)
    if (!parsed) return new Response('Bad Request', { status: 400 })
    const { tile, cacheVisible } = parsed
    const key = tileKey(tile)
    const inFlight = this.inFlight.get(key)
    if (inFlight) {
      inFlight.policy.cacheVisible ||= cacheVisible
      return (await inFlight.response).clone()
    }
    const policy = { cacheVisible }
    const response = this.loadTile(tile, key, policy)
    this.inFlight.set(key, { policy, response })
    try {
      return (await response).clone()
    } finally {
      this.inFlight.delete(key)
    }
  }

  private async loadTile(
    tile: TileCoordinate,
    key: string,
    policy: TileRequestPolicy,
  ): Promise<Response> {
    const manualPath = path.join(
      this.getTilesDir(),
      String(tile.z),
      String(tile.x),
      `${tile.y}.png`,
    )
    try {
      const data = await fs.readFile(manualPath)
      return new Response(new Uint8Array(data), { headers: { 'Content-Type': 'image/png' } })
    } catch {
      // Hand-maintained offline tiles are independent from automatic cache files.
    }

    // Read the requested tile before scanning the cache. A warm viewport need
    // not wait for unrelated tiles to be indexed after a desktop restart.
    const cached = await this.readCachedTile(tile, key)
    if (cached && this.isFresh(cached.metadata)) {
      const now = Date.now()
      const response = await this.readCachedResponse(cached)
      if (response.ok && now - cached.metadata.lastUsedAt >= CACHE_TOUCH_INTERVAL_MS) {
        cached.metadata.lastUsedAt = now
        await this.persistMetadata(cached)
      }
      if (response.ok) return response
      return this.fetchOnlineTile(tile, undefined, policy)
    }
    return this.fetchOnlineTile(tile, cached, policy)
  }

  private parseTileRequest(
    requestUrl: string,
  ): { tile: TileCoordinate; cacheVisible: boolean } | undefined {
    let url: URL
    try {
      url = new URL(requestUrl)
    } catch {
      return undefined
    }
    if (url.hostname !== 'tiles') return undefined
    const match = /^\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(url.pathname)
    if (!match) return undefined
    const tile = { z: Number(match[1]), x: Number(match[2]), y: Number(match[3]) }
    return tileBounds(tile)
      ? { tile, cacheVisible: url.searchParams.get('cache') === 'viewport' }
      : undefined
  }

  private getAppVersion(): string {
    try {
      return app.getVersion()
    } catch {
      return 'unknown'
    }
  }

  private async fetchOnlineTile(
    tile: TileCoordinate,
    existing: CachedTile | undefined,
    policy: TileRequestPolicy,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'User-Agent': `Nav-Tools/${this.getAppVersion()} ${USER_AGENT_SUFFIX}`,
    }
    if (existing) {
      if (existing.metadata.etag) headers['If-None-Match'] = existing.metadata.etag
      if (existing.metadata.lastModified)
        headers['If-Modified-Since'] = existing.metadata.lastModified
    }
    const url = `${ONLINE_TILE_BASE_URL}/${tile.z}/${tile.x}/${tile.y}.png`
    let response: Response
    try {
      response = await net.fetch(url, { headers })
    } catch {
      return existing
        ? this.readCachedResponse(existing)
        : new Response('', { status: 503, statusText: 'Network Unavailable' })
    }

    if (response.status === 304 && existing) {
      const freshness = tileCacheFreshness(response.headers, Date.now())
      existing.metadata.expiresAt = freshness.expiresAt
      existing.metadata.lastUsedAt = Date.now()
      existing.metadata.etag = response.headers.get('etag') ?? existing.metadata.etag
      existing.metadata.lastModified =
        response.headers.get('last-modified') ?? existing.metadata.lastModified
      await this.persistMetadata(existing)
      return this.readCachedResponse(existing)
    }
    if (!response.ok) return existing ? this.readCachedResponse(existing) : response

    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await response.arrayBuffer())
    } catch {
      return existing
        ? this.readCachedResponse(existing)
        : new Response('', { status: 502, statusText: 'Tile Download Failed' })
    }
    if (!isImageResponse(response, bytes)) {
      return existing
        ? this.readCachedResponse(existing)
        : responseFromBytes(
            bytes,
            new Headers(response.headers),
            response.status,
            response.statusText,
          )
    }

    const freshness = tileCacheFreshness(response.headers, Date.now())
    const allowCache =
      existing !== undefined ||
      policy.cacheVisible ||
      tileIntersectsTrackCorridor(tile, this.trackPoints, this.trackCorridorRadiusMetres)
    if (allowCache && !freshness.noStore)
      await this.storeCachedTile(tile, bytes, response, freshness.expiresAt)
    return responseFromBytes(
      bytes,
      new Headers(response.headers),
      response.status,
      response.statusText,
    )
  }

  private ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        const root = this.getAutoCacheDir()
        try {
          await fs.mkdir(root, { recursive: true })
          await this.scanCacheDirectory(root)
        } catch {
          // A read-only cache directory leaves the online fallback available.
        }
      })()
    }
    return this.loadPromise
  }

  private async scanCacheDirectory(directory: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await this.scanCacheDirectory(entryPath)
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.png')) continue
      const match = /(?:^|[\\/])(\d+)[\\/](\d+)[\\/](\d+)\.png$/.exec(entryPath)
      if (!match) continue
      const tile = { z: Number(match[1]), x: Number(match[2]), y: Number(match[3]) }
      if (!tileBounds(tile)) continue
      const cached = await this.loadCachedTile(tile, entryPath)
      if (!cached || this.cachedTiles.has(cached.key)) continue
      this.cachedTiles.set(cached.key, cached)
      this.totalCacheBytes += cached.metadata.size
    }
  }

  private autoCachePath(tile: TileCoordinate): string {
    return path.join(this.getAutoCacheDir(), String(tile.z), String(tile.x), `${tile.y}.png`)
  }

  private async loadCachedTile(
    tile: TileCoordinate,
    filePath = this.autoCachePath(tile),
  ): Promise<CachedTile | undefined> {
    const stat = await fs.stat(filePath).catch(() => undefined)
    if (!stat?.isFile()) return undefined
    const key = tileKey(tile)
    const metadataPath = `${filePath}${META_SUFFIX}`
    let saved: Partial<AutoTileMetadata> | null = null
    try {
      saved = JSON.parse(await fs.readFile(metadataPath, 'utf8'))
    } catch {
      // Treat a tile without readable metadata as stale.
    }
    const metadata: AutoTileMetadata = {
      version: 1,
      key,
      size: stat.size,
      lastUsedAt:
        typeof saved?.lastUsedAt === 'number' && Number.isFinite(saved.lastUsedAt)
          ? saved.lastUsedAt
          : stat.mtimeMs,
      expiresAt:
        typeof saved?.expiresAt === 'number' && Number.isFinite(saved.expiresAt)
          ? saved.expiresAt
          : 0,
      contentType: typeof saved?.contentType === 'string' ? saved.contentType : 'image/png',
      etag: typeof saved?.etag === 'string' ? saved.etag : undefined,
      lastModified: typeof saved?.lastModified === 'string' ? saved.lastModified : undefined,
    }
    const indexed = this.cachedTiles.get(key)
    return indexed ?? { tile, key, filePath, metadataPath, metadata }
  }

  private isFresh(metadata: AutoTileMetadata): boolean {
    return metadata.expiresAt > Date.now()
  }

  private async readCachedTile(tile: TileCoordinate, key: string): Promise<CachedTile | undefined> {
    const cached = this.cachedTiles.get(key)
    if (!cached) return this.loadCachedTile(tile)
    try {
      await fs.access(cached.filePath)
      return cached
    } catch {
      this.forgetCachedTile(cached)
      return undefined
    }
  }

  private async readCachedResponse(cached: CachedTile): Promise<Response> {
    try {
      const data = await fs.readFile(cached.filePath)
      return new Response(new Uint8Array(data), {
        headers: { 'Content-Type': cached.metadata.contentType || 'image/png' },
      })
    } catch {
      this.forgetCachedTile(cached)
      return new Response('', { status: 503, statusText: 'Cached Tile Unavailable' })
    }
  }

  private forgetCachedTile(cached: CachedTile): void {
    if (this.cachedTiles.get(cached.key) !== cached) return
    this.cachedTiles.delete(cached.key)
    this.totalCacheBytes = Math.max(0, this.totalCacheBytes - cached.metadata.size)
  }

  private async storeCachedTile(
    tile: TileCoordinate,
    bytes: Uint8Array,
    response: Response,
    expiresAt: number,
  ): Promise<void> {
    await this.ensureLoaded()
    const filePath = this.autoCachePath(tile)
    const metadataPath = `${filePath}${META_SUFFIX}`
    const key = tileKey(tile)
    const previous = this.cachedTiles.get(key)
    const metadata: AutoTileMetadata = {
      version: 1,
      key,
      size: bytes.byteLength,
      lastUsedAt: Date.now(),
      expiresAt,
      contentType: response.headers.get('content-type')?.split(';', 1)[0] || 'image/png',
      etag: response.headers.get('etag') ?? undefined,
      lastModified: response.headers.get('last-modified') ?? undefined,
    }
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await this.atomicWrite(filePath, bytes)
      const cached: CachedTile = { tile, key, filePath, metadataPath, metadata }
      await this.atomicWrite(metadataPath, Buffer.from(JSON.stringify(metadata), 'utf8'))
      this.cachedTiles.set(key, cached)
      this.totalCacheBytes += bytes.byteLength - (previous?.metadata.size ?? 0)
      if (this.totalCacheBytes > AUTO_TILE_CACHE_HIGH_WATER_BYTES) void this.cleanupCache()
    } catch {
      // A failed write never removes or truncates an existing usable tile.
    }
  }

  private async atomicWrite(filePath: string, data: Uint8Array): Promise<void> {
    const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const backupPath = `${filePath}.bak-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    let movedExisting = false
    try {
      await fs.writeFile(temporaryPath, data, { flag: 'wx' })
      try {
        await fs.rename(filePath, backupPath)
        movedExisting = true
      } catch {
        // The destination may not exist yet.
      }
      await fs.rename(temporaryPath, filePath)
      if (movedExisting) await fs.rm(backupPath, { force: true })
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
      if (movedExisting) await fs.rename(backupPath, filePath).catch(() => undefined)
      throw error
    }
  }

  private async persistMetadata(cached: CachedTile): Promise<void> {
    try {
      await this.atomicWrite(
        cached.metadataPath,
        Buffer.from(JSON.stringify(cached.metadata), 'utf8'),
      )
    } catch {
      // LRU timestamps are best effort; the tile remains usable.
    }
  }

  private async cleanupCache(): Promise<void> {
    if (this.cleanupPromise) return this.cleanupPromise
    this.cleanupPromise = (async () => {
      try {
        const victimKeys = selectTileCacheLruVictims(
          [...this.cachedTiles.values()].map((cached) => ({
            key: cached.key,
            size: cached.metadata.size,
            lastUsedAt: cached.metadata.lastUsedAt,
          })),
          this.totalCacheBytes,
          AUTO_TILE_CACHE_HIGH_WATER_BYTES,
          AUTO_TILE_CACHE_LOW_WATER_BYTES,
        )
        for (const key of victimKeys) {
          const victim = this.cachedTiles.get(key)
          if (!victim) continue
          await fs.rm(victim.filePath, { force: true }).catch(() => undefined)
          await fs.rm(victim.metadataPath, { force: true }).catch(() => undefined)
          this.cachedTiles.delete(victim.key)
          this.totalCacheBytes = Math.max(0, this.totalCacheBytes - victim.metadata.size)
        }
      } finally {
        this.cleanupPromise = null
      }
    })()
    return this.cleanupPromise
  }
}
