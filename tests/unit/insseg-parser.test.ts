import { describe, expect, it } from 'vitest'
import { InssegParser } from '../../src/core/camera/InssegParser'

function sentence(payload: string): string {
  let checksum = 0
  for (const char of payload) checksum ^= char.charCodeAt(0)
  return `$${payload}*${checksum.toString(16).padStart(2, '0')}\r\n`
}

const twoPeople = sentence(
  'ESTAR,INSSEG,240601.120000.123,1,42,2,0,10,10,20,100,200,1.260,-5.000,0,11,200,20,300,200,2.030,5.000',
)

describe('InssegParser', () => {
  it('reassembles a real-format two-target sentence across SSH chunks', () => {
    const parser = new InssegParser()
    expect(parser.push(twoPeople.slice(0, 30))).toEqual([])
    const result = parser.push(twoPeople.slice(30))
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'frame',
      frame: {
        index: 1,
        pictureIndex: 42,
        targets: [
          { classId: 0, trackId: 10, distance: 1.26, azimuth: -5 },
          { classId: 0, trackId: 11, distance: 2.03, azimuth: 5 },
        ],
      },
    })
  })

  it('deduplicates identical target records from full-report firmware', () => {
    const duplicated = sentence(
      'ESTAR,INSSEG,240601.120000.123,1,42,4,0,10,10,20,100,200,1.260,-5.000,0,11,200,20,300,200,2.030,5.000,0,10,10,20,100,200,1.260,-5.000,0,11,200,20,300,200,2.030,5.000',
    )
    const parser = new InssegParser()
    const result = parser.push(duplicated)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'frame',
      frame: {
        targets: [
          { trackId: 10, distance: 1.26 },
          { trackId: 11, distance: 2.03 },
        ],
      },
    })
  })

  it('keeps conflicting records that share a track id', () => {
    const conflicting = sentence(
      'ESTAR,INSSEG,240601.120000.123,1,42,2,0,10,10,20,100,200,1.260,-5.000,0,10,12,20,100,200,1.260,-5.000',
    )
    const parser = new InssegParser()
    const result = parser.push(conflicting)
    expect(result).toMatchObject([
      { type: 'frame', frame: { targets: [{ left: 10 }, { left: 12 }] } },
    ])
  })
})
