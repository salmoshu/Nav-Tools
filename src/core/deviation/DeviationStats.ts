// GNSS 偏差轨迹统计（rtkplot drawTrackStatistics 同源口径）：
// AVE/STD/RMS（E、N）与 2D RMS（2×水平 RMS），以及定位解质量分布。
// 纯函数，供偏差图叠加信息层与单测复用。

/** 偏差点 [E, N, quality] */
export type DeviationStatPoint = readonly [number, number, number] | readonly number[]

export interface DeviationStats {
  /** 参与统计的点数（非有限坐标点剔除） */
  count: number
  aveE: number
  aveN: number
  stdE: number
  stdN: number
  rmsE: number
  rmsN: number
  /** 2D RMS = 2 × sqrt(mean(E² + N²))，与 rtkplot "2D" 一致 */
  rms2dDoubled: number
  /** 解质量 → 点数（仅收录出现过的质量值） */
  qualityCounts: ReadonlyMap<number, number>
}

export function computeDeviationStats(points: readonly DeviationStatPoint[]): DeviationStats | null {
  const qualityCounts = new Map<number, number>()
  let count = 0
  let sumE = 0
  let sumN = 0
  let sumSqE = 0
  let sumSqN = 0
  let sumSq2d = 0

  for (const point of points) {
    const e = Number(point[0])
    const n = Number(point[1])
    if (!Number.isFinite(e) || !Number.isFinite(n)) continue
    const quality = Number(point[2])
    const key = Number.isFinite(quality) ? quality : 0
    qualityCounts.set(key, (qualityCounts.get(key) ?? 0) + 1)
    count += 1
    sumE += e
    sumN += n
    sumSqE += e * e
    sumSqN += n * n
    sumSq2d += e * e + n * n
  }

  if (count === 0) return null

  const aveE = sumE / count
  const aveN = sumN / count
  return {
    count,
    aveE,
    aveN,
    // STD 用对均值的二阶矩；RMS 用对零点的二阶矩（与 rtkplot calcStats 一致）
    stdE: Math.sqrt(Math.max(0, sumSqE / count - aveE * aveE)),
    stdN: Math.sqrt(Math.max(0, sumSqN / count - aveN * aveN)),
    rmsE: Math.sqrt(sumSqE / count),
    rmsN: Math.sqrt(sumSqN / count),
    rms2dDoubled: 2 * Math.sqrt(sumSq2d / count),
    qualityCounts,
  }
}
