import { describe, expect, it } from 'vitest'
import {
  analyzeCameraPackages,
  matchCameraPackagePair,
} from '../../src/core/camera/CameraPackageSelection'

const HOST = '/tmp/e-wagon-0.5.3-aarch64-20261026_0845.tar.gz'
const LIDAR = '/tmp/e-wagon-lidar-1.3.2-aarch64-20261026_0846.tar.gz'
const HOST_PREVIEW = 'C:\\fw\\e-wagon-0.5.4-preview-aarch64-20261026_2248.tar.gz'
const LIDAR_PREVIEW = 'C:\\fw\\e-wagon-lidar-1.3.2-aarch64-20261026_2249.tar.gz'
const MCU = '/tmp/e-wagon-mcu-1.3.2-20261026.tar.gz'

describe('matchCameraPackagePair', () => {
  it('识别标准成对包,顺序无关', () => {
    expect(matchCameraPackagePair([HOST, LIDAR])).toEqual({ hostPath: HOST, lidarPath: LIDAR })
    expect(matchCameraPackagePair([LIDAR, HOST])).toEqual({ hostPath: HOST, lidarPath: LIDAR })
  })

  it('兼容预发布版本号与 Windows 重复下载尾缀', () => {
    expect(matchCameraPackagePair([HOST_PREVIEW, LIDAR_PREVIEW])).toEqual({
      hostPath: HOST_PREVIEW,
      lidarPath: LIDAR_PREVIEW,
    })
    expect(
      matchCameraPackagePair([
        '/tmp/e-wagon-0.5.3-aarch64-20261026_0845 (1).tar.gz',
        '/tmp/e-wagon-lidar-1.3.2-aarch64-20261026_0846.tar.gz',
      ]),
    ).toBeDefined()
  })

  it('选择里混有其他文件时仍凑对部署,多余文件进 others', () => {
    const script = '/tmp/probe.sh'
    expect(matchCameraPackagePair([HOST, MCU, LIDAR, script])).toEqual({
      hostPath: HOST,
      lidarPath: LIDAR,
    })
    expect(analyzeCameraPackages([HOST, MCU, LIDAR, script])).toEqual({
      hostPath: HOST,
      lidarPath: LIDAR,
      others: [MCU, script],
    })
  })

  it('缺任一包时不触发部署;mcu 包不被误认为 host 包', () => {
    expect(matchCameraPackagePair([HOST])).toBeUndefined()
    expect(matchCameraPackagePair([LIDAR])).toBeUndefined()
    expect(matchCameraPackagePair(['/tmp/probe.sh'])).toBeUndefined()
    expect(analyzeCameraPackages([MCU]).hostPath).toBeUndefined()
    expect(analyzeCameraPackages([MCU]).others).toEqual([MCU])
  })
})
