// 三维场景渲染器：three.js 封装。
// 上层只喂 SceneFrameData（平铺 xy 数组）与 SceneRenderOptions；
// 坐标约定：ROS 平面 x/y 直接映射到 three.js x/y（俯视时 x 右 y 上），z=0 平面。
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { SceneFrameData } from '@/core/lidar/types'

export type SceneColorMode = 'flat' | 'intensity' | 'range'

export interface SceneRenderOptions {
  theme: 'dark' | 'light'
  showGrid: boolean
  showRaw: boolean
  showFiltered: boolean
  showObstacles: boolean
  showCandidates: boolean
  showBest: boolean
  showFootprint: boolean
  showMargin: boolean
  showGoal: boolean
  showTrail: boolean
  showRobot: boolean
  pointSize: number
  colorMode: SceneColorMode
  followRobot: boolean
}

export interface SceneViewState {
  position: [number, number, number]
  target: [number, number, number]
  distance: number
}

interface ThemeColors {
  background: number
  gridCenter: number
  grid: number
}

const THEMES: Record<'dark' | 'light', ThemeColors> = {
  dark: { background: 0x0f1419, gridCenter: 0x2c3a47, grid: 0x1d2733 },
  light: { background: 0xf3f5f7, gridCenter: 0xc4ccd4, grid: 0xdde3e9 },
}

const COLORS = {
  raw: 0x22d3ee,
  filtered: 0xa3e635,
  obstacles: 0xef4444,
  candidates: 0x7c8da3,
  best: 0x22c55e,
  footprint: 0xe5eaf0,
  margin: 0x8b98a8,
  trail: 0xf59e0b,
  goal: 0xf43f5e,
  heading: 0xfacc15,
}

const MAX_TRAIL_POINTS = 4096

export class LidarSceneRenderer {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private grid: THREE.GridHelper
  private rawPoints: THREE.Points
  private filteredPoints: THREE.Points
  private obstaclePoints: THREE.Points
  private candidateLines: THREE.LineSegments
  private bestLine: THREE.Line
  private footprintLoop: THREE.LineLoop
  private marginLoop: THREE.LineLoop
  private trailLine: THREE.Line
  private goalArrow: THREE.ArrowHelper
  private headingArrow: THREE.ArrowHelper
  private lastRobotPosition = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN)
  private viewInitialized = false
  private disposed = false

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.canvas.focus({ preventScroll: true })
    this.controls.screenSpacePanning = event.altKey
  }

  private readonly handlePointerEnd = (): void => {
    this.controls.screenSpacePanning = false
  }

  private readonly handleInteractionStart = (): void => this.onInteractionChange?.(true)
  private readonly handleInteractionEnd = (): void => this.onInteractionChange?.(false)

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onInteractionChange?: (active: boolean) => void,
  ) {
    // preserveDrawingBuffer：渲染完成后仍可 readPixels/toDataURL（截图导出、自动化验证）
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 2000)
    this.camera.up.set(0, 0, 1)
    this.camera.position.set(0, -6, 9)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.12
    this.controls.panSpeed = 0.9
    this.controls.rotateSpeed = 0.65
    this.controls.zoomSpeed = 1.15
    this.controls.zoomToCursor = true
    this.controls.minDistance = 0.35
    this.controls.maxDistance = 600
    this.controls.minPolarAngle = 0.02
    this.controls.maxPolarAngle = Math.PI / 2 - 0.01
    this.controls.screenSpacePanning = false
    this.controls.cursorStyle = 'grab'
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    }
    this.controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    }
    this.controls.keys = {
      LEFT: 'KeyA',
      UP: 'KeyW',
      RIGHT: 'KeyD',
      BOTTOM: 'KeyS',
    }
    this.controls.listenToKeyEvents(canvas)
    this.controls.addEventListener('start', this.handleInteractionStart)
    this.controls.addEventListener('end', this.handleInteractionEnd)
    canvas.addEventListener('pointerdown', this.handlePointerDown, true)
    canvas.addEventListener('pointerup', this.handlePointerEnd, true)
    canvas.addEventListener('pointercancel', this.handlePointerEnd, true)

    this.grid = new THREE.GridHelper(40, 40, 0x2c3a47, 0x1d2733)
    this.grid.rotation.x = Math.PI / 2
    this.scene.add(this.grid)

    this.rawPoints = this.makePoints(COLORS.raw)
    this.filteredPoints = this.makePoints(COLORS.filtered)
    this.obstaclePoints = this.makePoints(COLORS.obstacles)

    this.candidateLines = this.makeLineSegments(COLORS.candidates)
    this.bestLine = this.makeLine(COLORS.best)
    this.footprintLoop = this.makeLoop(COLORS.footprint, false)
    this.marginLoop = this.makeLoop(COLORS.margin, true)
    this.trailLine = this.makeLine(COLORS.trail)

    this.goalArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(),
      0.6,
      COLORS.goal,
      0.25,
      0.14,
    )
    this.scene.add(this.goalArrow)
    this.headingArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(),
      0.5,
      COLORS.heading,
      0.2,
      0.12,
    )
    this.scene.add(this.headingArrow)
  }

  // ——— 资源构造 ———

  private makePoints(color: number): THREE.Points {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
    const material = new THREE.PointsMaterial({
      color,
      size: 3,
      sizeAttenuation: false,
      vertexColors: false,
    })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    points.visible = false
    this.scene.add(points)
    return points
  }

  private makeLine(color: number): THREE.Line {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }))
    line.frustumCulled = false
    line.visible = false
    this.scene.add(line)
    return line
  }

  private makeLineSegments(color: number): THREE.LineSegments {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
    const line = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }),
    )
    line.frustumCulled = false
    line.visible = false
    this.scene.add(line)
    return line
  }

  private makeLoop(color: number, dashed: boolean): THREE.LineLoop {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
    const material = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 0.12, gapSize: 0.08 })
      : new THREE.LineBasicMaterial({ color })
    const loop = new THREE.LineLoop(geometry, material)
    loop.frustumCulled = false
    loop.visible = false
    this.scene.add(loop)
    return loop
  }

  // ——— 帧更新 ———

  public update(frame: SceneFrameData, options: SceneRenderOptions): void {
    if (this.disposed) return
    const colors = THEMES[options.theme]
    this.renderer.setClearColor(colors.background, 1)
    // GridHelper 材质是顶点色模式：只换顶点色，材质色保持白，避免相乘变暗
    const gridGeometry = (this.grid as unknown as { geometry: THREE.BufferGeometry }).geometry
    gridGeometry.setAttribute('color', new THREE.BufferAttribute(this.buildGridColors(colors), 3))

    const robot = frame.robot
    const worldX = robot.hasOdom ? (robot.odomX ?? 0) : 0
    const worldY = robot.hasOdom ? (robot.odomY ?? 0) : 0
    const worldYaw = robot.hasOdom ? (robot.odomYaw ?? 0) : 0

    // 点云层
    const wantRawColors = options.colorMode !== 'flat' && frame.scanRawXY !== undefined
    this.updatePoints(
      this.rawPoints,
      frame.scanRawXY,
      options.showRaw,
      options.pointSize,
      wantRawColors,
    )
    if (wantRawColors) {
      this.applyScanColors(this.rawPoints, frame, options)
    } else {
      ;(this.rawPoints.material as THREE.PointsMaterial).vertexColors = false
      ;(this.rawPoints.material as THREE.PointsMaterial).color.setHex(COLORS.raw)
    }
    this.updatePoints(
      this.filteredPoints,
      frame.scanFilteredXY,
      options.showFiltered,
      options.pointSize,
      false,
    )
    this.updatePoints(
      this.obstaclePoints,
      frame.obstaclesXY,
      options.showObstacles,
      options.pointSize + 2,
      false,
    )

    // 候选轨迹（多条合并为一个 LineSegments）
    if (options.showCandidates && frame.candidatePathsXY.length > 0) {
      const arrays = frame.candidatePathsXY.map((path) => toSegmentPairs(path))
      const merged = concatFloat32(arrays)
      this.setPositions(this.candidateLines.geometry, merged)
      this.candidateLines.visible = merged.length > 0
    } else {
      this.candidateLines.visible = false
    }

    if (options.showBest && frame.bestPathXY && frame.bestPathXY.length >= 4) {
      this.setPositions(this.bestLine.geometry, toThreeXYZ(frame.bestPathXY))
      this.bestLine.visible = true
    } else {
      this.bestLine.visible = false
    }

    if (options.showFootprint && frame.footprintXY && frame.footprintXY.length >= 6) {
      this.setPositions(this.footprintLoop.geometry, toThreeXYZ(frame.footprintXY))
      this.footprintLoop.computeLineDistances()
      this.footprintLoop.visible = true
    } else {
      this.footprintLoop.visible = false
    }
    if (options.showMargin && frame.footprintMarginXY && frame.footprintMarginXY.length >= 6) {
      this.setPositions(this.marginLoop.geometry, toThreeXYZ(frame.footprintMarginXY))
      this.marginLoop.computeLineDistances()
      this.marginLoop.visible = true
    } else {
      this.marginLoop.visible = false
    }

    if (options.showTrail && frame.odomTrailXY && frame.odomTrailXY.length >= 4) {
      const xyz = toThreeXYZ(frame.odomTrailXY)
      this.setPositions(this.trailLine.geometry, xyz)
      this.trailLine.visible = true
    } else {
      this.trailLine.visible = false
    }

    if (options.showGoal && frame.goalXY) {
      this.goalArrow.position.set(frame.goalXY.x, frame.goalXY.y, 0)
      this.goalArrow.visible = true
    } else {
      this.goalArrow.visible = false
    }

    if (options.showRobot) {
      this.headingArrow.position.set(worldX, worldY, 0)
      this.headingArrow.setDirection(new THREE.Vector3(Math.cos(worldYaw), Math.sin(worldYaw), 0))
      this.headingArrow.visible = true
    } else {
      this.headingArrow.visible = false
    }

    this.grid.visible = options.showGrid

    // 跟随时只叠加车体位移，保留用户平移后的观察偏移，避免每个数据帧把镜头吸回车体。
    if (options.followRobot) {
      const robotPosition = new THREE.Vector3(worldX, worldY, 0)
      if (Number.isFinite(this.lastRobotPosition.x)) {
        const delta = robotPosition.clone().sub(this.lastRobotPosition)
        this.camera.position.add(delta)
        this.controls.target.add(delta)
      }
      this.lastRobotPosition.copy(robotPosition)
    } else {
      this.lastRobotPosition.set(Number.NaN, Number.NaN, Number.NaN)
    }

    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  /** 首帧或手动触发：把视野适配到数据范围。 */
  public fitView(frame: SceneFrameData | undefined): void {
    // 丢弃上一段阻尼惯性，确保“适配视野/1”立即停在确定位置。
    const damping = this.controls.enableDamping
    this.controls.enableDamping = false
    this.controls.update()
    let minX = -5
    let minY = -5
    let maxX = 5
    let maxY = 5
    const absorb = (xy: Float32Array | undefined): void => {
      if (!xy) return
      for (let i = 0; i + 1 < xy.length; i += 2) {
        if (!Number.isFinite(xy[i]) || !Number.isFinite(xy[i + 1])) continue
        minX = Math.min(minX, xy[i])
        maxX = Math.max(maxX, xy[i])
        minY = Math.min(minY, xy[i + 1])
        maxY = Math.max(maxY, xy[i + 1])
      }
    }
    if (frame) {
      absorb(frame.scanRawXY)
      absorb(frame.scanFilteredXY)
      absorb(frame.obstaclesXY)
      absorb(frame.odomTrailXY)
      absorb(frame.bestPathXY)
      for (const path of frame.candidatePathsXY) absorb(path)
      absorb(frame.footprintXY)
      absorb(frame.footprintMarginXY)
      if (frame.goalXY) absorb(Float32Array.of(frame.goalXY.x, frame.goalXY.y))
    }
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const span = Math.max(6, Math.max(maxX - minX, maxY - minY) * 1.4)
    this.camera.position.set(cx, cy - span * 0.7, span * 0.9)
    this.controls.target.set(cx, cy, 0)
    if (frame?.robot.hasOdom) {
      this.lastRobotPosition.set(frame.robot.odomX ?? 0, frame.robot.odomY ?? 0, 0)
    } else {
      this.lastRobotPosition.set(Number.NaN, Number.NaN, Number.NaN)
    }
    this.controls.update()
    this.controls.enableDamping = damping
    this.viewInitialized = true
  }

  public get isViewInitialized(): boolean {
    return this.viewInitialized
  }

  public resize(width: number, height: number): void {
    if (this.disposed || width <= 0 || height <= 0) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  public dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown, true)
    this.canvas.removeEventListener('pointerup', this.handlePointerEnd, true)
    this.canvas.removeEventListener('pointercancel', this.handlePointerEnd, true)
    this.controls.removeEventListener('start', this.handleInteractionStart)
    this.controls.removeEventListener('end', this.handleInteractionEnd)
    this.controls.dispose()
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      mesh.geometry?.dispose?.()
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
      else material?.dispose?.()
    })
    this.renderer.dispose()
  }

  public renderOnce(): void {
    if (this.disposed) return
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  public getViewState(): SceneViewState {
    return {
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [this.controls.target.x, this.controls.target.y, this.controls.target.z],
      distance: this.camera.position.distanceTo(this.controls.target),
    }
  }

  // ——— 内部工具 ———

  private updatePoints(
    points: THREE.Points,
    xy: Float32Array | undefined,
    visible: boolean,
    pointSize: number,
    useVertexColors: boolean,
  ): void {
    if (!visible || !xy || xy.length < 2) {
      points.visible = false
      return
    }
    const count = Math.floor(xy.length / 2)
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = xy[i * 2]
      positions[i * 3 + 1] = xy[i * 2 + 1]
      positions[i * 3 + 2] = 0
    }
    const geometry = points.geometry
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setDrawRange(0, count)
    const material = points.material as THREE.PointsMaterial
    material.size = pointSize
    material.vertexColors = useVertexColors
    points.visible = true
  }

  /** 强度/距离着色：低值青蓝 → 高值红黄（HSL 色相 0.66 → 0.0）。 */
  private applyScanColors(
    points: THREE.Points,
    frame: SceneFrameData,
    options: SceneRenderOptions,
  ): void {
    const xy = frame.scanRawXY
    if (!xy) return
    const count = Math.floor(xy.length / 2)
    const colors = new Float32Array(count * 3)
    const values =
      options.colorMode === 'intensity' && frame.scanRawIntensity
        ? frame.scanRawIntensity
        : undefined
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    if (values) {
      for (let i = 0; i < count && i < values.length; i++) {
        const value = values[i]
        if (Number.isFinite(value)) {
          min = Math.min(min, value)
          max = Math.max(max, value)
        }
      }
      if (!Number.isFinite(min) || max <= min) {
        min = 0
        max = 1
      }
    }
    const rangeMax = 12
    const color = new THREE.Color()
    for (let i = 0; i < count; i++) {
      let t: number
      if (values && i < values.length) {
        t = (values[i] - min) / (max - min || 1)
      } else {
        const dx = xy[i * 2]
        const dy = xy[i * 2 + 1]
        t = Math.min(1, Math.hypot(dx, dy) / rangeMax)
      }
      color.setHSL(0.66 * (1 - t), 0.85, 0.55)
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
    points.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  }

  private buildGridColors(colors: ThemeColors): Float32Array {
    // GridHelper 的顶点色：中心十字用 gridCenter，其余用 grid
    const count = 40 * 4 + 4 // 与 (40,40) 参数对应
    const array = new Float32Array(count * 3)
    const center = new THREE.Color(colors.gridCenter)
    const normal = new THREE.Color(colors.grid)
    for (let i = 0; i < count; i++) {
      const c = i < 4 ? center : normal
      array[i * 3] = c.r
      array[i * 3 + 1] = c.g
      array[i * 3 + 2] = c.b
    }
    return array
  }

  private setPositions(geometry: THREE.BufferGeometry, xyz: Float32Array): void {
    geometry.setAttribute('position', new THREE.BufferAttribute(xyz, 3))
    geometry.setDrawRange(0, xyz.length / 3)
  }
}

/** 平铺 xy → three.js 顶点（z=0）。 */
function toThreeXYZ(xy: Float32Array): Float32Array {
  const count = Math.floor(xy.length / 2)
  const out = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    out[i * 3] = xy[i * 2]
    out[i * 3 + 1] = xy[i * 2 + 1]
    out[i * 3 + 2] = 0
  }
  return out
}

/** 折线 → 线段对顶点（p0,p1,p1,p2…）。 */
function toSegmentPairs(xy: Float32Array): Float32Array {
  const count = Math.floor(xy.length / 2)
  if (count < 2) return new Float32Array(0)
  const out = new Float32Array((count - 1) * 6)
  for (let i = 0; i < count - 1; i++) {
    out[i * 6] = xy[i * 2]
    out[i * 6 + 1] = xy[i * 2 + 1]
    out[i * 6 + 2] = 0
    out[i * 6 + 3] = xy[i * 2 + 2]
    out[i * 6 + 4] = xy[i * 2 + 3]
    out[i * 6 + 5] = 0
  }
  return out
}

function concatFloat32(arrays: Float32Array[]): Float32Array {
  let total = 0
  for (const array of arrays) total += array.length
  const out = new Float32Array(total)
  let offset = 0
  for (const array of arrays) {
    out.set(array, offset)
    offset += array.length
  }
  return out
}
