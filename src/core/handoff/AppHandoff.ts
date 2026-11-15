export const APP_HANDOFF_FORMATS = [
  'raw',
  'regex',
  'rtcm3',
  'rinex',
  'nmea',
  'rtklib-pos',
  'json',
  'csv',
  'mcap',
] as const
export const GNSS_SOLUTION_HANDOFF_FORMATS = ['nmea', 'rtklib-pos'] as const

export type GnssSolutionHandoffFormat = (typeof GNSS_SOLUTION_HANDOFF_FORMATS)[number]
/** Concrete DataFormat values, duplicated structurally to keep the Electron boundary alias-free. */
export type AppHandoffFormat = (typeof APP_HANDOFF_FORMATS)[number]

export function isAppHandoffFormat(value: unknown): value is AppHandoffFormat {
  return APP_HANDOFF_FORMATS.includes(value as AppHandoffFormat)
}
export type AppHandoffArtifactKind =
  'completed-result' | 'realtime-snapshot' | 'rinex-input' | 'recording' | 'source-file'
export type AppHandoffFileRole =
  'solution' | 'rover-observation' | 'base-observation' | 'navigation' | 'recording' | 'source'
export type AppHandoffLoaderId =
  'gnss-solution' | 'rtkpost-rinex' | 'text-replay' | 'gnssraw-source' | 'lidar-mcap'

export interface AppHandoffFile {
  path: string
  role: AppHandoffFileRole
  format: AppHandoffFormat
  sizeBytes: number
  modifiedAt: string
  /** Custom record-parser settings travel with regex recordings. */
  regexPattern?: string
}

export interface AppHandoffArtifact {
  artifactId: string
  producerAppId: string
  runId: string
  createdAt: string
  kind: AppHandoffArtifactKind
  files: AppHandoffFile[]
}

export interface AppHandoffSnapshotRequest {
  sourcePath: string
  runId: string
  kind: Extract<AppHandoffArtifactKind, 'completed-result' | 'realtime-snapshot'>
  format: GnssSolutionHandoffFormat
}

export interface AppHandoffSnapshotResult {
  artifact: AppHandoffArtifact
  recordCount: number
}

export interface AppHandoffRinexFileContent {
  name: string
  data: Uint8Array
}

export interface AppHandoffRinexWriteRequest {
  producerAppId: string
  runId: string
  files: AppHandoffRinexFileContent[]
  /** RTCM base-station observations must not silently become rover observations. */
  observationRole: 'rover-observation' | 'base-observation'
}

export interface AppHandoffTargetRegistration {
  applicationId: string
  artifactKinds: readonly AppHandoffArtifactKind[]
  roles: readonly AppHandoffFileRole[]
  formats: readonly AppHandoffFormat[]
  loader: AppHandoffLoaderId
  requiredRoles?: readonly AppHandoffFileRole[]
}

const SOLUTION_KINDS = ['completed-result', 'realtime-snapshot'] as const
const RECORDING_KINDS = ['recording', 'source-file'] as const
const TEXT_FORMATS = ['nmea', 'rtklib-pos', 'json', 'csv', 'raw', 'regex'] as const

/**
 * Target registration is deliberately application-centric. PanelDataContract remains
 * responsible for panel data compatibility, not for deciding application ownership.
 * Every loader listed here has a concrete implementation in useAppHandoff.
 */
export const APP_HANDOFF_TARGETS: readonly AppHandoffTargetRegistration[] = [
  {
    applicationId: 'gnss',
    artifactKinds: [...SOLUTION_KINDS, ...RECORDING_KINDS],
    roles: ['solution', 'recording', 'source'],
    formats: GNSS_SOLUTION_HANDOFF_FORMATS,
    loader: 'gnss-solution',
    requiredRoles: undefined,
  },
  {
    applicationId: 'gnsslib',
    artifactKinds: ['rinex-input'],
    roles: ['rover-observation', 'base-observation', 'navigation'],
    formats: ['rinex'],
    loader: 'rtkpost-rinex',
  },
  {
    applicationId: 'serial',
    artifactKinds: RECORDING_KINDS,
    roles: ['recording', 'source'],
    formats: TEXT_FORMATS,
    loader: 'text-replay',
  },
  {
    applicationId: 'motor',
    artifactKinds: RECORDING_KINDS,
    roles: ['recording', 'source'],
    formats: TEXT_FORMATS,
    loader: 'text-replay',
  },
  {
    applicationId: 'gnssraw',
    artifactKinds: ['source-file', 'rinex-input'],
    roles: ['source', 'rover-observation', 'base-observation', 'navigation'],
    formats: ['rtcm3', 'rinex'],
    loader: 'gnssraw-source',
  },
  {
    applicationId: 'lidar',
    artifactKinds: ['source-file'],
    roles: ['source'],
    formats: ['mcap'],
    loader: 'lidar-mcap',
  },
]

export function resolveAppHandoffTargets(
  artifact: AppHandoffArtifact,
): AppHandoffTargetRegistration[] {
  return APP_HANDOFF_TARGETS.filter((target) => {
    if (!target.artifactKinds.includes(artifact.kind) || artifact.files.length === 0) return false
    // Single-file replay must not silently discard the other members of a file group.
    if (
      artifact.files.length !== 1 &&
      ['gnss-solution', 'text-replay', 'lidar-mcap'].includes(target.loader)
    )
      return false
    if (
      !artifact.files.every(
        (file) => target.roles.includes(file.role) && target.formats.includes(file.format),
      )
    )
      return false
    if (
      target.applicationId === 'gnsslib' &&
      !artifact.files.some(
        (file) => file.role === 'rover-observation' || file.role === 'base-observation',
      )
    )
      return false
    return (
      target.requiredRoles?.every((role) => artifact.files.some((file) => file.role === role)) ??
      true
    )
  })
}

export function solutionFileForHandoff(artifact: AppHandoffArtifact): AppHandoffFile {
  const file = artifact.files.find((candidate) => candidate.role === 'solution')
  if (!file) throw new Error('HANDOFF_SOLUTION_FILE_MISSING')
  return file
}

export function singleRecordingFileForHandoff(artifact: AppHandoffArtifact): AppHandoffFile {
  const file = artifact.files.find(
    (candidate) => candidate.role === 'recording' || candidate.role === 'source',
  )
  if (!file || artifact.files.length !== 1) throw new Error('HANDOFF_RECORDING_FILE_MISSING')
  return file
}

export function isGnssSolutionHandoffFormat(value: unknown): value is GnssSolutionHandoffFormat {
  return GNSS_SOLUTION_HANDOFF_FORMATS.includes(value as GnssSolutionHandoffFormat)
}

export function createAppHandoffArtifact(
  producerAppId: string,
  runId: string,
  kind: AppHandoffArtifactKind,
  files: Array<
    Omit<AppHandoffFile, 'sizeBytes' | 'modifiedAt'> &
      Partial<Pick<AppHandoffFile, 'sizeBytes' | 'modifiedAt'>>
  >,
): AppHandoffArtifact {
  return {
    artifactId: crypto.randomUUID(),
    producerAppId,
    runId,
    createdAt: new Date().toISOString(),
    kind,
    files: files.map((file) => ({
      ...file,
      sizeBytes: file.sizeBytes ?? 0,
      modifiedAt: file.modifiedAt ?? new Date().toISOString(),
    })),
  }
}
