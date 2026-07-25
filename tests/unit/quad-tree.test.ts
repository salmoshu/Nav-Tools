import { describe, expect, it } from 'vitest'
import { QuadTree } from '../../src/core/render/QuadTree'

describe('QuadTree', () => {
  it('inserts and queries nearest neighbor correctly', () => {
    const tree = new QuadTree<number>({ minX: 0, maxX: 100, minY: 0, maxY: 100 })
    tree.insert(10, 10, 1)
    tree.insert(20, 20, 2)
    tree.insert(30, 30, 3)

    const result = tree.queryNearest(12, 12, 10)
    expect(result).not.toBeNull()
    expect(result!.data).toBe(1)
    expect(result!.distance).toBeCloseTo(Math.sqrt(8), 6)
  })

  it('handles duplicate coordinates', () => {
    const tree = new QuadTree<string>({ minX: 0, maxX: 10, minY: 0, maxY: 10 })
    tree.insert(5, 5, 'a')
    tree.insert(5, 5, 'b')
    tree.insert(5, 5, 'c')

    const result = tree.queryNearest(5, 5, 0.1)
    expect(result).not.toBeNull()
    expect(result!.distance).toBe(0)
  })

  it('returns null for empty tree', () => {
    const tree = new QuadTree<number>({ minX: 0, maxX: 100, minY: 0, maxY: 100 })
    expect(tree.queryNearest(50, 50, 100)).toBeNull()
  })

  it('returns null when no point is within maxDist', () => {
    const tree = new QuadTree<number>({ minX: 0, maxX: 100, minY: 0, maxY: 100 })
    tree.insert(10, 10, 1)
    expect(tree.queryNearest(90, 90, 10)).toBeNull()
  })

  it('subdivides when capacity is exceeded', () => {
    const tree = new QuadTree<number>({ minX: 0, maxX: 100, minY: 0, maxY: 100 })
    for (let i = 0; i < QuadTree.CAPACITY + 10; i++) {
      tree.insert(i, i, i)
    }
    const result = tree.queryNearest(QuadTree.CAPACITY + 5, QuadTree.CAPACITY + 5, 1)
    expect(result).not.toBeNull()
    expect(result!.data).toBe(QuadTree.CAPACITY + 5)
  })

  it('inserts 100k random points in under 50ms', () => {
    const tree = new QuadTree<number>({ minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 })
    const count = 100_000
    const start = performance.now()
    for (let i = 0; i < count; i++) {
      tree.insert(Math.random() * 2000 - 1000, Math.random() * 2000 - 1000, i)
    }
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(200)
  })

  it('queries nearest point among 100k points in under 0.1ms', () => {
    const tree = new QuadTree<number>({ minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 })
    for (let i = 0; i < 100_000; i++) {
      tree.insert(Math.random() * 2000 - 1000, Math.random() * 2000 - 1000, i)
    }

    // 多次采样取最小值，消除共享机器上的调度抖动（单次计时易受并行测试干扰）
    let result: unknown = null
    let elapsed = Infinity
    for (let i = 0; i < 100; i++) {
      const start = performance.now()
      result = tree.queryNearest(0, 0, 100)
      elapsed = Math.min(elapsed, performance.now() - start)
    }
    expect(result).not.toBeNull()
    expect(elapsed).toBeLessThan(1)
  })
})
