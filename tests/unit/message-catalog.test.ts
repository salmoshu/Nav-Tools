import { describe, expect, it } from 'vitest'
import { updateMessageCatalog, type CatalogRecord } from '@/core/data/MessageCatalog'

function record(key: string, dataType: CatalogRecord['dataType'], raw: string, isValid = true) {
  return { key, dataType, raw, isValid }
}

const gga = record('gga', 'nmea', '$GPGGA,123500.00,*33')
const laterGga = record('next', 'nmea', '$GNGGA,123501.00,*33')
const gsv = record('gsv', 'nmea', '$GPGSV,1,1,00*51')
const pubx = record('pubx', 'nmea', '$PUBX,03,0*1F')
const pos = record('pos', 'rtcm3', 'D3 00 13 3E D0 01')
const header = record('csv-header', 'csv', 'Time,Speed')
const row = record('csv-row', 'csv', '1,12.00')

describe('Message protocol catalog', () => {
  it('groups actual NMEA, PUBX, RTCM3 and CSV records by type and excludes the CSV header', async () => {
    const result = await updateMessageCatalog(undefined, {
      records: [gga, laterGga, gsv, pubx, pos, header, row],
      format: 'none',
      encoding: 'ascii',
      validOnly: false,
      csvHeaderKey: header.key,
    })
    expect([...result!.entries]).toMatchObject([
      ['NMEA/standard/GGA', { count: 2, latest: laterGga }],
      ['NMEA/standard/GSV', { count: 1, latest: gsv }],
      ['NMEA/pubx/03', { count: 1, latest: pubx }],
      ['RTCM3/station/1005', { count: 1, latest: pos }],
      ['CSV/structured/Row', { count: 1, latest: row }],
    ])
  })

  it('updates counts after rolling-window eviction and handles seeking backward', async () => {
    const source = { format: 'none', encoding: 'ascii', validOnly: false } as const
    const previous = await updateMessageCatalog(undefined, { ...source, records: [gga, gsv] })
    const updated = await updateMessageCatalog(previous, { ...source, records: [gsv, laterGga] })
    expect(updated?.entries.get('NMEA/standard/GGA')).toMatchObject({ count: 1, latest: laterGga })
    expect(updated?.entries.get('NMEA/standard/GSV')?.count).toBe(1)
    const rewind = await updateMessageCatalog(updated, { ...source, records: [gsv] })
    expect(rewind?.entries.has('NMEA/standard/GGA')).toBe(false)
    expect(rewind?.entries.get('NMEA/standard/GSV')?.count).toBe(1)
  })
})
