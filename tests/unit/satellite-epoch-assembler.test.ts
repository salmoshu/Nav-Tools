import { describe, expect, it } from 'vitest'
import { SatelliteEpochAssembler, formatNmeaEpochTime } from '@/core/gnss/SatelliteEpochAssembler'

describe('SatelliteEpochAssembler', () => {
  it('assembles complete multi-sentence GSV cycles and preserves fractional time', () => {
    const assembler = new SatelliteEpochAssembler()
    assembler.addGsv({
      source: 'GP',
      totalMessages: 2,
      messageNumber: 1,
      satellites: [1, 2, 3, 4].map((prn) => ({ prn, constellation: 'GPS' })),
    })
    assembler.addGsv({
      source: 'GP',
      totalMessages: 2,
      messageNumber: 2,
      satellites: [5].map((prn) => ({ prn, constellation: 'GPS' })),
    })
    assembler.addGsv({
      source: 'GA',
      totalMessages: 1,
      messageNumber: 1,
      satellites: [3, 8, 15].map((prn) => ({ prn, constellation: 'GALILEO' })),
    })

    const sample = assembler.commit('091214.30')
    expect(sample.time).toBe('09:12:14.30')
    expect(sample.counts.GPS).toBe(5)
    expect(sample.counts.GALILEO).toBe(3)
    expect(sample.total).toBe(8)
    expect(sample.complete).toBe(true)
  })

  it('does not carry satellites from a previous epoch', () => {
    const assembler = new SatelliteEpochAssembler()
    assembler.addGsv({
      source: 'GP',
      totalMessages: 1,
      messageNumber: 1,
      satellites: [1, 2, 3].map((prn) => ({ prn, constellation: 'GPS' })),
    })
    expect(assembler.commit('091214.30').counts.GPS).toBe(3)

    assembler.addGsv({
      source: 'GP',
      totalMessages: 1,
      messageNumber: 1,
      satellites: [1].map((prn) => ({ prn, constellation: 'GPS' })),
    })
    const next = assembler.commit('091214.40')
    expect(next.counts.GPS).toBe(1)
    expect(next.total).toBe(1)
  })

  it('marks an epoch incomplete when a GSV cycle is missing a message', () => {
    const assembler = new SatelliteEpochAssembler()
    assembler.addGsv({
      source: 'GB',
      totalMessages: 2,
      messageNumber: 1,
      satellites: [1, 2, 3, 4].map((prn) => ({ prn, constellation: 'BEIDOU' })),
    })

    const sample = assembler.commit('091214.50')
    expect(sample.complete).toBe(false)
    expect(sample.total).toBe(0)
  })

  it('formats NMEA epoch time without discarding sub-second precision', () => {
    expect(formatNmeaEpochTime('092327.80')).toBe('09:23:27.80')
  })

  it('marks an epoch incomplete when one cycle is complete but another is partial', () => {
    const assembler = new SatelliteEpochAssembler()
    // GPS cycle: complete (messages 1 and 2 both received)
    assembler.addGsv({
      source: 'GP',
      totalMessages: 2,
      messageNumber: 1,
      satellites: [1, 2, 3, 4].map((prn) => ({ prn, constellation: 'GPS' })),
    })
    assembler.addGsv({
      source: 'GP',
      totalMessages: 2,
      messageNumber: 2,
      satellites: [5].map((prn) => ({ prn, constellation: 'GPS' })),
    })
    // BEIDOU cycle: partial (only message 1 of 2 received)
    assembler.addGsv({
      source: 'GB',
      totalMessages: 2,
      messageNumber: 1,
      satellites: [11, 12, 13, 14].map((prn) => ({ prn, constellation: 'BEIDOU' })),
    })

    const sample = assembler.commit('091214.60')
    expect(sample.complete).toBe(false)
    expect(sample.total).toBe(0)
    // the epoch is not a valid full sample, so no partial counts leak through
    expect(sample.counts.GPS).toBe(0)
    expect(sample.counts.BEIDOU).toBe(0)
  })
})
