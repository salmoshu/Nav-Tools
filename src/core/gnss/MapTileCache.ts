/** Shared, dependency-free geometry used by the GNSS map tile cache. */

export type MapTrackPoint = readonly [longitude: number, latitude: number, quality: number]

export interface TileCoordinate {
  z: number
  x: number
  y: number
}

export interface TileBounds {
  west: number
  south: number
  east: number
  north: number
}

export const DEFAULT_TRACK_CORRIDOR_RADIUS_METRES = 1000
export const MAX_TRACK_POINTS = 10000
export const MAX_TILE_ZOOM = 22

export interface TileCacheFreshness {
  noStore: boolean
  expiresAt: number
}

export interface TileCacheLruEntry {
  key: string
  size: number
  lastUsedAt: number
}

const EARTH_RADIUS_METRES = 6_378_137
const MAX_MERCATOR_LATITUDE = 85.0511287798066

export function isValidMapTrackPoint(value: unknown): value is MapTrackPoint {
  if (!Array.isArray(value) || value.length < 3) return false
  if (typeof value[0] !== 'number' || typeof value[1] !== 'number' || typeof value[2] !== 'number')
    return false
  const longitude = value[0]
  const latitude = value[1]
  const quality = value[2]
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    Number.isFinite(quality) &&
    quality > 0 &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90 &&
    !(longitude === 0 && latitude === 0)
  )
}

/** Keep only trustworthy fixes before a renderer or IPC payload is accepted. */
export function sanitizeMapTrackPoints(value: unknown, limit = MAX_TRACK_POINTS): MapTrackPoint[] {
  if (!Array.isArray(value) || !Number.isFinite(limit) || limit < 1) return []
  const points: MapTrackPoint[] = []
  for (const candidate of value) {
    if (!isValidMapTrackPoint(candidate)) continue
    const point: MapTrackPoint = [Number(candidate[0]), Number(candidate[1]), Number(candidate[2])]
    const previous = points.at(-1)
    if (previous && previous[0] === point[0] && previous[1] === point[1]) {
      // Prefer the newest quality for a coalesced epoch.
      points[points.length - 1] = point
    } else {
      points.push(point)
    }
  }
  if (points.length <= limit) return points
  return simplifyMapTrackPoints(points, Math.floor(limit))
}

/**
 * Reduce very long paths while retaining endpoints and geometric turns. The
 * tolerance is deliberately small compared with the 1 km corridor.
 */
export function simplifyMapTrackPoints(
  points: readonly MapTrackPoint[],
  limit = MAX_TRACK_POINTS,
): MapTrackPoint[] {
  const valid = points.filter(isValidMapTrackPoint)
  if (valid.length <= limit) return valid.map((point) => [...point] as MapTrackPoint)
  const epsilonDegrees = 0.00005
  const keep = new Uint8Array(valid.length)
  keep[0] = 1
  keep[valid.length - 1] = 1
  const stack: Array<[number, number]> = [[0, valid.length - 1]]
  while (stack.length) {
    const [start, end] = stack.pop()!
    if (end - start <= 1) continue
    const a = valid[start]
    const b = valid[end]
    const latScale = Math.max(0.1, Math.cos(((a[1] + b[1]) * Math.PI) / 360))
    const dx = (b[0] - a[0]) * latScale
    const dy = b[1] - a[1]
    const denominator = dx * dx + dy * dy
    let farthest = -1
    let farthestDistance = epsilonDegrees
    for (let index = start + 1; index < end; index += 1) {
      const point = valid[index]
      const px = (point[0] - a[0]) * latScale
      const py = point[1] - a[1]
      const ratio =
        denominator === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / denominator))
      const distance = Math.hypot(px - dx * ratio, py - dy * ratio)
      if (distance > farthestDistance) {
        farthestDistance = distance
        farthest = index
      }
    }
    if (farthest >= 0) {
      keep[farthest] = 1
      stack.push([start, farthest], [farthest, end])
    }
  }
  let reduced = valid.filter((_point, index) => keep[index] === 1)
  if (reduced.length <= limit) return reduced.map((point) => [...point] as MapTrackPoint)
  const stride = Math.ceil((valid.length - 1) / Math.max(1, limit - 1))
  reduced = valid.filter(
    (_point, index) => index === 0 || index === valid.length - 1 || index % stride === 0,
  )
  return reduced
    .slice(0, limit - 1)
    .concat([valid.at(-1)!])
    .map((point) => [...point] as MapTrackPoint)
}

export function tileKey(tile: TileCoordinate): string {
  return `${tile.z}/${tile.x}/${tile.y}`
}

/** Parse HTTP freshness without coupling geometry tests to Electron's net API. */
export function tileCacheFreshness(
  headers: { get(name: string): string | null },
  now = Date.now(),
): TileCacheFreshness {
  const cacheControl = headers.get('cache-control')?.toLowerCase() ?? ''
  const directives = new Map<string, string | true>()
  for (const raw of cacheControl.split(',')) {
    const [name, ...valueParts] = raw.trim().split('=')
    if (!name) continue
    directives.set(name, valueParts.join('=').replace(/^"|"$/g, '') || true)
  }
  if (directives.has('no-store')) return { noStore: true, expiresAt: now }
  if (directives.has('no-cache') || directives.has('must-revalidate')) {
    return { noStore: false, expiresAt: now }
  }
  const maxAge = directives.get('s-maxage') ?? directives.get('max-age')
  const age = Number(headers.get('age') ?? 0)
  if (typeof maxAge === 'string' && /^\d+$/.test(maxAge)) {
    return {
      noStore: false,
      expiresAt: now + Math.max(0, Number(maxAge) - (Number.isFinite(age) ? age : 0)) * 1000,
    }
  }
  const expiresAt = Date.parse(headers.get('expires') ?? '')
  if (Number.isFinite(expiresAt)) return { noStore: false, expiresAt }
  return { noStore: false, expiresAt: now }
}

/** Return the keys to remove only after crossing the high-water mark. */
export function selectTileCacheLruVictims(
  entries: readonly TileCacheLruEntry[],
  totalBytes: number,
  highWaterBytes: number,
  lowWaterBytes: number,
): string[] {
  if (totalBytes <= highWaterBytes) return []
  let remaining = totalBytes
  const victims: string[] = []
  for (const entry of [...entries].sort((a, b) => a.lastUsedAt - b.lastUsedAt)) {
    if (remaining <= lowWaterBytes) break
    victims.push(entry.key)
    remaining -= Math.max(0, entry.size)
  }
  return victims
}

export function tileBounds(tile: TileCoordinate): TileBounds | undefined {
  const { z, x, y } = tile
  if (!Number.isInteger(z) || z < 0 || z > MAX_TILE_ZOOM) return undefined
  const dimension = 2 ** z
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= dimension ||
    y >= dimension
  ) {
    return undefined
  }
  const west = (x / dimension) * 360 - 180
  const east = ((x + 1) / dimension) * 360 - 180
  const mercatorLatitude = (tileY: number) =>
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY) / dimension))) * 180) / Math.PI
  return { west, east, north: mercatorLatitude(y), south: mercatorLatitude(y + 1) }
}

function unwrapLongitude(longitude: number, reference: number): number {
  let result = longitude
  while (result - reference > 180) result -= 360
  while (result - reference < -180) result += 360
  return result
}

function project(
  point: readonly [number, number],
  longitudeOrigin: number,
  latitudeOrigin: number,
) {
  const scale = Math.max(0.1, Math.cos((latitudeOrigin * Math.PI) / 180))
  return {
    x:
      ((unwrapLongitude(point[0], longitudeOrigin) - longitudeOrigin) *
        Math.PI *
        EARTH_RADIUS_METRES *
        scale) /
      180,
    y: ((point[1] - latitudeOrigin) * Math.PI * EARTH_RADIUS_METRES) / 180,
  }
}

function pointInsideRectangle(
  point: { x: number; y: number },
  west: number,
  east: number,
  south: number,
  north: number,
) {
  return point.x >= west && point.x <= east && point.y >= south && point.y <= north
}

function orientation(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function onSegment(
  a: { x: number; y: number },
  b: { x: number; y: number },
  p: { x: number; y: number },
) {
  return (
    Math.min(a.x, b.x) <= p.x + 1e-9 &&
    p.x <= Math.max(a.x, b.x) + 1e-9 &&
    Math.min(a.y, b.y) <= p.y + 1e-9 &&
    p.y <= Math.max(a.y, b.y) + 1e-9
  )
}

function segmentsIntersect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
) {
  const abC = orientation(a, b, c)
  const abD = orientation(a, b, d)
  const cdA = orientation(c, d, a)
  const cdB = orientation(c, d, b)
  const epsilon = 1e-9
  if (Math.abs(abC) <= epsilon && onSegment(a, b, c)) return true
  if (Math.abs(abD) <= epsilon && onSegment(a, b, d)) return true
  if (Math.abs(cdA) <= epsilon && onSegment(c, d, a)) return true
  if (Math.abs(cdB) <= epsilon && onSegment(c, d, b)) return true
  return abC > 0 !== abD > 0 && cdA > 0 !== cdB > 0
}

function pointToSegmentDistance(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const denominator = dx * dx + dy * dy
  if (denominator === 0) return Math.hypot(point.x - a.x, point.y - a.y)
  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator),
  )
  return Math.hypot(point.x - (a.x + ratio * dx), point.y - (a.y + ratio * dy))
}

function segmentToRectangleDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
  west: number,
  east: number,
  south: number,
  north: number,
) {
  if (
    pointInsideRectangle(a, west, east, south, north) ||
    pointInsideRectangle(b, west, east, south, north)
  )
    return 0
  const corners = [
    { x: west, y: south },
    { x: east, y: south },
    { x: east, y: north },
    { x: west, y: north },
  ]
  for (let index = 0; index < corners.length; index += 1) {
    if (segmentsIntersect(a, b, corners[index], corners[(index + 1) % corners.length])) return 0
  }
  return Math.min(
    ...corners.map((corner) => pointToSegmentDistance(corner, a, b)),
    pointToSegmentDistance(a, { x: west, y: south }, { x: east, y: south }),
    pointToSegmentDistance(a, { x: east, y: south }, { x: east, y: north }),
    pointToSegmentDistance(a, { x: east, y: north }, { x: west, y: north }),
    pointToSegmentDistance(a, { x: west, y: north }, { x: west, y: south }),
    pointToSegmentDistance(b, { x: west, y: south }, { x: east, y: south }),
    pointToSegmentDistance(b, { x: east, y: south }, { x: east, y: north }),
    pointToSegmentDistance(b, { x: east, y: north }, { x: west, y: north }),
    pointToSegmentDistance(b, { x: west, y: north }, { x: west, y: south }),
  )
}

/**
 * Test the whole tile rectangle against the buffered track segment. This is
 * intentionally based on the tile's four boundaries, rather than its centre,
 * so tiles crossed at an edge are still cached.
 */
export function tileIntersectsTrackCorridor(
  tile: TileCoordinate,
  trackPoints: readonly MapTrackPoint[],
  radiusMetres = DEFAULT_TRACK_CORRIDOR_RADIUS_METRES,
): boolean {
  const bounds = tileBounds(tile)
  if (!bounds || !Number.isFinite(radiusMetres) || radiusMetres < 0) return false
  const points = trackPoints.filter(isValidMapTrackPoint)
  if (points.length === 0) return false
  const tileLongitudeOrigin = (bounds.west + bounds.east) / 2
  const tileLatitudeOrigin = (bounds.south + bounds.north) / 2
  const rectangleWest = project(
    [bounds.west, tileLatitudeOrigin],
    tileLongitudeOrigin,
    tileLatitudeOrigin,
  ).x
  const rectangleEast = project(
    [bounds.east, tileLatitudeOrigin],
    tileLongitudeOrigin,
    tileLatitudeOrigin,
  ).x
  const rectangleSouth = project(
    [tileLongitudeOrigin, bounds.south],
    tileLongitudeOrigin,
    tileLatitudeOrigin,
  ).y
  const rectangleNorth = project(
    [tileLongitudeOrigin, bounds.north],
    tileLongitudeOrigin,
    tileLatitudeOrigin,
  ).y
  if (points.length === 1) {
    const point = project([points[0][0], points[0][1]], tileLongitudeOrigin, tileLatitudeOrigin)
    return (
      pointToSegmentDistance(
        point,
        { x: rectangleWest, y: rectangleSouth },
        { x: rectangleEast, y: rectangleSouth },
      ) <= radiusMetres ||
      pointToSegmentDistance(
        point,
        { x: rectangleEast, y: rectangleSouth },
        { x: rectangleEast, y: rectangleNorth },
      ) <= radiusMetres ||
      pointToSegmentDistance(
        point,
        { x: rectangleEast, y: rectangleNorth },
        { x: rectangleWest, y: rectangleNorth },
      ) <= radiusMetres ||
      pointToSegmentDistance(
        point,
        { x: rectangleWest, y: rectangleNorth },
        { x: rectangleWest, y: rectangleSouth },
      ) <= radiusMetres ||
      pointInsideRectangle(point, rectangleWest, rectangleEast, rectangleSouth, rectangleNorth)
    )
  }
  for (let index = 1; index < points.length; index += 1) {
    const first = points[index - 1]
    const second = points[index]
    const originLongitude = first[0]
    const a = project([first[0], first[1]], originLongitude, tileLatitudeOrigin)
    const b = project([second[0], second[1]], originLongitude, tileLatitudeOrigin)
    const unwrappedTileCentre = unwrapLongitude(tileLongitudeOrigin, originLongitude)
    const westLongitude = unwrappedTileCentre + (bounds.west - tileLongitudeOrigin)
    const eastLongitude = unwrappedTileCentre + (bounds.east - tileLongitudeOrigin)
    const west = project([westLongitude, tileLatitudeOrigin], originLongitude, tileLatitudeOrigin).x
    const east = project([eastLongitude, tileLatitudeOrigin], originLongitude, tileLatitudeOrigin).x
    const distance = segmentToRectangleDistance(a, b, west, east, rectangleSouth, rectangleNorth)
    if (distance <= radiusMetres) return true
  }
  return false
}
