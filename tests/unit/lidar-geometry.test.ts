// 几何提取函数的单元测试。
import { describe, expect, it } from 'vitest'
import {
  laserScanToXY,
  odometryToPose,
  pathToXY,
  pointCloud2ToXYZ,
  polygonToXY,
  quaternionToYaw,
  transformXY,
} from '../../src/core/lidar/LidarGeometry'
import { makeLaserScan, makePath, makePointCloud2, makePolygon } from './helpers/lidarTestBag'

describe('laserScanToXY', () => {
  it('极坐标转笛卡尔并剔除无效点', () => {
    // 两个有效点（正前、正左），一个超量程、一个 NaN
    const scan = makeLaserScan('laser', 0, 0, [2, NaN, 3, 999], -Math.PI / 2, Math.PI / 2)
    // 角度：-90°, 0°, 90°, 180°（4 点，增量 90°）
    const { xy, intensity } = laserScanToXY(scan)
    // 有效点：-90°(0,-2)、90°(0,3)；999 超出 range_max=12 被剔除
    expect(xy.length).toBe(4)
    expect(xy[0]).toBeCloseTo(0)
    expect(xy[1]).toBeCloseTo(-2)
    expect(xy[2]).toBeCloseTo(0)
    expect(xy[3]).toBeCloseTo(3)
    expect(intensity).toBeUndefined()
  })

  it('输出强度数组与有效点一一对应', () => {
    const scan = makeLaserScan('laser', 0, 0, [1, 2, 3], -Math.PI / 2, Math.PI / 2, [10, 0.5, 30])
    const { intensity } = laserScanToXY(scan)
    expect(intensity).toBeDefined()
    expect([...intensity!]).toEqual([10, 0.5, 30])
  })
})

describe('pointCloud2ToXYZ', () => {
  it('按 point_step 提取 float32 坐标', () => {
    const cloud = makePointCloud2('base_link', 0, 0, [
      [1.5, -2.25, 0.125],
      [0, 0, 0],
    ])
    const xyz = pointCloud2ToXYZ(cloud)
    expect(xyz.length).toBe(6)
    expect(xyz[0]).toBeCloseTo(1.5)
    expect(xyz[1]).toBeCloseTo(-2.25)
    expect(xyz[2]).toBeCloseTo(0.125)
  })
})

describe('polygon/path', () => {
  it('polygon 提取为平铺 xy（float32 语义）', () => {
    const polygon = makePolygon('base_link', 0, 0, [
      [0.8, 0.24],
      [-0.08, -0.24],
    ])
    const xy = polygonToXY(polygon)
    expect(xy.length).toBe(4)
    expect(xy[0]).toBeCloseTo(0.8, 5)
    expect(xy[1]).toBeCloseTo(0.24, 5)
    expect(xy[2]).toBeCloseTo(-0.08, 5)
    expect(xy[3]).toBeCloseTo(-0.24, 5)
  })

  it('path 提取为平铺 xy', () => {
    const path = makePath('base_link', 0, 0, [
      [0, 0],
      [0.5, 0.5],
      [1, 0],
    ])
    const xy = pathToXY(path)
    expect(xy.length).toBe(6)
    expect(xy[4]).toBeCloseTo(1)
  })
})

describe('四元数与变换', () => {
  it('quaternionToYaw', () => {
    const yaw = Math.PI / 2
    const q = { x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) }
    expect(quaternionToYaw(q)).toBeCloseTo(yaw)
  })

  it('transformXY 平移+旋转组合', () => {
    const xy = Float32Array.of(1, 0)
    // 绕原点转 90° 后 (0,1)，再平移 (10,20)
    const out = transformXY(xy, 10, 20, Math.PI / 2)
    expect(out[0]).toBeCloseTo(10)
    expect(out[1]).toBeCloseTo(21)
  })

  it('transformXY 零变换返回原数组', () => {
    const xy = Float32Array.of(1, 2)
    expect(transformXY(xy, 0, 0, 0)).toBe(xy)
  })
})

describe('odometryToPose', () => {
  it('提取位姿与速度', () => {
    const odom = {
      stamp: { stamp: { sec: 0, nanosec: 0 }, frame_id: 'odom_est' },
      child_frame_id: 'base_link',
      pose: {
        pose: {
          position: { x: 3, y: -4, z: 0 },
          orientation: { x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) },
        },
      },
      twist: { twist: { linear: { x: 0.35, y: 0, z: 0 }, angular: { x: 0, y: 0, z: -0.2 } } },
    }
    const pose = odometryToPose(odom)
    expect(pose.x).toBe(3)
    expect(pose.y).toBe(-4)
    expect(pose.yaw).toBeCloseTo(Math.PI / 2)
    expect(pose.v).toBe(0.35)
    expect(pose.w).toBe(-0.2)
  })
})
