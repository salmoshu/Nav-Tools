// The recorder's two-link planar chain only: odom_est -> base_link -> laser.
// Full-file Header-time lookup is intentional: scan pose TF can arrive after the scan event.
import type { McapDocument } from './McapDocument'
import { asLaserScan, asTfMessage, headerStampNs, messageHeader, transformXY } from './LidarGeometry'
import { parsePlannerState } from './PlannerState'

interface Pose2 { x: number; y: number; yaw: number }
interface Sample extends Pose2 { eventNs: number }
interface ScanSample { poseNs: bigint | undefined; laserNs: bigint | undefined; eventNs: number }
const indexes = new WeakMap<McapDocument, RecordedTransforms>()

export class RecordedTransforms {
  private readonly base = new Map<bigint, Sample[]>()
  private readonly laser = new Map<bigint, Sample[]>()
  private readonly scans = new Map<bigint, ScanSample[]>()
  public readonly hasDynamicTf: boolean

  public static forDocument(doc: McapDocument): RecordedTransforms {
    let index = indexes.get(doc)
    if (!index) {
      index = new RecordedTransforms(doc)
      indexes.set(doc, index)
    }
    return index
  }

  private constructor(doc: McapDocument) {
    const count = doc.topicInfo('/tf')?.messageCount ?? 0
    for (let i = 0; i < count; i++) {
      const tf = asTfMessage(doc.decodeByIndex('/tf', i))
      for (const entry of tf?.transforms ?? []) {
        const header = messageHeader(entry)
        const stamp = headerStampNs(header)
        const samples = header?.frame_id === 'odom_est' && entry.child_frame_id === 'base_link'
          ? this.base : header?.frame_id === 'base_link' && entry.child_frame_id === 'laser'
            ? this.laser : undefined
        if (!samples || stamp === undefined) continue
        const { translation: p, rotation: q } = entry.transform
        const yaw = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))
        if (![p.x, p.y, yaw].every(Number.isFinite)) continue
        const list = samples.get(stamp) ?? []
        list.push({ x: p.x, y: p.y, yaw, eventNs: doc.timeAt('/tf', i) })
        samples.set(stamp, list)
      }
    }
    this.hasDynamicTf = this.base.size > 0
    const stateCount = doc.topicInfo('/planner_state')?.messageCount ?? 0
    for (let i = 0; i < stateCount; i++) {
      const state = parsePlannerState(doc.decodeByIndex('/planner_state', i))
      if (!state) continue
      const valid = state.scan_capture_valid && state.scan_capture_ns !== null && state.has_scan_pose &&
        state.scan_pose_ns !== null && state.pose_ns !== null
      // Processing-time fallback is explicitly not a known capture pose. Index the
      // invalid association too, so a coincidentally equal plan TF cannot upgrade it.
      const captureNs = BigInt(state.scan_capture_ns ?? state.processing_start_ns)
      const samples = this.scans.get(captureNs) ?? []
      samples.push({
        poseNs: valid ? BigInt(state.scan_pose_ns!) : undefined,
        laserNs: valid ? BigInt(state.pose_ns!) : undefined,
        eventNs: doc.timeAt('/planner_state', i),
      })
      this.scans.set(captureNs, samples)
    }
  }

  /** Missing exact samples remain missing. No nearest-pose substitution or interpolation. */
  public toWorld(xy: Float32Array, message: unknown, eventNs: number): Float32Array | undefined {
    const header = messageHeader(message)
    if (header?.frame_id === 'odom_est') return xy
    const stamp = headerStampNs(header)
    if (stamp === undefined) return undefined
    // A capture can use a recorded pose-history sample with a different timestamp.
    // This association is producer evidence, not a nearest-time pose approximation.
    const captures = asLaserScan(message) ? this.scans.get(stamp) : undefined
    const capture = captures?.find((sample) => sample.eventNs >= eventNs) ?? captures?.[captures.length - 1]
    if (capture && (capture.poseNs === undefined || capture.laserNs === undefined)) return undefined
    const base = this.exact(this.base, capture?.poseNs ?? stamp, capture?.eventNs ?? eventNs)
    if (!base) return undefined
    if (header?.frame_id === 'base_link') return transformXY(xy, base.x, base.y, base.yaw)
    if (header?.frame_id !== 'laser') return undefined
    const laser = this.exact(this.laser, capture?.laserNs ?? stamp, capture?.eventNs ?? eventNs)
    if (!laser) return undefined
    const inBase = transformXY(xy, laser.x, laser.y, laser.yaw)
    return transformXY(inBase, base.x, base.y, base.yaw)
  }

  private exact(index: Map<bigint, Sample[]>, stamp: bigint, eventNs: number): Sample | undefined {
    const samples = index.get(stamp)
    if (!samples) return undefined
    // Repeated historical TF may carry corrections. Use the first availability at/after
    // this geometry's event, otherwise the last prior exact sample; never another stamp.
    return samples.find((sample) => sample.eventNs >= eventNs) ?? samples[samples.length - 1]
  }
}
