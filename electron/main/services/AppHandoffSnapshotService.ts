import { createReadStream } from 'node:fs'
import { mkdir, open, rename, rm, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type {
  AppHandoffArtifact,
  AppHandoffArtifactKind,
  AppHandoffFile,
  AppHandoffFileRole,
  AppHandoffFormat,
  AppHandoffRinexWriteRequest,
  AppHandoffSnapshotRequest,
  AppHandoffSnapshotResult,
  GnssSolutionHandoffFormat,
} from '../../../src/core/handoff/AppHandoff'
import {
  isAppHandoffFormat,
  isGnssSolutionHandoffFormat,
} from '../../../src/core/handoff/AppHandoff'
import { classifyRinexFile } from '../../../src/core/gnssraw/RinexFileAccess'

const ARTIFACT_KINDS = new Set<AppHandoffArtifactKind>([
  'completed-result',
  'realtime-snapshot',
  'rinex-input',
  'recording',
  'source-file',
])
const FILE_ROLES = new Set<AppHandoffFileRole>([
  'solution',
  'rover-observation',
  'base-observation',
  'navigation',
  'recording',
  'source',
])
const MAX_HANDOFF_FILES = 16

/** Creates immutable snapshots and validates existing artifact files at the trust boundary. */
export class AppHandoffSnapshotService {
  public constructor(private readonly handoffDirectory: string) {}

  public async createSolutionSnapshot(value: unknown): Promise<AppHandoffSnapshotResult> {
    const request = normalizeSnapshotRequest(value)
    const source = await stat(request.sourcePath).catch(() => undefined)
    if (!source?.isFile()) throw new TypeError('INVALID_HANDOFF_SOURCE')
    await mkdir(this.handoffDirectory, { recursive: true })
    const artifactId = randomUUID()
    const extension = request.format === 'nmea' ? 'nmea' : 'pos'
    const stem = sanitizeFileStem(request.runId) || 'solution'
    const destination = path.join(
      this.handoffDirectory,
      `${request.kind}-${stem}-${artifactId}.${extension}`,
    )
    const temporary = `${destination}.tmp`
    let renamed = false

    try {
      const { recordCount, sizeBytes } = await copyCompleteSolutionRecords(
        request.sourcePath,
        temporary,
        request.format,
      )
      if (recordCount === 0) throw new Error('NO_COMPLETE_SOLUTION_RECORDS')
      await rename(temporary, destination)
      renamed = true
      const metadata = await stat(destination)
      const artifact: AppHandoffArtifact = {
        artifactId,
        producerAppId: 'gnsslib',
        runId: request.runId,
        createdAt: new Date().toISOString(),
        kind: request.kind,
        files: [
          {
            path: destination,
            role: 'solution',
            format: request.format,
            sizeBytes,
            modifiedAt: metadata.mtime.toISOString(),
          },
        ],
      }
      return { artifact, recordCount }
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined)
      if (renamed) await rm(destination, { force: true }).catch(() => undefined)
      throw error
    }
  }

  /** Revalidate paths and refresh metadata before any renderer-supplied artifact is consumed. */
  public async registerArtifact(value: unknown): Promise<AppHandoffArtifact> {
    if (!value || typeof value !== 'object') throw new TypeError('INVALID_HANDOFF_ARTIFACT')
    const candidate = value as Partial<AppHandoffArtifact>
    const artifactId = requiredText(candidate.artifactId, 'INVALID_HANDOFF_ARTIFACT')
    const producerAppId = requiredText(candidate.producerAppId, 'INVALID_HANDOFF_PRODUCER')
    const runId = requiredText(candidate.runId, 'INVALID_HANDOFF_RUN')
    const createdAt = requiredText(candidate.createdAt, 'INVALID_HANDOFF_ARTIFACT')
    if (!ARTIFACT_KINDS.has(candidate.kind as AppHandoffArtifactKind)) {
      throw new TypeError('INVALID_HANDOFF_KIND')
    }
    if (!Array.isArray(candidate.files) || candidate.files.length === 0) {
      throw new TypeError('INVALID_HANDOFF_FILES')
    }
    if (candidate.files.length > MAX_HANDOFF_FILES) throw new TypeError('TOO_MANY_HANDOFF_FILES')
    const files: AppHandoffFile[] = []
    for (const value of candidate.files) {
      if (!value || typeof value !== 'object') throw new TypeError('INVALID_HANDOFF_FILE')
      const filePath = typeof value.path === 'string' ? value.path.trim() : ''
      if (!filePath || !path.isAbsolute(filePath)) throw new TypeError('INVALID_HANDOFF_SOURCE')
      if (!FILE_ROLES.has(value.role)) throw new TypeError('INVALID_HANDOFF_ROLE')
      if (!isAppHandoffFormat(value.format)) {
        throw new TypeError('INVALID_HANDOFF_FORMAT')
      }
      const metadata = await stat(filePath).catch(() => undefined)
      if (!metadata?.isFile() || metadata.size === 0) throw new TypeError('HANDOFF_FILE_NOT_FOUND')
      files.push({
        path: filePath,
        role: value.role,
        format: value.format as AppHandoffFormat,
        sizeBytes: metadata.size,
        modifiedAt: metadata.mtime.toISOString(),
        ...(typeof value.regexPattern === 'string' && value.regexPattern.length <= 4096
          ? { regexPattern: value.regexPattern }
          : {}),
      })
    }
    return {
      artifactId,
      producerAppId,
      runId,
      createdAt,
      kind: candidate.kind as AppHandoffArtifactKind,
      files,
    }
  }

  /** Persist converted RINEX as a new file group; source files are never moved or overwritten. */
  public async createRinexArtifact(value: unknown): Promise<AppHandoffArtifact> {
    const request = normalizeRinexWriteRequest(value)
    await mkdir(this.handoffDirectory, { recursive: true })
    const artifactId = randomUUID()
    const directory = path.join(this.handoffDirectory, `rinex-${artifactId}`)
    await mkdir(directory, { recursive: false })
    const usedNames = new Set<string>()
    try {
      const files: AppHandoffFile[] = []
      for (const [index, input] of request.files.entries()) {
        const type = classifyRinexFile(input.name, input.data)
        if (type === 'unknown') throw new TypeError('RINEX_FILE_ROLE_UNKNOWN')
        const role: AppHandoffFileRole =
          type === 'observation' ? request.observationRole : 'navigation'
        const name = uniqueFileName(sanitizeFileName(input.name, index), usedNames)
        const destination = path.join(directory, name)
        const temporary = `${destination}.${randomUUID()}.tmp`
        await writeFile(temporary, input.data, { flag: 'wx' })
        await rename(temporary, destination).catch(async (error) => {
          await rm(temporary, { force: true }).catch(() => undefined)
          throw error
        })
        const metadata = await stat(destination)
        files.push({
          path: destination,
          role,
          format: 'rinex',
          sizeBytes: metadata.size,
          modifiedAt: metadata.mtime.toISOString(),
        })
      }
      return {
        artifactId,
        producerAppId: request.producerAppId,
        runId: request.runId,
        createdAt: new Date().toISOString(),
        kind: 'rinex-input',
        files,
      }
    } catch (error) {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
  }
}

export async function copyCompleteSolutionRecords(
  sourcePath: string,
  destinationPath: string,
  format: GnssSolutionHandoffFormat,
): Promise<{ recordCount: number; sizeBytes: number }> {
  const output = await open(destinationPath, 'wx')
  let tail = Buffer.alloc(0)
  let recordCount = 0
  let sizeBytes = 0

  const writeComplete = async (complete: Buffer): Promise<void> => {
    if (complete.length === 0) return
    await output.writeFile(complete)
    sizeBytes += complete.length
    for (const line of complete.toString('utf8').split(/\r\n|\n|\r/)) {
      if (isSolutionRecord(line, format)) recordCount++
    }
  }

  try {
    for await (const chunk of createReadStream(sourcePath)) {
      const pending = Buffer.concat([tail, chunk as Buffer])
      const end = completeLineEnd(pending, false)
      if (end < 0) {
        tail = pending
        continue
      }
      await writeComplete(pending.subarray(0, end + 1))
      tail = pending.subarray(end + 1)
    }
    const end = completeLineEnd(tail, true)
    if (end >= 0) await writeComplete(tail.subarray(0, end + 1))
    await output.sync()
  } finally {
    await output.close()
  }
  return { recordCount, sizeBytes }
}

/** Exported for focused format tests; POS headers and NMEA non-position records are not epochs. */
export function isSolutionRecord(line: string, format: GnssSolutionHandoffFormat): boolean {
  const text = line.trim()
  if (format === 'nmea') return /^\$[A-Z0-9]{2}GGA,/.test(text)
  return /^\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}:\d{2}(?:\.\d+)?\s+\S+/.test(text)
}

function completeLineEnd(buffer: Buffer, endOfFile: boolean): number {
  const newline = buffer.lastIndexOf(0x0a)
  if (newline >= 0) return newline
  const carriageReturn = buffer.lastIndexOf(0x0d)
  if (carriageReturn < 0 || (!endOfFile && carriageReturn === buffer.length - 1)) return -1
  return carriageReturn
}

function normalizeSnapshotRequest(value: unknown): AppHandoffSnapshotRequest {
  if (!value || typeof value !== 'object') throw new TypeError('INVALID_HANDOFF_REQUEST')
  const request = value as Partial<AppHandoffSnapshotRequest>
  const sourcePath = typeof request.sourcePath === 'string' ? request.sourcePath.trim() : ''
  const runId = typeof request.runId === 'string' ? request.runId.trim() : ''
  const kind = request.kind
  if (!sourcePath || !path.isAbsolute(sourcePath)) throw new TypeError('INVALID_HANDOFF_SOURCE')
  if (!runId) throw new TypeError('INVALID_HANDOFF_RUN')
  if (kind !== 'completed-result' && kind !== 'realtime-snapshot') {
    throw new TypeError('INVALID_HANDOFF_KIND')
  }
  if (!isGnssSolutionHandoffFormat(request.format)) {
    throw new TypeError('INVALID_HANDOFF_FORMAT')
  }
  return { sourcePath, runId, kind, format: request.format }
}

function sanitizeFileStem(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80)
}

function requiredText(value: unknown, code: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > 512) throw new TypeError(code)
  return text
}

function normalizeRinexWriteRequest(value: unknown): AppHandoffRinexWriteRequest {
  if (!value || typeof value !== 'object') throw new TypeError('INVALID_HANDOFF_REQUEST')
  const request = value as Partial<AppHandoffRinexWriteRequest>
  const producerAppId = requiredText(request.producerAppId, 'INVALID_HANDOFF_PRODUCER')
  const runId = requiredText(request.runId, 'INVALID_HANDOFF_RUN')
  if (
    request.observationRole !== 'rover-observation' &&
    request.observationRole !== 'base-observation'
  ) {
    throw new TypeError('INVALID_HANDOFF_ROLE')
  }
  if (!Array.isArray(request.files) || request.files.length === 0) {
    throw new TypeError('INVALID_HANDOFF_FILES')
  }
  if (request.files.length > MAX_HANDOFF_FILES) throw new TypeError('TOO_MANY_HANDOFF_FILES')
  const files = request.files.map((file) => {
    const name = typeof file?.name === 'string' ? file.name.trim() : ''
    const data = file?.data instanceof Uint8Array ? file.data : undefined
    if (!name || !data || data.byteLength === 0) throw new TypeError('INVALID_HANDOFF_FILE')
    return { name, data }
  })
  if (!files.some((file) => classifyRinexFile(file.name, file.data) === 'observation')) {
    throw new TypeError('HANDOFF_OBSERVATION_FILE_MISSING')
  }
  return { producerAppId, runId, files, observationRole: request.observationRole }
}

function sanitizeFileName(value: string, index: number): string {
  const base = value.replace(/\\/g, '/').split('/').pop() ?? ''
  const sanitized = base
    .split('')
    .map((character) =>
      character.charCodeAt(0) <= 31 || '<>:"/\\|?*'.includes(character) ? '-' : character,
    )
    .join('')
    .replace(/^\.+/, '')
    .slice(0, 120)
  return sanitized && sanitized !== '.' && sanitized !== '..' ? sanitized : `rinex-${index + 1}.rnx`
}

function uniqueFileName(value: string, used: Set<string>): string {
  let candidate = value
  let suffix = 2
  while (used.has(candidate.toLowerCase())) {
    const extension = path.extname(value)
    const stem = value.slice(0, value.length - extension.length)
    candidate = `${stem}-${suffix++}${extension}`
  }
  used.add(candidate.toLowerCase())
  return candidate
}
