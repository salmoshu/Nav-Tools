/**
 * Axis-aligned bounding box used by the quad-tree.
 */
interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Stored point entry.
 */
interface Entry<T> {
  x: number
  y: number
  data: T
}

/**
 * Query result for the nearest neighbor search.
 */
export interface NearestResult<T> {
  data: T
  x: number
  y: number
  distance: number
}

/**
 * Simple fixed-capacity quad-tree for 2D spatial indexing.
 *
 * - Capacity threshold: 50 items per node before subdivision.
 * - Handles duplicate coordinates by keeping all entries in leaf nodes.
 * - Empty trees and out-of-bounds queries return `null`.
 */
export class QuadTree<T> {
  /** Maximum entries stored in a leaf node before it splits. */
  public static readonly CAPACITY = 50

  private bounds: Bounds
  private entries: Entry<T>[] = []
  private divided = false
  private nw: QuadTree<T> | null = null
  private ne: QuadTree<T> | null = null
  private sw: QuadTree<T> | null = null
  private se: QuadTree<T> | null = null

  constructor(bounds: Bounds) {
    this.bounds = { ...bounds }
  }

  /**
   * Re-initialize the tree with new bounds, discarding all stored data.
   */
  reset(bounds: Bounds): void {
    this.bounds = { ...bounds }
    this.entries = []
    this.divided = false
    this.nw = null
    this.ne = null
    this.sw = null
    this.se = null
  }

  /**
   * Insert a point with associated user data.
   * Returns `false` if the point lies outside the root bounds.
   */
  insert(x: number, y: number, data: T): boolean {
    const eps = 1e-12
    if (
      x < this.bounds.minX - eps ||
      x > this.bounds.maxX + eps ||
      y < this.bounds.minY - eps ||
      y > this.bounds.maxY + eps
    ) {
      return false
    }

    const entry: Entry<T> = { x, y, data }
    let node: QuadTree<T> = this

    // 下降到叶子节点
    while (node.divided) {
      const b = node.bounds
      const midX = (b.minX + b.maxX) * 0.5
      const midY = (b.minY + b.maxY) * 0.5
      if (y <= midY) {
        node = x <= midX ? node.nw! : node.ne!
      } else {
        node = x <= midX ? node.sw! : node.se!
      }
    }

    node.entries.push(entry)
    if (node.entries.length > QuadTree.CAPACITY) {
      node.subdivide()
    }
    return true
  }

  /**
   * Find the nearest entry to `(x, y)` within `maxDist`.
   * Distance is Euclidean. Returns `null` when no entry is within range.
   */
  queryNearest(x: number, y: number, maxDist: number): NearestResult<T> | null {
    if (maxDist < 0) {
      return null
    }

    let bestDistSq = maxDist * maxDist
    let best: NearestResult<T> | null = null

    // Explicit stack avoids recursive call overhead during traversal.
    const stack: QuadTree<T>[] = [this]
    while (stack.length > 0) {
      const node = stack.pop()!

      const b = node.bounds
      const closestX = b.minX > x ? b.minX : b.maxX < x ? b.maxX : x
      const closestY = b.minY > y ? b.minY : b.maxY < y ? b.maxY : y
      const dx = x - closestX
      const dy = y - closestY
      if (dx * dx + dy * dy > bestDistSq) {
        continue
      }

      const entries = node.entries
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i]
        const ex = e.x - x
        const ey = e.y - y
        const distSq = ex * ex + ey * ey
        if (distSq <= bestDistSq) {
          bestDistSq = distSq
          best = {
            data: e.data,
            x: e.x,
            y: e.y,
            distance: Math.sqrt(distSq),
          }
        }
      }

      if (node.divided) {
        stack.push(node.nw!, node.ne!, node.sw!, node.se!)
      }
    }

    return best
  }

  /**
   * Remove all entries while keeping the current bounds.
   */
  clear(): void {
    this.entries = []
    this.divided = false
    this.nw = null
    this.ne = null
    this.sw = null
    this.se = null
  }

  private subdivide(): void {
    const { minX, minY, maxX, maxY } = this.bounds
    const midX = (minX + maxX) * 0.5
    const midY = (minY + maxY) * 0.5

    this.nw = new QuadTree<T>({ minX, minY, maxX: midX, maxY: midY })
    this.ne = new QuadTree<T>({ minX: midX, minY, maxX, maxY: midY })
    this.sw = new QuadTree<T>({ minX, minY: midY, maxX: midX, maxY })
    this.se = new QuadTree<T>({ minX: midX, minY: midY, maxX, maxY })

    const oldEntries = this.entries
    this.entries = []
    this.divided = true

    // Directly distribute old entries among the four new leaf nodes.
    for (let i = 0; i < oldEntries.length; i++) {
      const e = oldEntries[i]
      if (e.y <= midY) {
        if (e.x <= midX) {
          this.nw!.entries.push(e)
        } else {
          this.ne!.entries.push(e)
        }
      } else {
        if (e.x <= midX) {
          this.sw!.entries.push(e)
        } else {
          this.se!.entries.push(e)
        }
      }
    }

    // Recursively subdivide any child that overflowed.
    if (this.nw!.entries.length > QuadTree.CAPACITY) this.nw!.subdivide()
    if (this.ne!.entries.length > QuadTree.CAPACITY) this.ne!.subdivide()
    if (this.sw!.entries.length > QuadTree.CAPACITY) this.sw!.subdivide()
    if (this.se!.entries.length > QuadTree.CAPACITY) this.se!.subdivide()
  }
}
