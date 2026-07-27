import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CanvasSatelliteTimeSeriesRenderer,
  WebGLSatelliteTimeSeriesRenderer,
  buildSatelliteSeriesGeometry,
} from '../../src/core/render/SatelliteTimeSeriesRenderer'
import { createSatelliteTimeSeriesRenderer } from '../../src/core/render/createSatelliteTimeSeriesRenderer'

/* ----------------------------- mocks ----------------------------- */

function createMockWebGLContext() {
  return {
    ARRAY_BUFFER: 34962,
    COLOR_BUFFER_BIT: 16384,
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    LINE_STRIP: 3,
    POINTS: 0,
    FLOAT: 5126,
    BLEND: 3042,
    SRC_ALPHA: 770,
    ONE_MINUS_SRC_ALPHA: 771,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    DYNAMIC_DRAW: 35048,

    createBuffer: vi.fn(() => ({ __id: 'buffer' })),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    bufferSubData: vi.fn(),

    createShader: vi.fn((type: number) => ({ __id: `shader-${type}` })),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),

    createProgram: vi.fn(() => ({ __id: 'program' })),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    useProgram: vi.fn(),
    deleteProgram: vi.fn(),

    getAttribLocation: vi.fn((_: unknown, name: string) => (name === 'a_position' ? 0 : -1)),
    getUniformLocation: vi.fn((_: unknown, name: string) => ({ __name: name })),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),

    uniformMatrix3fv: vi.fn(),
    uniform4fv: vi.fn(),

    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    drawArrays: vi.fn(),
    lineWidth: vi.fn(),
    enable: vi.fn(),
    blendFunc: vi.fn(),

    deleteBuffer: vi.fn(),
    getExtension: vi.fn(() => null),
  }
}

function createMockCanvasWebGL(gl: ReturnType<typeof createMockWebGLContext>) {
  const canvas = document.createElement('canvas')
  canvas.getContext = vi.fn((type: string) => {
    if (type === 'webgl2') return gl
    return null
  }) as unknown as HTMLCanvasElement['getContext']
  return canvas
}

function createMockCanvasWebGL1(gl: ReturnType<typeof createMockWebGLContext>) {
  const canvas = document.createElement('canvas')
  canvas.getContext = vi.fn((type: string) => {
    if (type === 'webgl2') return null
    if (type === 'webgl') return gl
    return null
  }) as unknown as HTMLCanvasElement['getContext']
  return canvas
}

function createMockCanvas2DContext() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fill: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    lineJoin: '',
    lineCap: '',
    canvas: { width: 300, height: 150 },
  }
}

function createMockCanvas2D(ctx: ReturnType<typeof createMockCanvas2DContext>) {
  const canvas = document.createElement('canvas')
  canvas.getContext = vi.fn((type: string) => {
    if (type === '2d') return ctx
    return null
  }) as unknown as HTMLCanvasElement['getContext']
  return canvas
}

/* --------------------------- pure function: buildSatelliteSeriesGeometry --------------------------- */

describe('buildSatelliteSeriesGeometry', () => {
  it('packs contiguous valid points into a single segment', () => {
    const geo = buildSatelliteSeriesGeometry(new Float32Array([0, 0, 1, 1, 2, 2]))
    expect(geo.segments).toEqual([{ start: 0, count: 3 }])
    expect(geo.xy).toBeInstanceOf(Float32Array)
    expect(Array.from(geo.xy)).toEqual([0, 0, 1, 1, 2, 2])
    expect(geo.startsWithValidPoint).toBe(true)
    expect(geo.endsWithValidPoint).toBe(true)
  })

  it('breaks the line at NaN coordinates into separate segments', () => {
    const geo = buildSatelliteSeriesGeometry(new Float32Array([0, 0, 1, 1, NaN, NaN, 2, 2, 3, 3]))
    // (0,0)(1,1) and (2,2)(3,3) are two disjoint runs; NaN vertices are dropped.
    expect(geo.segments).toEqual([
      { start: 0, count: 2 },
      { start: 2, count: 2 },
    ])
    expect(geo.xy.length).toBe(4 * 2)
  })

  it('ignores leading and trailing invalid points', () => {
    const geo = buildSatelliteSeriesGeometry(new Float32Array([NaN, NaN, 0, 0, 1, 1, NaN, NaN]))
    expect(geo.segments).toEqual([{ start: 0, count: 2 }])
    expect(geo.startsWithValidPoint).toBe(false)
    expect(geo.endsWithValidPoint).toBe(false)
  })

  it('accepts an array of points (with nulls as gaps)', () => {
    const geo = buildSatelliteSeriesGeometry([[0, 0], [1, 1], null, [2, 2]])
    expect(geo.segments).toEqual([
      { start: 0, count: 2 },
      { start: 2, count: 1 },
    ])
  })

  it('honors explicit segment ranges (e.g. LOD output)', () => {
    const geo = buildSatelliteSeriesGeometry(
      new Float32Array(12).map((_, i) => i),
      [0, 3, 3, 3],
    )
    expect(geo.segments).toEqual([
      { start: 0, count: 3 },
      { start: 3, count: 3 },
    ])
  })

  it('returns no segments for empty input', () => {
    const geo = buildSatelliteSeriesGeometry(new Float32Array([]))
    expect(geo.segments).toEqual([])
  })
})

/* --------------------------- WebGL renderer --------------------------- */

describe('WebGLSatelliteTimeSeriesRenderer', () => {
  it('returns false when WebGL is unavailable', () => {
    const canvas = document.createElement('canvas')
    canvas.getContext = vi.fn(() => null) as unknown as HTMLCanvasElement['getContext']
    const renderer = new WebGLSatelliteTimeSeriesRenderer()
    expect(renderer.init(canvas)).toBe(false)
  })

  it('initializes with WebGL2 and reports its kind', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new WebGLSatelliteTimeSeriesRenderer()
    expect(renderer.init(canvas)).toBe(true)
    expect(renderer.kind).toBe('webgl2')
  })

  it('falls back to WebGL1 when only webgl is available', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL1(gl)
    const renderer = new WebGLSatelliteTimeSeriesRenderer()
    expect(renderer.init(canvas)).toBe(true)
    expect(renderer.kind).toBe('webgl1')
  })

  it('does NOT draw on data mutation (caller-driven render)', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new WebGLSatelliteTimeSeriesRenderer()
    renderer.init(canvas)
    renderer.onResize(300, 150)
    renderer.addSeries('s1', [1, 0, 0, 0.8])

    gl.drawArrays.mockClear()
    renderer.setSeriesData('s1', new Float32Array([0, 0, 1, 1, 2, 2]))
    renderer.appendSeriesData('s1', new Float32Array([3, 3, 4, 4]))
    renderer.setViewport(0, 5, 0, 5)

    expect(gl.drawArrays).not.toHaveBeenCalled()
  })

  it('draws exactly once after a batch of mutations (single render)', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new WebGLSatelliteTimeSeriesRenderer()
    renderer.init(canvas)
    renderer.onResize(300, 150)
    renderer.addSeries('s1', [1, 0, 0, 0.8])
    renderer.addSeries('s2', [0, 1, 0, 0.8])

    renderer.setSeriesData('s1', new Float32Array([0, 0, 1, 1, 2, 2]))
    renderer.setSeriesData('s2', new Float32Array([0, 0.5, 1, 0.5, 2, 0.5]))
    renderer.setViewport(0, 3, 0, 3)

    gl.drawArrays.mockClear()
    renderer.render()

    // one LINE_STRIP per series (each a single segment) => 2 draw calls
    expect(gl.drawArrays).toHaveBeenCalledTimes(2)
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.LINE_STRIP, 0, 3)
  })

  it('uses bufferSubData for within-capacity data replacement (no extra bufferData)', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new WebGLSatelliteTimeSeriesRenderer()
    renderer.init(canvas)
    renderer.addSeries('s1')

    // first set allocates capacity -> one bufferData (for the allocation)
    renderer.setSeriesData('s1', new Float32Array(Array(20).fill(0)))
    expect(gl.bufferData).toHaveBeenCalled()
    expect(gl.bufferSubData).toHaveBeenCalled()

    gl.bufferData.mockClear()
    gl.bufferSubData.mockClear()

    // second set within capacity: only bufferSubData, no new bufferData
    renderer.setSeriesData('s1', new Float32Array(Array(20).fill(1)))
    expect(gl.bufferSubData).toHaveBeenCalled()
    expect(gl.bufferData).not.toHaveBeenCalled()
  })

  it('doubles GPU capacity and re-allocates when data exceeds current capacity', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new WebGLSatelliteTimeSeriesRenderer()
    renderer.init(canvas)
    renderer.addSeries('s1')

    const bigVertexCount = 2000 // > INITIAL_CAPACITY (1024)
    const data = new Float32Array(bigVertexCount * 2)
    for (let i = 0; i < bigVertexCount; i++) data[i * 2] = i
    renderer.setSeriesData('s1', data)

    // capacity must have doubled to >= 2000 and the buffer re-allocated with enough bytes
    const alloc = gl.bufferData.mock.calls.find(
      (c) => typeof c[1] === 'number' && c[1] >= bigVertexCount * 2 * 4,
    )
    expect(alloc).toBeTruthy()

    // subsequent append within capacity uses bufferSubData, not bufferData
    gl.bufferData.mockClear()
    renderer.appendSeriesData('s1', new Float32Array([2000, 2000]))
    expect(gl.bufferSubData).toHaveBeenCalled()
    expect(gl.bufferData).not.toHaveBeenCalled()
  })

  it('breaks line segments across NaN (multiple LINE_STRIP draws)', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new WebGLSatelliteTimeSeriesRenderer()
    renderer.init(canvas)
    renderer.onResize(300, 150)
    renderer.addSeries('s1', [1, 0, 0, 0.8])
    // 2 valid verts, NaN, 2 valid verts => 2 segments
    renderer.setSeriesData('s1', new Float32Array([0, 0, 1, 1, NaN, NaN, 2, 2, 3, 3]))
    renderer.setViewport(0, 5, 0, 5)

    gl.drawArrays.mockClear()
    renderer.render()

    expect(gl.drawArrays).toHaveBeenCalledTimes(2)
    expect(gl.drawArrays).toHaveBeenNthCalledWith(1, gl.LINE_STRIP, 0, 2)
    expect(gl.drawArrays).toHaveBeenNthCalledWith(2, gl.LINE_STRIP, 2, 2)
  })

  it('injects the fixed per-series color as a uniform', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new WebGLSatelliteTimeSeriesRenderer()
    renderer.init(canvas)
    renderer.onResize(300, 150)
    renderer.addSeries('s1', [0.2, 0.4, 0.6, 0.9])
    renderer.setSeriesData('s1', new Float32Array([0, 0, 1, 1]))
    renderer.setViewport(0, 2, 0, 2)

    gl.uniform4fv.mockClear()
    renderer.render()

    expect(gl.uniform4fv).toHaveBeenCalledWith(
      gl.getUniformLocation('x', 'u_color'),
      [0.2, 0.4, 0.6, 0.9],
    )
  })

  it('skips hidden and cleared series on render', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new WebGLSatelliteTimeSeriesRenderer()
    renderer.init(canvas)
    renderer.onResize(300, 150)
    renderer.addSeries('s1', [1, 0, 0, 0.8])
    renderer.addSeries('s2', [0, 1, 0, 0.8])
    renderer.setSeriesData('s1', new Float32Array([0, 0, 1, 1]))
    renderer.setSeriesData('s2', new Float32Array([0, 0, 1, 1]))

    renderer.setSeriesVisible('s1', false)
    renderer.setViewport(0, 2, 0, 2)
    gl.drawArrays.mockClear()
    renderer.render()
    expect(gl.drawArrays).toHaveBeenCalledTimes(1) // only s2

    renderer.clear()
    gl.drawArrays.mockClear()
    renderer.render()
    expect(gl.drawArrays).not.toHaveBeenCalled()
  })

  it('re-adding a series replaces rather than duplicates it', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new WebGLSatelliteTimeSeriesRenderer()
    renderer.init(canvas)
    renderer.addSeries('s1', [1, 0, 0, 1])
    renderer.addSeries('s1', [0, 1, 0, 1])
    renderer.setSeriesData('s1', new Float32Array([0, 0, 1, 1]))
    renderer.setViewport(0, 2, 0, 2)
    gl.drawArrays.mockClear()
    renderer.render()
    // only one series drawn
    expect(gl.drawArrays).toHaveBeenCalledTimes(1)
  })

  it('dispose releases GL buffers', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new WebGLSatelliteTimeSeriesRenderer()
    renderer.init(canvas)
    renderer.addSeries('s1', [1, 0, 0, 1])
    renderer.dispose()
    expect(gl.deleteBuffer).toHaveBeenCalled()
  })
})

/* --------------------------- Canvas 2D renderer --------------------------- */

describe('CanvasSatelliteTimeSeriesRenderer', () => {
  let ctx: ReturnType<typeof createMockCanvas2DContext>
  let canvas: HTMLCanvasElement
  let renderer: CanvasSatelliteTimeSeriesRenderer

  beforeEach(() => {
    ctx = createMockCanvas2DContext()
    canvas = createMockCanvas2D(ctx)
    renderer = new CanvasSatelliteTimeSeriesRenderer()
    renderer.init(canvas)
    renderer.onResize(300, 150)
    ctx.clearRect.mockClear()
    ctx.beginPath.mockClear()
    ctx.moveTo.mockClear()
    ctx.lineTo.mockClear()
    ctx.stroke.mockClear()
  })

  it('init always returns true using the 2d context and reports kind', () => {
    expect(renderer.init(canvas)).toBe(true)
    expect(renderer.kind).toBe('canvas')
  })

  it('draws polylines and breaks at NaN (one moveTo per segment)', () => {
    renderer.addSeries('s1', [1, 0, 0, 0.8])
    // 2 verts, NaN, 2 verts => 2 segments => 2 moveTo, 2 lineTo
    renderer.setSeriesData('s1', new Float32Array([0, 0, 1, 1, NaN, NaN, 2, 2, 3, 3]))
    renderer.setViewport(0, 5, 0, 5)

    renderer.render()

    expect(ctx.clearRect).toHaveBeenCalled()
    expect(ctx.moveTo).toHaveBeenCalledTimes(2)
    expect(ctx.lineTo).toHaveBeenCalledTimes(2)
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('does not draw on mutation; only render draws', () => {
    renderer.addSeries('s1')
    ctx.moveTo.mockClear()
    renderer.setSeriesData('s1', new Float32Array([0, 0, 1, 1]))
    expect(ctx.moveTo).not.toHaveBeenCalled()
    renderer.render()
    expect(ctx.moveTo).toHaveBeenCalled()
  })

  it('honors setSeriesColor', () => {
    renderer.addSeries('s1', [1, 0, 0, 1])
    renderer.setSeriesColor('s1', [0, 0.5, 1, 1])
    renderer.setSeriesData('s1', new Float32Array([0, 0, 1, 1]))
    renderer.setViewport(0, 2, 0, 2)
    renderer.render()
    expect(ctx.strokeStyle).toContain('128') // 0.5*255 ~ 128
  })
})

/* --------------------------- factory --------------------------- */

describe('createSatelliteTimeSeriesRenderer factory', () => {
  it('returns a WebGL renderer when WebGL2 context is available', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = createSatelliteTimeSeriesRenderer(canvas)
    expect(renderer).toBeInstanceOf(WebGLSatelliteTimeSeriesRenderer)
    expect(renderer.kind).toBe('webgl2')
  })

  it('returns a Canvas renderer when no WebGL context is available', () => {
    const ctx = createMockCanvas2DContext()
    const canvas = document.createElement('canvas')
    canvas.getContext = vi.fn((type: string) => {
      if (type === 'webgl2' || type === 'webgl') return null
      if (type === '2d') return ctx
      return null
    }) as unknown as HTMLCanvasElement['getContext']

    const renderer = createSatelliteTimeSeriesRenderer(canvas)
    expect(renderer).toBeInstanceOf(CanvasSatelliteTimeSeriesRenderer)
    expect(renderer.kind).toBe('canvas')
  })
})
