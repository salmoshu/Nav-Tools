import { describe, expect, it } from 'vitest'
import { createDefaultRtkPostSettings } from '@/core/gnsslib/RtkPost'
import { createDefaultRtkNaviSettings } from '@/core/gnsslib/RtkNavi'
import { parseRtkPostConfig } from '@/core/gnsslib/RtkPostConfig'
import { RTKNAVI_ADVANCED_CONFIG } from '@/core/gnsslib/RtkNaviAdvancedOptions'
import {
  isSolverOptionModified,
  solverOptionFields,
  solverOptionInactiveReason,
} from '@/core/gnsslib/GnssSolverOptions'

describe('GNSS Solver option organization', () => {
  it('keeps every existing editable parameter available once in each engine', () => {
    const postKeys = Object.keys(createDefaultRtkPostSettings().options)
      .filter((key) => key !== 'startTime' && key !== 'endTime')
      .sort()
    const liveKeys = Object.keys(createDefaultRtkNaviSettings().options)
      .filter((key) => key !== 'baseConfigPath')
      .sort()
    expect(
      solverOptionFields('post')
        .map((field) => field.key)
        .sort(),
    ).toEqual(postKeys)
    expect(
      solverOptionFields('realtime')
        .map((field) => field.key)
        .sort(),
    ).toEqual(liveKeys)
    const liveFields = solverOptionFields('realtime')
    expect(new Set(liveFields.map((field) => field.category))).toEqual(
      new Set(['common', 'ambiguity', 'quality', 'base', 'filter']),
    )
    for (const { key, configKeys } of RTKNAVI_ADVANCED_CONFIG) {
      expect(liveFields.find((field) => field.key === key)?.configKeys).toEqual(configKeys)
    }
  })

  it('retains imported values when mode, constellations or fix strategy make them inactive', () => {
    const options = createDefaultRtkPostSettings().options
    Object.assign(
      options,
      parseRtkPostConfig(
        [
          'pos2-armode=fix-and-hold',
          'pos2-gloarmode=autocal',
          'pos2-arthres2=0.15',
          'pos2-minholdsats=9',
          'pos2-baselen=10',
        ].join('\n'),
      ).options,
    )
    const fields = solverOptionFields('post')
    const hold = fields.find((field) => field.key === 'minHoldSats')!
    const glo = fields.find((field) => field.key === 'gloHwBiasM')!
    const base = fields.find((field) => field.key === 'baselineLengthM')!
    expect(solverOptionInactiveReason(hold, options)).toBe('')
    expect(solverOptionInactiveReason(glo, options)).toBe('')
    options.ambiguityResolution = 'continuous'
    options.constellations = ['G']
    options.mode = 0
    const snapshot = structuredClone(options)
    for (const field of [hold, glo, base]) {
      expect(solverOptionInactiveReason(field, options)).not.toBe('')
      expect(isSolverOptionModified('post', options, field.key)).toBe(true)
    }
    expect(options).toEqual(snapshot)
    options.mode = 2
    options.constellations = ['G', 'R']
    options.ambiguityResolution = 'fix-and-hold'
    expect(solverOptionInactiveReason(hold, options)).toBe('')
    expect(options.minHoldSats).toBe(9)
    expect(options.gloHwBiasM).toBe(0.15)
  })

  it('compares with engine defaults without treating constellation order as an edit', () => {
    const post = createDefaultRtkPostSettings().options
    const live = createDefaultRtkNaviSettings().options
    expect(
      solverOptionFields('post').some((field) => isSolverOptionModified('post', post, field.key)),
    ).toBe(false)
    expect(
      solverOptionFields('realtime').some((field) =>
        isSolverOptionModified('realtime', live, field.key),
      ),
    ).toBe(false)
    post.constellations.reverse()
    expect(isSolverOptionModified('post', post, 'constellations')).toBe(false)
    post.ratioMin = 2.2
    expect(isSolverOptionModified('post', post, 'ratioMin')).toBe(true)
    expect(isSolverOptionModified('post', post, 'basePositionMode')).toBe(false)
    expect(isSolverOptionModified('realtime', live, 'basePositionMode')).toBe(false)
  })

  it('shows frequency and output options only where they apply, keeping their values', () => {
    const options = createDefaultRtkPostSettings().options
    const fields = solverOptionFields('post')
    const l2 = fields.find((field) => field.key === 'errorRatioL2')!
    const l5 = fields.find((field) => field.key === 'errorRatioL5')!
    const time = fields.find((field) => field.key === 'timeSystem')!
    options.frequency = 4
    options.outputFormat = 'nmea'
    expect(solverOptionInactiveReason(l2, options)).not.toBe('')
    expect(solverOptionInactiveReason(l5, options)).toBe('')
    expect(solverOptionInactiveReason(time, options)).not.toBe('')
    expect(options.timeSystem).toBe('gpst')
    expect(options.errorRatioL2).toBe(300)
  })
})
