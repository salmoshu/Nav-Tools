import { QuadTree } from './QuadTree'

export interface PickedPoint {
  seriesId: string
  pointIndex: number
  x: number
  y: number
  quality: number
}

export interface MultiSeriesTrajectoryRenderer {
  /** 初始化渲染器，返回 false 时调用方应使用其他降级方案 */
  init(canvas: HTMLCanvasElement): boolean
  /** 添加一条序列（若已存在则清空） */
  addSeries(id: string, color?: [number, number, number, number]): void
  /** 删除序列 */
  removeSeries(id: string): void
  /** 全量设置序列数据 */
  setSeriesData(id: string, points: Array<[number, number, number]>): void
  /** 单点追加 */
  appendSeriesData(id: string, point: [number, number, number]): void
  /** 批量追加 */
  appendSeriesDataBatch(id: string, points: Array<[number, number, number]>): void
  /** 设置序列可见性 */
  setSeriesVisible(id: string, visible: boolean): void
  /** 设置序列颜色（归一化 RGBA） */
  setSeriesColor(id: string, color: [number, number, number, number]): void
  /** 设置点大小 */
  setPointSize(px: number): void
  /** 设置公共视口 */
  setViewport(xMin: number, xMax: number, yMin: number, yMax: number): void
  /** 自适应全部序列数据 */
  fitToData(): void
  /** 屏幕坐标拾取，返回最近点 */
  pickPoint(screenX: number, screenY: number): PickedPoint | null
  /** 清空所有序列 */
  clear(): void
  /** 清空指定序列 */
  clearSeries(id: string): void
  /** 画布尺寸变化 */
  onResize(width: number, height: number): void
  /** 触发一帧重绘 */
  render(): void
  /** 释放资源 */
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

interface SeriesState {
  id: string
  visible: boolean
  color: [number, number, number, number]
  points: Array<[number, number, number]>
  pointCount: number
  vertexData: Float32Array
  capacity: number
  buffer: WebGLBuffer | null
  dataBounds: Bounds | null
  quadTree: QuadTree<PickData> | null
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

const VERTEX_STRIDE = 6
const BYTES_PER_FLOAT = 4
const INITIAL_CAPACITY = 1024

/**
 * WebGL 多序列轨迹渲染器。
 *
 * 每个序列拥有独立的顶点缓冲、四叉树和空间边界，共享同一个 WebGL 上下文、
 * 着色器程序与视口变换。序列间按添加顺序绘制，可见性可独立控制。
 */
export class MultiSeriesWebGLTrajectoryRenderer implements MultiSeriesTrajectoryRenderer {
  private canvas: HTMLCanvasElement | null = null
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vertexShader: WebGLShader | null = null
  private fragmentShader: WebGLShader | null = null

  private positionLoc = -1
  private colorLoc = -1
  private transformLoc: WebGLUniformLocation | null = null
  private pointSizeLoc: WebGLUniformLocation | null = null

  private series = new Map<string, SeriesState>()
  private seriesOrder: string[] = []

  private viewport: Bounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 }
  private transform = new Float32Array(9)
  private pointSize = 2

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
      console.error(
        'MultiSeriesTrajectoryRenderer program link error:',
        gl.getProgramInfoLog(program),
      )
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

    this.setViewport(0, 1, 0, 1)
    this.onResize(canvas.width || 300, canvas.height || 150)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    return true
  }

  addSeries(id: string, color: [number, number, number, number] = [1, 1, 1, 1]): void {
    if (!this.gl) return
    this.removeSeries(id)
    const buffer = this.gl.createBuffer()
    const state: SeriesState = {
      id,
      visible: true,
      color,
      points: [],
      pointCount: 0,
      vertexData: new Float32Array(0),
      capacity: 0,
      buffer,
      dataBounds: null,
      quadTree: null,
    }
    this.series.set(id, state)
    this.seriesOrder.push(id)
  }

  removeSeries(id: string): void {
    const state = this.series.get(id)
    if (!state) return
    if (this.gl && state.buffer) {
      this.gl.deleteBuffer(state.buffer)
    }
    this.series.delete(id)
    const idx = this.seriesOrder.indexOf(id)
    if (idx !== -1) this.seriesOrder.splice(idx, 1)
  }

  setSeriesData(id: string, points: Array<[number, number, number]>): void {
    if (!this.gl) return
    const state = this.getOrCreateSeries(id)
    this.resetSeriesData(state)
    if (points.length === 0) {
      this.draw()
      return
    }
    for (const p of points) {
      state.points.push(p)
      this.updateDataBounds(state, p[0], p[1])
    }
    this.ensureCapacity(state, points.length)
    for (let i = 0; i < points.length; i++) {
      this.writeVertex(state, i, points[i][0], points[i][1], points[i][2])
    }
    this.uploadRange(state, 0, points.length)
    state.pointCount = points.length
    this.rebuildQuadTree(state)
    this.draw()
  }

  appendSeriesData(id: string, point: [number, number, number]): void {
    if (!this.gl) return
    const state = this.getOrCreateSeries(id)
    state.points.push(point)
    this.updateDataBounds(state, point[0], point[1])
    const index = state.pointCount
    this.ensureCapacity(state, index + 1)
    this.writeVertex(state, index, point[0], point[1], point[2])
    this.uploadRange(state, index, 1)
    state.pointCount++
    this.insertIntoQuadTree(state, point[0], point[1], index, point[2])
    this.draw()
  }

  appendSeriesDataBatch(id: string, points: Array<[number, number, number]>): void {
    if (!this.gl || points.length === 0) return
    const state = this.getOrCreateSeries(id)
    for (const p of points) {
      state.points.push(p)
      this.updateDataBounds(state, p[0], p[1])
    }
    const start = state.pointCount
    this.ensureCapacity(state, start + points.length)
    for (let i = 0; i < points.length; i++) {
      const [x, y, q] = points[i]
      this.writeVertex(state, start + i, x, y, q)
    }
    this.uploadRange(state, start, points.length)
    state.pointCount += points.length
    this.rebuildQuadTree(state)
    this.draw()
  }

  setSeriesVisible(id: string, visible: boolean): void {
    const state = this.series.get(id)
    if (!state || state.visible === visible) return
    state.visible = visible
    this.draw()
  }

  setSeriesColor(id: string, color: [number, number, number, number]): void {
    const state = this.series.get(id)
    if (!state) return
    state.color = color
    if (state.pointCount > 0) {
      this.recomputeColors(state)
    }
    this.draw()
  }

  setPointSize(px: number): void {
    this.pointSize = Math.max(0.1, px)
    this.draw()
  }

  setViewport(xMin: number, xMax: number, yMin: number, yMax: number): void {
    if (xMin === xMax || yMin === yMax) return
    this.viewport = { minX: xMin, maxX: xMax, minY: yMin, maxY: yMax }

    const sx = 2 / (xMax - xMin)
    const sy = 2 / (yMax - yMin)
    const tx = -(xMax + xMin) / (xMax - xMin)
    const ty = -(yMax + yMin) / (yMax - yMin)

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
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const state of this.series.values()) {
      const b = state.dataBounds
      if (!b) continue
      minX = Math.min(minX, b.minX)
      maxX = Math.max(maxX, b.maxX)
      minY = Math.min(minY, b.minY)
      maxY = Math.max(maxY, b.maxY)
    }
    if (!Number.isFinite(minX)) return
    const padX = Math.max(1e-9, (maxX - minX) * 0.05)
    const padY = Math.max(1e-9, (maxY - minY) * 0.05)
    this.setViewport(minX - padX, maxX + padX, minY - padY, maxY + padY)
  }

  pickPoint(screenX: number, screenY: number): PickedPoint | null {
    if (this.cssWidth <= 0 || this.cssHeight <= 0) return null

    const clipX = (screenX / this.cssWidth) * 2 - 1
    const clipY = 1 - (screenY / this.cssHeight) * 2

    const sx = this.transform[0]
    const sy = this.transform[4]
    if (sx === 0 || sy === 0) return null
    const dataX = (clipX - this.transform[6]) / sx
    const dataY = (clipY - this.transform[7]) / sy

    const xRange = this.viewport.maxX - this.viewport.minX
    const yRange = this.viewport.maxY - this.viewport.minY
    const pixelTol = Math.max(4, this.pointSize)
    const maxDist = Math.max(
      (xRange / this.cssWidth) * pixelTol,
      (yRange / this.cssHeight) * pixelTol,
      1e-9,
    )

    let best: (PickedPoint & { screenDistSq: number }) | null = null

    for (const state of this.series.values()) {
      if (!state.visible || state.pointCount === 0 || !state.quadTree) continue
      const result = state.quadTree.queryNearest(dataX, dataY, maxDist)
      if (!result) continue
      const screenPX = this.dataToScreenX(result.x)
      const screenPY = this.dataToScreenY(result.y)
      const dx = screenPX - screenX
      const dy = screenPY - screenY
      const distSq = dx * dx + dy * dy
      const tolSq = pixelTol * pixelTol
      if (distSq <= tolSq && (!best || distSq < best.screenDistSq)) {
        best = {
          seriesId: state.id,
          pointIndex: result.data.pointIndex,
          x: result.x,
          y: result.y,
          quality: result.data.quality,
          screenDistSq: distSq,
        }
      }
    }

    if (!best) return null
    const { screenDistSq: _, ...picked } = best
    return picked
  }

  clear(): void {
    for (const id of this.seriesOrder.slice()) {
      this.clearSeries(id)
    }
    this.setViewport(0, 1, 0, 1)
  }

  clearSeries(id: string): void {
    const state = this.series.get(id)
    if (!state) return
    state.points = []
    state.pointCount = 0
    state.vertexData = new Float32Array(0)
    state.capacity = 0
    state.dataBounds = null
    state.quadTree = null
    if (this.gl && state.buffer) {
      this.gl.deleteBuffer(state.buffer)
      state.buffer = this.gl.createBuffer()
    }
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

  render(): void {
    this.draw()
  }

  dispose(): void {
    if (this.gl) {
      for (const state of this.series.values()) {
        if (state.buffer) this.gl.deleteBuffer(state.buffer)
      }
      if (this.program) this.gl.deleteProgram(this.program)
      if (this.vertexShader) this.gl.deleteShader(this.vertexShader)
      if (this.fragmentShader) this.gl.deleteShader(this.fragmentShader)
    }
    this.gl = null
    this.program = null
    this.vertexShader = null
    this.fragmentShader = null
    this.series.clear()
    this.seriesOrder = []
    this.canvas = null
  }

  private getOrCreateSeries(id: string): SeriesState {
    let state = this.series.get(id)
    if (!state) {
      this.addSeries(id)
      state = this.series.get(id)!
    }
    return state
  }

  private resetSeriesData(state: SeriesState): void {
    state.points = []
    state.pointCount = 0
    state.vertexData = new Float32Array(0)
    state.capacity = 0
    state.dataBounds = null
    state.quadTree = null
    if (this.gl && state.buffer) {
      this.gl.deleteBuffer(state.buffer)
      state.buffer = this.gl.createBuffer()
    }
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null
    const shader = this.gl.createShader(type)
    if (!shader) return null
    this.gl.shaderSource(shader, source)
    this.gl.compileShader(shader)
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      // eslint-disable-next-line no-console
      console.error(
        'MultiSeriesTrajectoryRenderer shader compile error:',
        this.gl.getShaderInfoLog(shader),
      )
      this.gl.deleteShader(shader)
      return null
    }
    return shader
  }

  private ensureCapacity(state: SeriesState, needed: number): void {
    if (needed <= state.capacity) return
    let newCapacity = Math.max(INITIAL_CAPACITY, state.capacity || INITIAL_CAPACITY)
    while (newCapacity < needed) newCapacity *= 2

    const newData = new Float32Array(newCapacity * VERTEX_STRIDE)
    if (state.pointCount > 0) {
      newData.set(state.vertexData.subarray(0, state.pointCount * VERTEX_STRIDE))
    }
    state.vertexData = newData
    state.capacity = newCapacity

    if (this.gl && state.buffer) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, state.buffer)
      this.gl.bufferData(this.gl.ARRAY_BUFFER, state.vertexData, this.gl.DYNAMIC_DRAW)
    }
  }

  private writeVertex(
    state: SeriesState,
    index: number,
    x: number,
    y: number,
    _quality: number,
  ): void {
    const [r, g, b, a] = state.color
    const off = index * VERTEX_STRIDE
    state.vertexData[off] = x
    state.vertexData[off + 1] = y
    state.vertexData[off + 2] = r
    state.vertexData[off + 3] = g
    state.vertexData[off + 4] = b
    state.vertexData[off + 5] = a
  }

  private uploadRange(state: SeriesState, start: number, count: number): void {
    if (!this.gl || !state.buffer || count <= 0) return
    const byteOffset = start * VERTEX_STRIDE * BYTES_PER_FLOAT
    const data = state.vertexData.subarray(start * VERTEX_STRIDE, (start + count) * VERTEX_STRIDE)
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, state.buffer)
    this.gl.bufferSubData(this.gl.ARRAY_BUFFER, byteOffset, data)
  }

  private recomputeColors(state: SeriesState): void {
    const [r, g, b, a] = state.color
    for (let i = 0; i < state.pointCount; i++) {
      const off = i * VERTEX_STRIDE + 2
      state.vertexData[off] = r
      state.vertexData[off + 1] = g
      state.vertexData[off + 2] = b
      state.vertexData[off + 3] = a
    }
    if (this.gl && state.buffer) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, state.buffer)
      this.gl.bufferSubData(
        this.gl.ARRAY_BUFFER,
        0,
        state.vertexData.subarray(0, state.pointCount * VERTEX_STRIDE),
      )
    }
  }

  private updateDataBounds(state: SeriesState, x: number, y: number): void {
    if (!state.dataBounds) {
      state.dataBounds = { minX: x, maxX: x, minY: y, maxY: y }
    } else {
      state.dataBounds.minX = Math.min(state.dataBounds.minX, x)
      state.dataBounds.maxX = Math.max(state.dataBounds.maxX, x)
      state.dataBounds.minY = Math.min(state.dataBounds.minY, y)
      state.dataBounds.maxY = Math.max(state.dataBounds.maxY, y)
    }
  }

  private insertIntoQuadTree(
    state: SeriesState,
    x: number,
    y: number,
    index: number,
    quality: number,
  ): void {
    if (!state.quadTree) {
      this.rebuildQuadTree(state)
    }
    const ok = state.quadTree!.insert(x, y, { pointIndex: index, quality })
    if (!ok) {
      this.rebuildQuadTree(state)
      state.quadTree!.insert(x, y, { pointIndex: index, quality })
    }
  }

  private rebuildQuadTree(state: SeriesState): void {
    if (!state.dataBounds) {
      state.quadTree = null
      return
    }
    const { minX, maxX, minY, maxY } = state.dataBounds
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const half = Math.max(1e-9, (maxX - minX) / 2, (maxY - minY) / 2) * 1.2

    state.quadTree = new QuadTree<PickData>({
      minX: cx - half,
      maxX: cx + half,
      minY: cy - half,
      maxY: cy + half,
    })

    for (let i = 0; i < state.pointCount; i++) {
      const [x, y, q] = state.points[i]
      state.quadTree.insert(x, y, { pointIndex: i, quality: q })
    }
  }

  private dataToScreenX(x: number): number {
    return ((x - this.viewport.minX) / (this.viewport.maxX - this.viewport.minX)) * this.cssWidth
  }

  private dataToScreenY(y: number): number {
    return (
      this.cssHeight -
      ((y - this.viewport.minY) / (this.viewport.maxY - this.viewport.minY)) * this.cssHeight
    )
  }

  private draw(): void {
    if (!this.gl || !this.program) return
    const gl = this.gl

    gl.viewport(0, 0, this.canvasWidth, this.canvasHeight)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    let hasVisible = false
    for (const id of this.seriesOrder) {
      const state = this.series.get(id)
      if (!state || !state.visible || state.pointCount === 0) continue
      hasVisible = true

      gl.useProgram(this.program)
      gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer)

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

      gl.drawArrays(gl.POINTS, 0, state.pointCount)
    }

    if (!hasVisible) {
      // 确保统一清除背景，避免残留
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
  }
}

interface CanvasSeriesState {
  id: string
  visible: boolean
  color: [number, number, number, number]
  points: Array<[number, number, number]>
  dataBounds: Bounds | null
  quadTree: QuadTree<PickData> | null
}

/**
 * Canvas 2D 多序列降级渲染器。
 *
 * 与 WebGL 版本保持相同的接口与行为约定，便于组件统一调用。
 */
export class MultiSeriesCanvasTrajectoryRenderer implements MultiSeriesTrajectoryRenderer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null

  private series = new Map<string, CanvasSeriesState>()
  private seriesOrder: string[] = []

  private viewport: Bounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 }
  private pointSize = 2

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
    this.series.clear()
    this.seriesOrder = []
    this.setViewport(0, 1, 0, 1)
    this.onResize(canvas.width || 300, canvas.height || 150)
    return true
  }

  addSeries(id: string, color: [number, number, number, number] = [1, 1, 1, 1]): void {
    this.removeSeries(id)
    const state: CanvasSeriesState = {
      id,
      visible: true,
      color,
      points: [],
      dataBounds: null,
      quadTree: null,
    }
    this.series.set(id, state)
    this.seriesOrder.push(id)
  }

  removeSeries(id: string): void {
    this.series.delete(id)
    const idx = this.seriesOrder.indexOf(id)
    if (idx !== -1) this.seriesOrder.splice(idx, 1)
  }

  setSeriesData(id: string, points: Array<[number, number, number]>): void {
    const state = this.getOrCreateSeries(id)
    state.points = []
    state.dataBounds = null
    state.quadTree = null
    for (const p of points) {
      state.points.push(p)
      this.updateDataBounds(state, p[0], p[1])
    }
    this.rebuildQuadTree(state)
    this.draw()
  }

  appendSeriesData(id: string, point: [number, number, number]): void {
    const state = this.getOrCreateSeries(id)
    state.points.push(point)
    this.updateDataBounds(state, point[0], point[1])
    this.insertIntoQuadTree(state, point[0], point[1], state.points.length - 1, point[2])
    this.draw()
  }

  appendSeriesDataBatch(id: string, points: Array<[number, number, number]>): void {
    if (points.length === 0) return
    const state = this.getOrCreateSeries(id)
    for (const p of points) {
      state.points.push(p)
      this.updateDataBounds(state, p[0], p[1])
    }
    this.rebuildQuadTree(state)
    this.draw()
  }

  setSeriesVisible(id: string, visible: boolean): void {
    const state = this.series.get(id)
    if (!state || state.visible === visible) return
    state.visible = visible
    this.draw()
  }

  setSeriesColor(id: string, color: [number, number, number, number]): void {
    const state = this.series.get(id)
    if (!state) return
    state.color = color
    this.draw()
  }

  setPointSize(px: number): void {
    this.pointSize = Math.max(0.1, px)
    this.draw()
  }

  setViewport(xMin: number, xMax: number, yMin: number, yMax: number): void {
    if (xMin === xMax || yMin === yMax) return
    this.viewport = { minX: xMin, maxX: xMax, minY: yMin, maxY: yMax }
    this.draw()
  }

  fitToData(): void {
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const state of this.series.values()) {
      const b = state.dataBounds
      if (!b) continue
      minX = Math.min(minX, b.minX)
      maxX = Math.max(maxX, b.maxX)
      minY = Math.min(minY, b.minY)
      maxY = Math.max(maxY, b.maxY)
    }
    if (!Number.isFinite(minX)) return
    const padX = Math.max(1e-9, (maxX - minX) * 0.05)
    const padY = Math.max(1e-9, (maxY - minY) * 0.05)
    this.setViewport(minX - padX, maxX + padX, minY - padY, maxY + padY)
  }

  pickPoint(screenX: number, screenY: number): PickedPoint | null {
    if (this.cssWidth <= 0 || this.cssHeight <= 0) return null

    const xRange = this.viewport.maxX - this.viewport.minX
    const yRange = this.viewport.maxY - this.viewport.minY
    const dataX = this.viewport.minX + (screenX / this.cssWidth) * xRange
    const dataY = this.viewport.maxY - (screenY / this.cssHeight) * yRange

    const pixelTol = Math.max(4, this.pointSize)
    const maxDist = Math.max(
      (xRange / this.cssWidth) * pixelTol,
      (yRange / this.cssHeight) * pixelTol,
      1e-9,
    )

    let best: (PickedPoint & { screenDistSq: number }) | null = null

    for (const state of this.series.values()) {
      if (!state.visible || state.points.length === 0 || !state.quadTree) continue
      const result = state.quadTree.queryNearest(dataX, dataY, maxDist)
      if (!result) continue
      const screenPX = this.dataToScreenX(result.x)
      const screenPY = this.dataToScreenY(result.y)
      const dx = screenPX - screenX
      const dy = screenPY - screenY
      const distSq = dx * dx + dy * dy
      const tolSq = pixelTol * pixelTol
      if (distSq <= tolSq && (!best || distSq < best.screenDistSq)) {
        best = {
          seriesId: state.id,
          pointIndex: result.data.pointIndex,
          x: result.x,
          y: result.y,
          quality: result.data.quality,
          screenDistSq: distSq,
        }
      }
    }

    if (!best) return null
    const { screenDistSq: _, ...picked } = best
    return picked
  }

  clear(): void {
    for (const state of this.series.values()) {
      state.points = []
      state.dataBounds = null
      state.quadTree = null
    }
    this.setViewport(0, 1, 0, 1)
  }

  clearSeries(id: string): void {
    const state = this.series.get(id)
    if (!state) return
    state.points = []
    state.dataBounds = null
    state.quadTree = null
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
    this.draw()
  }

  render(): void {
    this.draw()
  }

  dispose(): void {
    this.ctx = null
    this.canvas = null
    this.series.clear()
    this.seriesOrder = []
  }

  private getOrCreateSeries(id: string): CanvasSeriesState {
    let state = this.series.get(id)
    if (!state) {
      this.addSeries(id)
      state = this.series.get(id)!
    }
    return state
  }

  private updateDataBounds(state: CanvasSeriesState, x: number, y: number): void {
    if (!state.dataBounds) {
      state.dataBounds = { minX: x, maxX: x, minY: y, maxY: y }
    } else {
      state.dataBounds.minX = Math.min(state.dataBounds.minX, x)
      state.dataBounds.maxX = Math.max(state.dataBounds.maxX, x)
      state.dataBounds.minY = Math.min(state.dataBounds.minY, y)
      state.dataBounds.maxY = Math.max(state.dataBounds.maxY, y)
    }
  }

  private insertIntoQuadTree(
    state: CanvasSeriesState,
    x: number,
    y: number,
    index: number,
    quality: number,
  ): void {
    if (!state.quadTree) {
      this.rebuildQuadTree(state)
    }
    const ok = state.quadTree!.insert(x, y, { pointIndex: index, quality })
    if (!ok) {
      this.rebuildQuadTree(state)
      state.quadTree!.insert(x, y, { pointIndex: index, quality })
    }
  }

  private rebuildQuadTree(state: CanvasSeriesState): void {
    if (!state.dataBounds) {
      state.quadTree = null
      return
    }
    const { minX, maxX, minY, maxY } = state.dataBounds
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const half = Math.max(1e-9, (maxX - minX) / 2, (maxY - minY) / 2) * 1.2

    state.quadTree = new QuadTree<PickData>({
      minX: cx - half,
      maxX: cx + half,
      minY: cy - half,
      maxY: cy + half,
    })

    for (let i = 0; i < state.points.length; i++) {
      const [x, y, q] = state.points[i]
      state.quadTree.insert(x, y, { pointIndex: i, quality: q })
    }
  }

  private dataToScreenX(x: number): number {
    return ((x - this.viewport.minX) / (this.viewport.maxX - this.viewport.minX)) * this.cssWidth
  }

  private dataToScreenY(y: number): number {
    return (
      this.cssHeight -
      ((y - this.viewport.minY) / (this.viewport.maxY - this.viewport.minY)) * this.cssHeight
    )
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

  private draw(): void {
    if (!this.ctx) return
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.ctx.clearRect(0, 0, this.cssWidth, this.cssHeight)
    this.applyTransform()

    for (const id of this.seriesOrder) {
      const state = this.series.get(id)
      if (!state || !state.visible || state.points.length === 0) continue
      const [r, g, b, a] = state.color
      this.ctx.fillStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`
      const radius = this.pointSize / 2
      for (const [x, y] of state.points) {
        this.ctx.beginPath()
        this.ctx.arc(x, y, radius, 0, Math.PI * 2)
        this.ctx.fill()
      }
    }
  }
}
