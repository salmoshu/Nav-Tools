import { QuadTree } from './QuadTree'

export interface TrajectoryRenderer {
  /** 初始化 WebGL 上下文，返回 false 时调用方应走 Canvas 2D 降级 */
  init(canvas: HTMLCanvasElement): boolean
  /** 增量追加单点（不触发重绘） */
  addPoint(x: number, y: number, quality: number): void
  /** 批量追加（初始化或滑窗重置时） */
  addPointsBatch(points: Array<[number, number, number]>): void
  /** 设置/平移视口（只改变换矩阵，数据不动） */
  setViewport(xMin: number, xMax: number, yMin: number, yMax: number): void
  /** 重置视口以自适应全部点 */
  fitToData(): void
  /** 屏幕坐标 → 最近的数据点（四叉树拾取） */
  pickPoint(
    screenX: number,
    screenY: number,
  ): { pointIndex: number; x: number; y: number; quality: number } | null
  /** 设置点尺寸（px） */
  setPointSize(px: number): void
  /** 设置颜色映射函数 */
  setColorMapper(fn: (quality: number) => [number, number, number, number]): void
  /** 清空所有数据 */
  clear(): void
  /** 画布尺寸变化 */
  onResize(width: number, height: number): void
  /** 触发一帧重绘 */
  render(): void
  /** 释放 WebGL 资源 */
  dispose(): void
}

interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

interface PickData {
  pointIndex: number
  quality: number
}

const WEBGL1_VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec4 a_color;
uniform mat3 u_transform;
uniform float u_pointSize;
varying vec4 v_color;
void main() {
  vec3 pos = u_transform * vec3(a_position, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
  gl_PointSize = u_pointSize;
  v_color = a_color;
}
`

const WEBGL1_FRAGMENT_SHADER = `
precision mediump float;
varying vec4 v_color;
uniform highp float u_pointSize;
void main() {
  float dist = length(gl_PointCoord - vec2(0.5));
  if (dist > 0.5) discard;
  float edge = 1.0 / u_pointSize;
  float alpha = smoothstep(0.5, 0.5 - edge, dist);
  gl_FragColor = vec4(v_color.rgb, v_color.a * alpha);
}
`

const WEBGL2_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec4 a_color;
uniform mat3 u_transform;
uniform float u_pointSize;
out vec4 v_color;
void main() {
  vec3 pos = u_transform * vec3(a_position, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
  gl_PointSize = u_pointSize;
  v_color = a_color;
}
`

const WEBGL2_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec4 v_color;
uniform highp float u_pointSize;
out vec4 fragColor;
void main() {
  float dist = length(gl_PointCoord - vec2(0.5));
  if (dist > 0.5) discard;
  float edge = 1.0 / u_pointSize;
  float alpha = smoothstep(0.5, 0.5 - edge, dist);
  fragColor = vec4(v_color.rgb, v_color.a * alpha);
}
`

/** Number of floats per vertex: x, y, r, g, b, a. */
const VERTEX_STRIDE = 6
/** Bytes per float. */
const BYTES_PER_FLOAT = 4
/** Initial point capacity; doubled as needed. */
const INITIAL_CAPACITY = 1024
/** Loose index bounds avoid rebuilding the entire tree for each small range expansion. */
const QUAD_TREE_MIN_HALF_SPAN = 1
const QUAD_TREE_BOUNDS_PADDING = 4

/**
 * WebGL-based trajectory renderer.
 *
 * - Tries WebGL2 first, then WebGL1. If neither is available `init` returns false.
 * - Point geometry and per-vertex color are stored in a single interleaved
 *   `Float32Array` and uploaded incrementally with `bufferSubData`.
 * - A hand-written 2D affine transform (mat3, column-major for GLSL) maps data
 *   coordinates to clip space.
 * - Spatial picking is backed by {@link QuadTree}.
 */
export class WebGLTrajectoryRenderer implements TrajectoryRenderer {
  private canvas: HTMLCanvasElement | null = null
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vertexShader: WebGLShader | null = null
  private fragmentShader: WebGLShader | null = null
  private buffer: WebGLBuffer | null = null

  private positionLoc = -1
  private colorLoc = -1
  private transformLoc: WebGLUniformLocation | null = null
  private pointSizeLoc: WebGLUniformLocation | null = null

  private vertexData: Float32Array = new Float32Array(0)
  private capacity = 0
  private pointCount = 0
  private pointSize = 2
  private colorMapper: (quality: number) => [number, number, number, number] = () => [1, 1, 1, 1]

  private viewport: Bounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 }
  private transform = new Float32Array(9)
  private dataBounds: Bounds | null = null
  private quadTree: QuadTree<PickData> | null = null

  private dpr = 1
  private cssWidth = 0
  private cssHeight = 0
  private canvasWidth = 0
  private canvasHeight = 0

  init(canvas: HTMLCanvasElement): boolean {
    this.dispose()
    this.canvas = canvas

    const gl =
      (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
      (canvas.getContext('webgl') as WebGLRenderingContext | null)
    if (!gl) {
      return false
    }
    this.gl = gl

    const isWebGL2 = 'drawArraysInstanced' in gl
    const vsSource = isWebGL2 ? WEBGL2_VERTEX_SHADER : WEBGL1_VERTEX_SHADER
    const fsSource = isWebGL2 ? WEBGL2_FRAGMENT_SHADER : WEBGL1_FRAGMENT_SHADER

    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource)
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource)
    if (!vs || !fs) {
      this.dispose()
      return false
    }

    const program = gl.createProgram()
    if (!program) {
      this.dispose()
      return false
    }
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      // eslint-disable-next-line no-console
      console.error('TrajectoryRenderer program link error:', gl.getProgramInfoLog(program))
      this.dispose()
      return false
    }

    this.program = program
    this.vertexShader = vs
    this.fragmentShader = fs

    this.positionLoc = gl.getAttribLocation(program, 'a_position')
    this.colorLoc = gl.getAttribLocation(program, 'a_color')
    this.transformLoc = gl.getUniformLocation(program, 'u_transform')
    this.pointSizeLoc = gl.getUniformLocation(program, 'u_pointSize')

    this.buffer = gl.createBuffer()
    this.ensureCapacity(INITIAL_CAPACITY)
    this.setViewport(0, 1, 0, 1)

    // Read initial canvas size if present.
    this.onResize(canvas.width || 300, canvas.height || 150)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    return true
  }

  addPoint(x: number, y: number, quality: number): void {
    this.points.push([x, y, quality])
    this.updateDataBounds(x, y)

    const index = this.pointCount
    this.ensureCapacity(this.pointCount + 1)
    this.writeVertex(index, x, y, quality)
    this.uploadRange(index, 1)
    this.pointCount++

    this.insertIntoQuadTree(x, y, index, quality)
  }

  addPointsBatch(points: Array<[number, number, number]>): void {
    if (points.length === 0) return

    for (const p of points) {
      this.points.push(p)
      this.updateDataBounds(p[0], p[1])
    }

    const start = this.pointCount
    const added = points.length
    this.ensureCapacity(this.pointCount + added)
    for (let i = 0; i < added; i++) {
      const [x, y, q] = points[i]
      this.writeVertex(start + i, x, y, q)
    }
    this.uploadRange(start, added)
    this.pointCount += added

    this.rebuildQuadTree()
  }

  setViewport(xMin: number, xMax: number, yMin: number, yMax: number): void {
    if (xMin === xMax || yMin === yMax) {
      // Degenerate viewport would make the transform singular.
      return
    }
    this.viewport = { minX: xMin, maxX: xMax, minY: yMin, maxY: yMax }

    const sx = 2 / (xMax - xMin)
    const sy = 2 / (yMax - yMin)
    const tx = -(xMax + xMin) / (xMax - xMin)
    const ty = -(yMax + yMin) / (yMax - yMin)

    // Column-major mat3 for GLSL.
    this.transform[0] = sx
    this.transform[1] = 0
    this.transform[2] = 0
    this.transform[3] = 0
    this.transform[4] = sy
    this.transform[5] = 0
    this.transform[6] = tx
    this.transform[7] = ty
    this.transform[8] = 1

    this.draw()
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
    if (!this.quadTree || this.pointCount === 0 || this.cssWidth <= 0 || this.cssHeight <= 0) {
      return null
    }

    // Screen -> clip space (Y flipped because screen Y grows downward).
    const clipX = (screenX / this.cssWidth) * 2 - 1
    const clipY = 1 - (screenY / this.cssHeight) * 2

    // Inverse the 2D transform. Transform is column-major [sx,0,0, 0,sy,0, tx,ty,1].
    const sx = this.transform[0]
    const sy = this.transform[4]
    if (sx === 0 || sy === 0) return null
    const dataX = (clipX - this.transform[6]) / sx
    const dataY = (clipY - this.transform[7]) / sy

    // Convert a pixel tolerance to data units.
    const xRange = this.viewport.maxX - this.viewport.minX
    const yRange = this.viewport.maxY - this.viewport.minY
    const pixelTol = Math.max(4, this.pointSize)
    const maxDist = Math.max(
      (xRange / this.cssWidth) * pixelTol,
      (yRange / this.cssHeight) * pixelTol,
      1e-9,
    )

    const result = this.quadTree.queryNearest(dataX, dataY, maxDist)
    if (!result) return null
    return {
      pointIndex: result.data.pointIndex,
      x: result.x,
      y: result.y,
      quality: result.data.quality,
    }
  }

  setPointSize(px: number): void {
    this.pointSize = Math.max(0.1, px)
    this.draw()
  }

  setColorMapper(fn: (quality: number) => [number, number, number, number]): void {
    this.colorMapper = fn
    this.recomputeColors()
    this.draw()
  }

  clear(): void {
    this.points = []
    this.pointCount = 0
    this.dataBounds = null
    this.quadTree = null
    this.setViewport(0, 1, 0, 1)
    this.draw()
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
    if (this.gl) {
      this.gl.viewport(0, 0, this.canvasWidth, this.canvasHeight)
    }
    this.draw()
  }

  dispose(): void {
    if (this.gl) {
      if (this.buffer) this.gl.deleteBuffer(this.buffer)
      if (this.program) this.gl.deleteProgram(this.program)
      if (this.vertexShader) this.gl.deleteShader(this.vertexShader)
      if (this.fragmentShader) this.gl.deleteShader(this.fragmentShader)
    }
    this.gl = null
    this.program = null
    this.vertexShader = null
    this.fragmentShader = null
    this.buffer = null
    this.canvas = null
    this.pointCount = 0
    this.capacity = 0
    this.vertexData = new Float32Array(0)
    this.dataBounds = null
    this.quadTree = null
  }

  /** Public render hook (not part of the interface) to draw accumulated points. */
  render(): void {
    this.draw()
  }

  private points: Array<[number, number, number]> = []

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null
    const shader = this.gl.createShader(type)
    if (!shader) return null
    this.gl.shaderSource(shader, source)
    this.gl.compileShader(shader)
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      // eslint-disable-next-line no-console
      console.error('TrajectoryRenderer shader compile error:', this.gl.getShaderInfoLog(shader))
      this.gl.deleteShader(shader)
      return null
    }
    return shader
  }

  private ensureCapacity(needed: number): void {
    if (needed <= this.capacity) return
    let newCapacity = Math.max(INITIAL_CAPACITY, this.capacity || INITIAL_CAPACITY)
    while (newCapacity < needed) newCapacity *= 2

    const newData = new Float32Array(newCapacity * VERTEX_STRIDE)
    if (this.pointCount > 0) {
      newData.set(this.vertexData.subarray(0, this.pointCount * VERTEX_STRIDE))
    }
    this.vertexData = newData
    this.capacity = newCapacity

    if (this.gl && this.buffer) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer)
      this.gl.bufferData(this.gl.ARRAY_BUFFER, this.vertexData, this.gl.DYNAMIC_DRAW)
    }
  }

  private writeVertex(index: number, x: number, y: number, quality: number): void {
    const [r, g, b, a] = this.colorMapper(quality)
    const off = index * VERTEX_STRIDE
    this.vertexData[off] = x
    this.vertexData[off + 1] = y
    this.vertexData[off + 2] = r
    this.vertexData[off + 3] = g
    this.vertexData[off + 4] = b
    this.vertexData[off + 5] = a
  }

  private uploadRange(start: number, count: number): void {
    if (!this.gl || !this.buffer || count <= 0) return
    const byteOffset = start * VERTEX_STRIDE * BYTES_PER_FLOAT
    const data = this.vertexData.subarray(start * VERTEX_STRIDE, (start + count) * VERTEX_STRIDE)
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer)
    this.gl.bufferSubData(this.gl.ARRAY_BUFFER, byteOffset, data)
  }

  private recomputeColors(): void {
    for (let i = 0; i < this.pointCount; i++) {
      const q = this.points[i][2]
      const [r, g, b, a] = this.colorMapper(q)
      const off = i * VERTEX_STRIDE + 2
      this.vertexData[off] = r
      this.vertexData[off + 1] = g
      this.vertexData[off + 2] = b
      this.vertexData[off + 3] = a
    }
    if (this.pointCount > 0 && this.gl && this.buffer) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer)
      this.gl.bufferSubData(
        this.gl.ARRAY_BUFFER,
        0,
        this.vertexData.subarray(0, this.pointCount * VERTEX_STRIDE),
      )
    }
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

  private insertIntoQuadTree(x: number, y: number, index: number, quality: number): void {
    if (!this.quadTree) {
      this.rebuildQuadTree()
      return
    }
    const ok = this.quadTree!.insert(x, y, { pointIndex: index, quality })
    if (!ok) {
      this.rebuildQuadTree()
    }
  }

  private rebuildQuadTree(): void {
    if (!this.dataBounds) {
      this.quadTree = null
      return
    }
    const { minX, maxX, minY, maxY } = this.dataBounds
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const half =
      Math.max(QUAD_TREE_MIN_HALF_SPAN, (maxX - minX) / 2, (maxY - minY) / 2) *
      QUAD_TREE_BOUNDS_PADDING

    this.quadTree = new QuadTree<PickData>({
      minX: cx - half,
      maxX: cx + half,
      minY: cy - half,
      maxY: cy + half,
    })

    for (let i = 0; i < this.pointCount; i++) {
      const [x, y, q] = this.points[i]
      this.quadTree.insert(x, y, { pointIndex: i, quality: q })
    }
  }

  private draw(): void {
    if (!this.gl || !this.program || !this.buffer) return
    const gl = this.gl

    gl.viewport(0, 0, this.canvasWidth, this.canvasHeight)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    if (this.pointCount === 0) return

    gl.useProgram(this.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)

    if (this.positionLoc >= 0) {
      gl.enableVertexAttribArray(this.positionLoc)
      gl.vertexAttribPointer(
        this.positionLoc,
        2,
        gl.FLOAT,
        false,
        VERTEX_STRIDE * BYTES_PER_FLOAT,
        0,
      )
    }
    if (this.colorLoc >= 0) {
      gl.enableVertexAttribArray(this.colorLoc)
      gl.vertexAttribPointer(
        this.colorLoc,
        4,
        gl.FLOAT,
        false,
        VERTEX_STRIDE * BYTES_PER_FLOAT,
        2 * BYTES_PER_FLOAT,
      )
    }

    if (this.transformLoc) gl.uniformMatrix3fv(this.transformLoc, false, this.transform)
    if (this.pointSizeLoc) gl.uniform1f(this.pointSizeLoc, this.pointSize * this.dpr)

    gl.drawArrays(gl.POINTS, 0, this.pointCount)
  }
}
