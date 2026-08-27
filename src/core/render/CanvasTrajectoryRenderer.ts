import { TrajectoryRenderer } from './TrajectoryRenderer'

interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

interface GridEntry {
  index: number
  x: number
  y: number
}

/**
 * Simple spatial hash grid used by the Canvas 2D fallback for picking.
 *
 * Cell size is fixed per rebuild; queries scan an expanding ring of cells
 * around the query point up to `maxDist`.
 */
class GridIndex {
  private cellSize = 1
  private cells = new Map<string, GridEntry[]>()

  setCellSize(size: number): void {
    this.cellSize = Math.max(1e-9, size)
  }

  insert(x: number, y: number, index: number): void {
    const key = this.key(x, y)
    let arr = this.cells.get(key)
    if (!arr) {
      arr = []
      this.cells.set(key, arr)
    }
    arr.push({ index, x, y })
  }

  queryNearest(x: number, y: number, maxDist: number): { index: number; distance: number } | null {
    if (this.cells.size === 0) return null

    const maxDistSq = maxDist * maxDist
    const cellRadius = Math.max(0, Math.ceil(maxDist / this.cellSize))
    const cx = Math.floor(x / this.cellSize)
    const cy = Math.floor(y / this.cellSize)

    let best: { index: number; distSq: number } | null = null

    for (let dy = -cellRadius; dy <= cellRadius; dy++) {
      for (let dx = -cellRadius; dx <= cellRadius; dx++) {
        const key = `${cx + dx},${cy + dy}`
        const arr = this.cells.get(key)
        if (!arr) continue
        for (const entry of arr) {
          const dx_ = entry.x - x
          const dy_ = entry.y - y
          const distSq = dx_ * dx_ + dy_ * dy_
          if (distSq <= maxDistSq && (!best || distSq < best.distSq)) {
            best = { index: entry.index, distSq }
          }
        }
      }
    }

    return best ? { index: best.index, distance: Math.sqrt(best.distSq) } : null
  }

  clear(): void {
    this.cells.clear()
    this.cellSize = 1
  }

  isEmpty(): boolean {
    return this.cells.size === 0
  }

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`
  }
}

/**
 * Canvas 2D fallback trajectory renderer.
 *
 * - Always initializes successfully.
 * - Draws incrementally: new points are appended with `arc()` + `fill()`
 *   without clearing the canvas; viewport or styling changes trigger a full redraw.
 * - Picking uses a simple spatial hash grid (not a quad-tree).
 */
export class CanvasTrajectoryRenderer implements TrajectoryRenderer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null

  private points: Array<[number, number, number]> = []
  private viewport: Bounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 }
  private dataBounds: Bounds | null = null
  private grid = new GridIndex()
  private lastGridRange = 0

  private pointSize = 2
  private colorMapper: (quality: number) => [number, number, number, number] = () => [1, 1, 1, 1]

  private dpr = 1
  private cssWidth = 0
  private cssHeight = 0
  private canvasWidth = 0
  private canvasHeight = 0

  init(canvas: HTMLCanvasElement): boolean {
    this.dispose()
    const ctx = canvas.getContext('2d')
    if (!ctx) return false

    this.canvas = canvas
    this.ctx = ctx
    this.points = []
    this.dataBounds = null
    this.grid.clear()
    this.lastGridRange = 0
    this.setViewport(0, 1, 0, 1)
    this.onResize(canvas.width || 300, canvas.height || 150)
    return true
  }

  addPoint(x: number, y: number, quality: number): void {
    const index = this.points.length
    this.points.push([x, y, quality])
    this.updateDataBounds(x, y)
    this.maybeRebuildGrid()
    this.grid.insert(x, y, index)

    if (this.ctx) {
      this.applyTransform()
      this.drawPoint(x, y, quality)
    }
  }

  addPointsBatch(points: Array<[number, number, number]>): void {
    if (points.length === 0) return

    for (const p of points) {
      this.points.push(p)
      this.updateDataBounds(p[0], p[1])
    }
    this.rebuildGrid()

    if (this.ctx) {
      this.applyTransform()
      for (let i = this.points.length - points.length; i < this.points.length; i++) {
        const [x, y, q] = this.points[i]
        this.drawPoint(x, y, q)
      }
    }
  }

  setViewport(xMin: number, xMax: number, yMin: number, yMax: number): void {
    if (xMin === xMax || yMin === yMax) return
    this.viewport = { minX: xMin, maxX: xMax, minY: yMin, maxY: yMax }
    this.fullRedraw()
  }

  fitToData(): void {
    if (!this.dataBounds) return
    const { minX, maxX, minY, maxY } = this.dataBounds
    const padX = Math.max(1e-9, (maxX - minX) * 0.05)
    const padY = Math.max(1e-9, (maxY - minY) * 0.05)
    this.setViewport(minX - padX, maxX + padX, minY - padY, maxY + padY)
  }

  pickPoint(
    screenX: number,
    screenY: number,
  ): { pointIndex: number; x: number; y: number; quality: number } | null {
    if (!this.dataBounds || this.points.length === 0 || this.cssWidth <= 0 || this.cssHeight <= 0) {
      return null
    }

    const xRange = this.viewport.maxX - this.viewport.minX
    const yRange = this.viewport.maxY - this.viewport.minY

    // Screen -> data coordinates.
    const dataX = this.viewport.minX + (screenX / this.cssWidth) * xRange
    const dataY = this.viewport.maxY - (screenY / this.cssHeight) * yRange

    const pixelTol = Math.max(4, this.pointSize)
    const maxDist = Math.max(
      (xRange / this.cssWidth) * pixelTol,
      (yRange / this.cssHeight) * pixelTol,
      1e-9,
    )

    const result = this.grid.queryNearest(dataX, dataY, maxDist)
    if (!result) return null
    const [x, y, q] = this.points[result.index]
    return { pointIndex: result.index, x, y, quality: q }
  }

  setPointSize(px: number): void {
    this.pointSize = Math.max(0.1, px)
    this.fullRedraw()
  }

  setColorMapper(fn: (quality: number) => [number, number, number, number]): void {
    this.colorMapper = fn
    this.fullRedraw()
  }

  clear(): void {
    this.points = []
    this.dataBounds = null
    this.grid.clear()
    this.lastGridRange = 0
    this.setViewport(0, 1, 0, 1)
    if (this.ctx) {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0)
      this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight)
    }
  }

  onResize(cssWidth: number, cssHeight: number): void {
    this.cssWidth = cssWidth
    this.cssHeight = cssHeight
    this.dpr = window.devicePixelRatio || 1
    this.canvasWidth = cssWidth * this.dpr
    this.canvasHeight = cssHeight * this.dpr
    if (this.canvas) {
      this.canvas.width = this.canvasWidth
      this.canvas.height = this.canvasHeight
      this.canvas.style.width = `${cssWidth}px`
      this.canvas.style.height = `${cssHeight}px`
    }
    this.fullRedraw()
  }

  dispose(): void {
    this.ctx = null
    this.canvas = null
    this.points = []
    this.dataBounds = null
    this.grid.clear()
    this.lastGridRange = 0
  }

  /** Public render hook (not part of the interface). */
  render(): void {
    this.fullRedraw()
  }

  private updateDataBounds(x: number, y: number): void {
    if (!this.dataBounds) {
      this.dataBounds = { minX: x, maxX: x, minY: y, maxY: y }
    } else {
      this.dataBounds.minX = Math.min(this.dataBounds.minX, x)
      this.dataBounds.maxX = Math.max(this.dataBounds.maxX, x)
      this.dataBounds.minY = Math.min(this.dataBounds.minY, y)
      this.dataBounds.maxY = Math.max(this.dataBounds.maxY, y)
    }
  }

  private maybeRebuildGrid(): void {
    if (!this.dataBounds) return
    const range = Math.max(
      1e-9,
      this.dataBounds.maxX - this.dataBounds.minX,
      this.dataBounds.maxY - this.dataBounds.minY,
    )
    if (this.grid.isEmpty() || range > this.lastGridRange * 1.5) {
      this.rebuildGrid()
      this.lastGridRange = range
    }
  }

  private rebuildGrid(): void {
    if (!this.dataBounds) return
    const range = Math.max(
      1e-9,
      this.dataBounds.maxX - this.dataBounds.minX,
      this.dataBounds.maxY - this.dataBounds.minY,
    )
    this.grid.setCellSize(range / 50)
    this.grid.clear()
    for (let i = 0; i < this.points.length; i++) {
      const [x, y] = this.points[i]
      this.grid.insert(x, y, i)
    }
    this.lastGridRange = range
  }

  private applyTransform(): void {
    if (!this.ctx) return
    const xRange = this.viewport.maxX - this.viewport.minX
    const yRange = this.viewport.maxY - this.viewport.minY
    const sx = (this.cssWidth / xRange) * this.dpr
    const sy = -(this.cssHeight / yRange) * this.dpr
    const tx = -this.viewport.minX * sx
    const ty = this.cssHeight * this.dpr - this.viewport.minY * sy
    this.ctx.setTransform(sx, 0, 0, sy, tx, ty)
  }

  private fullRedraw(): void {
    if (!this.ctx) return
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.ctx.clearRect(0, 0, this.cssWidth, this.cssHeight)
    this.applyTransform()
    for (const [x, y, q] of this.points) {
      this.drawPoint(x, y, q)
    }
  }

  private drawPoint(x: number, y: number, quality: number): void {
    if (!this.ctx) return
    const [r, g, b, a] = this.colorMapper(quality)
    this.ctx.fillStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`
    this.ctx.beginPath()
    this.ctx.arc(x, y, this.pointSize / 2, 0, Math.PI * 2)
    this.ctx.fill()
  }
}
