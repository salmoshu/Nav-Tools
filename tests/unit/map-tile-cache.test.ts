import { describe, expect, it } from 'vitest'
import {
  sanitizeMapTrackPoints,
  selectTileCacheLruVictims,
  tileCacheFreshness,
  tileBounds,
  tileIntersectsTrackCorridor,
  type MapTrackPoint,
} from '@/core/gnss/MapTileCache'

describe('GNSS map tile cache geometry', () => {
  it('does not create a corridor without valid fixes', () => {
    const invalid = [
      [0, 0, 1],
      [181, 30, 1],
      [114, 30, 0],
      [114, Number.NaN, 1],
    ]
    expect(sanitizeMapTrackPoints(invalid)).toEqual([])
    expect(tileIntersectsTrackCorridor({ z: 10, x: 800, y: 400 }, [])).toBe(false)
  })

  it('filters quality zero, origin and malformed coordinates before IPC', () => {
    const points = sanitizeMapTrackPoints([
      [0, 0, 4],
      [114, 30, 0],
      [114, 30, 1],
      ['bad', 30, 1],
      [114, 91, 1],
    ])
    expect(points).toEqual([[114, 30, 1]])
  })

  it('honours no-store, max-age and Expires metadata', () => {
    const now = 1_700_000_000_000
    expect(tileCacheFreshness(new Headers({ 'cache-control': 'no-store' }), now)).toEqual({
      noStore: true,
      expiresAt: now,
    })
    expect(tileCacheFreshness(new Headers({ 'cache-control': 'public, max-age=60' }), now)).toEqual(
      {
        noStore: false,
        expiresAt: now + 60_000,
      },
    )
    expect(
      tileCacheFreshness(new Headers({ expires: new Date(now + 12_000).toUTCString() }), now)
        .expiresAt,
    ).toBeGreaterThan(now)
  })

  it('selects least recently used tiles only after the high-water mark', () => {
    const entries = [
      { key: 'old', size: 6, lastUsedAt: 1 },
      { key: 'new', size: 4, lastUsedAt: 2 },
      { key: 'newest', size: 2, lastUsedAt: 3 },
    ]
    expect(selectTileCacheLruVictims(entries, 12, 10, 6)).toEqual(['old'])
    expect(selectTileCacheLruVictims(entries, 10, 10, 6)).toEqual([])
  })

  it('uses the tile boundary instead of only the tile centre', () => {
    const tile = { z: 10, x: 512, y: 400 }
    const bounds = tileBounds(tile)!
    const point: MapTrackPoint = [bounds.west - 0.005, (bounds.north + bounds.south) / 2, 1]
    expect(tileIntersectsTrackCorridor(tile, [point])).toBe(true)
  })

  it('follows line segments and does not cache a rectangle-only corner', () => {
    const tile = { z: 8, x: 130, y: 100 }
    const bounds = tileBounds(tile)!
    const points: MapTrackPoint[] = [
      [bounds.west - 0.03, bounds.south - 0.03, 1],
      [bounds.east + 0.03, bounds.north + 0.03, 1],
    ]
    expect(tileIntersectsTrackCorridor(tile, points)).toBe(true)
    const aroundCorner: MapTrackPoint[] = [
      [bounds.west - 0.03, bounds.north + 0.03, 1],
      [bounds.west - 0.03, bounds.south - 0.03, 1],
      [bounds.east + 0.03, bounds.south - 0.03, 1],
    ]
    expect(tileIntersectsTrackCorridor(tile, aroundCorner)).toBe(false)
  })
})
