import { describe, expect, it } from 'vitest'
import {
  resolveAppHandoffTargets,
  solutionFileForHandoff,
  type AppHandoffArtifact,
} from '../../src/core/handoff/AppHandoff'

function artifact(format: 'nmea' | 'rtklib-pos' = 'rtklib-pos'): AppHandoffArtifact {
  return {
    artifactId: 'artifact-1',
    producerAppId: 'gnsslib',
    runId: 'run-1',
    createdAt: '2026-11-15T12:00:00.000Z',
    kind: 'completed-result',
    files: [
      {
        path: format === 'nmea' ? 'C:\\handoffs\\result.nmea' : 'C:\\handoffs\\result.pos',
        role: 'solution',
        format,
        sizeBytes: 128,
        modifiedAt: '2026-11-15T12:00:00.000Z',
      },
    ],
  }
}

describe('application handoff target registration', () => {
  it.each(['nmea', 'rtklib-pos'] as const)('routes %s solutions to GNSS', (format) => {
    const value = artifact(format)
    expect(resolveAppHandoffTargets(value).map((target) => target.applicationId)).toEqual(['gnss'])
    expect(solutionFileForHandoff(value).format).toBe(format)
  })

  it('does not infer a target for an unknown artifact kind', () => {
    const value = { ...artifact(), kind: 'unknown-artifact' } as unknown as AppHandoffArtifact
    expect(resolveAppHandoffTargets(value)).toEqual([])
  })

  it('rejects an artifact without a solution file', () => {
    expect(() => solutionFileForHandoff({ ...artifact(), files: [] })).toThrow(
      'HANDOFF_SOLUTION_FILE_MISSING',
    )
  })

  it('routes a RINEX file group to GNSS-Lib only when it contains observations', () => {
    const base = artifact()
    const rinex: AppHandoffArtifact = {
      ...base,
      kind: 'rinex-input',
      files: [
        { ...base.files[0], role: 'base-observation', format: 'rinex' },
        { ...base.files[0], path: 'C:\\handoffs\\base.nav', role: 'navigation', format: 'rinex' },
      ],
    }
    expect(resolveAppHandoffTargets(rinex).map((target) => target.applicationId)).toEqual([
      'gnsslib',
      'gnssraw',
    ])
    rinex.files = [rinex.files[1]]
    expect(resolveAppHandoffTargets(rinex).map((target) => target.applicationId)).toEqual([
      'gnssraw',
    ])
  })

  it.each([
    ['nmea', ['gnss', 'serial', 'motor']],
    ['rtklib-pos', ['gnss', 'serial', 'motor']],
    ['json', ['serial', 'motor']],
    ['csv', ['serial', 'motor']],
  ] as const)('routes a %s recording to its compatible replay targets', (format, expected) => {
    const value = {
      ...artifact(),
      kind: 'recording' as const,
      files: [{ ...artifact().files[0], role: 'recording' as const, format }],
    }
    expect(resolveAppHandoffTargets(value).map((target) => target.applicationId)).toEqual(expected)
  })

  it.each([
    ['rtcm3', ['gnssraw']],
    ['mcap', ['lidar']],
  ] as const)('routes a %s source file to its native loader', (format, expected) => {
    const value = {
      ...artifact(),
      kind: 'source-file' as const,
      files: [{ ...artifact().files[0], role: 'source' as const, format }],
    }
    expect(resolveAppHandoffTargets(value).map((target) => target.applicationId)).toEqual(expected)
  })

  it('does not send a multi-file artifact to single-file replay targets', () => {
    const value = {
      ...artifact(),
      kind: 'recording' as const,
      files: [
        { ...artifact().files[0], role: 'recording' as const, format: 'json' as const },
        { ...artifact().files[0], role: 'recording' as const, format: 'json' as const },
      ],
    }
    expect(resolveAppHandoffTargets(value)).toEqual([])
  })
})
