// @vitest-environment node

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AppHandoffSnapshotService,
  isSolutionRecord,
} from '../../electron/main/services/AppHandoffSnapshotService'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (directory) => {
      const resolved = path.resolve(directory)
      if (
        path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
        !path.basename(resolved).startsWith('nav-tools-handoff-')
      ) {
        throw new Error(`Unexpected test directory: ${resolved}`)
      }
      await rm(resolved, { recursive: true, force: true })
    }),
  )
})

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nav-tools-handoff-'))
  directories.push(directory)
  return {
    directory,
    sourcePath: path.join(directory, 'solution.pos'),
    service: new AppHandoffSnapshotService(path.join(directory, 'handoffs')),
  }
}

describe('AppHandoffSnapshotService', () => {
  it('copies complete POS records without changing or following the live source tail', async () => {
    const { sourcePath, service } = await fixture()
    const complete =
      '% GPST latitude longitude height\n2026/11/15 10:00:00.000 31.0 121.0 10.0 4 12\n'
    const partial = '2026/11/15 10:00:01.000 31.0001 121.0001'
    await writeFile(sourcePath, complete + partial)

    const first = await service.createSolutionSnapshot({
      sourcePath,
      runId: 'run-a',
      kind: 'realtime-snapshot',
      format: 'rtklib-pos',
    })
    expect(first.recordCount).toBe(1)
    expect(first.artifact.files[0].path).toMatch(/\.pos$/)
    expect(await readFile(first.artifact.files[0].path, 'utf8')).toBe(complete)
    expect(await readFile(sourcePath, 'utf8')).toBe(complete + partial)

    const second = await service.createSolutionSnapshot({
      sourcePath,
      runId: 'run-a',
      kind: 'realtime-snapshot',
      format: 'rtklib-pos',
    })
    expect(second.artifact.artifactId).not.toBe(first.artifact.artifactId)
    expect(second.artifact.files[0].path).not.toBe(first.artifact.files[0].path)
    await writeFile(sourcePath, complete + partial + ' 121.0002 10.1 5 11\n')
    expect(await readFile(first.artifact.files[0].path, 'utf8')).toBe(complete)
  })

  it('preserves the actual NMEA format and drops a partial final sentence', async () => {
    const { directory, service } = await fixture()
    const sourcePath = path.join(directory, 'solution.nmea')
    const rmc = '$GPRMC,025457.00,A,4002.1914377,N,11618.4980000,E,0.0,0.0,151126,0.0,E,A*00\r\n'
    const gga =
      '$GPGGA,025457.00,4002.1914377,N,11618.4980000,E,4,28,0.6,74.5640,M,-8.7720,M,01,0000*00\r\n'
    await writeFile(sourcePath, rmc + gga + '$GPGGA,025458.00,4002.2')
    const result = await service.createSolutionSnapshot({
      sourcePath,
      runId: 'run-nmea',
      kind: 'completed-result',
      format: 'nmea',
    })
    expect(result.recordCount).toBe(1)
    expect(result.artifact.files[0].format).toBe('nmea')
    expect(result.artifact.files[0].path).toMatch(/\.nmea$/)
    expect(await readFile(result.artifact.files[0].path, 'utf8')).toBe(rmc + gga)
  })

  it('rejects a snapshot with headers but no complete solution epoch', async () => {
    const { sourcePath, service } = await fixture()
    await writeFile(sourcePath, '% header only\n2026/11/15 incomplete')
    await expect(
      service.createSolutionSnapshot({
        sourcePath,
        runId: 'run-empty',
        kind: 'completed-result',
        format: 'rtklib-pos',
      }),
    ).rejects.toThrow('NO_COMPLETE_SOLUTION_RECORDS')
    expect(await readdir(path.join(path.dirname(sourcePath), 'handoffs'))).toEqual([])
  })

  it('validates paths and recognizes records rather than POS headers', async () => {
    const { service } = await fixture()
    await expect(
      service.createSolutionSnapshot({
        sourcePath: 'relative.pos',
        runId: 'run-relative',
        kind: 'completed-result',
        format: 'rtklib-pos',
      }),
    ).rejects.toThrow('INVALID_HANDOFF_SOURCE')
    expect(isSolutionRecord('% latitude longitude', 'rtklib-pos')).toBe(false)
    expect(isSolutionRecord('$GPGGA,025457.00', 'nmea')).toBe(true)
  })

  it('refreshes actual recording size and modification time at the trust boundary', async () => {
    const { directory, service } = await fixture()
    const sourcePath = path.join(directory, 'recording.jsonl')
    await writeFile(sourcePath, '{"time":1,"value":42}\n')
    const expected = await import('node:fs/promises').then(({ stat }) => stat(sourcePath))
    const result = await service.registerArtifact({
      artifactId: 'recording-1',
      producerAppId: 'serial',
      runId: 'recording-run',
      createdAt: '2026-11-15T00:00:00.000Z',
      kind: 'recording',
      files: [
        {
          path: sourcePath,
          role: 'recording',
          format: 'json',
          sizeBytes: 1,
          modifiedAt: '2000-01-01T00:00:00.000Z',
        },
      ],
    })
    expect(result.files[0].sizeBytes).toBe(expected.size)
    expect(result.files[0].modifiedAt).toBe(expected.mtime.toISOString())
  })

  it('rejects relative paths, directories, empty files and unknown formats', async () => {
    const { directory, service } = await fixture()
    const empty = path.join(directory, 'empty.log')
    await writeFile(empty, '')
    const file = (filePath: string, format = 'json') => ({
      path: filePath,
      role: 'recording',
      format,
      sizeBytes: 0,
      modifiedAt: '2026-11-15T00:00:00.000Z',
    })
    const base = {
      artifactId: 'invalid-artifact',
      producerAppId: 'serial',
      runId: 'run-invalid',
      createdAt: '2026-11-15T00:00:00.000Z',
      kind: 'recording',
    }
    await expect(
      service.registerArtifact({ ...base, files: [file('relative.log')] }),
    ).rejects.toThrow('INVALID_HANDOFF_SOURCE')
    await expect(service.registerArtifact({ ...base, files: [file(directory)] })).rejects.toThrow(
      'HANDOFF_FILE_NOT_FOUND',
    )
    await expect(service.registerArtifact({ ...base, files: [file(empty)] })).rejects.toThrow(
      'HANDOFF_FILE_NOT_FOUND',
    )
    await expect(
      service.registerArtifact({ ...base, files: [file(empty, 'unknown')] }),
    ).rejects.toThrow('INVALID_HANDOFF_FORMAT')
  })

  it('classifies RINEX by its header, sanitizes names and keeps duplicate files distinct', async () => {
    const { directory, service } = await fixture()
    const result = await service.createRinexArtifact({
      producerAppId: 'gnssraw',
      runId: 'rinex-run',
      observationRole: 'base-observation',
      files: [
        { name: '../../BASE & station.26o', data: rinexHeader('O') },
        { name: 'C:\\incoming\\BASE & station.26o', data: rinexHeader('O') },
        { name: 'signals.custom-extension', data: rinexHeader('N') },
      ],
    })
    expect(result.files.map((file) => file.role)).toEqual([
      'base-observation',
      'base-observation',
      'navigation',
    ])
    expect(result.files.map((file) => path.basename(file.path))).toEqual([
      'BASE & station.26o',
      'BASE & station-2.26o',
      'signals.custom-extension',
    ])
    expect(result.files.every((file) => path.dirname(file.path).startsWith(directory))).toBe(true)
    expect(await readFile(result.files[0].path)).toEqual(Buffer.from(rinexHeader('O')))
  })

  it('rejects navigation-only groups and removes partial RINEX artifacts on failure', async () => {
    const { directory, service } = await fixture()
    await expect(
      service.createRinexArtifact({
        producerAppId: 'gnssraw',
        runId: 'navigation-only',
        observationRole: 'rover-observation',
        files: [{ name: 'navigation.26n', data: rinexHeader('N') }],
      }),
    ).rejects.toThrow('HANDOFF_OBSERVATION_FILE_MISSING')
    await expect(
      service.createRinexArtifact({
        producerAppId: 'gnssraw',
        runId: 'partial-group',
        observationRole: 'rover-observation',
        files: [
          { name: 'rover.26o', data: rinexHeader('O') },
          { name: 'unknown.txt', data: rinexHeader('O').slice(0, 20) },
        ],
      }),
    ).rejects.toThrow('RINEX_FILE_ROLE_UNKNOWN')
    expect(await readdir(path.join(directory, 'handoffs'))).toEqual([])
  })
})

function rinexHeader(type: 'O' | 'N'): Uint8Array {
  const header = Array(80).fill(' ')
  header[20] = type
  header.splice(60, 20, ...'RINEX VERSION / TYPE')
  return new TextEncoder().encode(`${header.join('')}\r\n`)
}
