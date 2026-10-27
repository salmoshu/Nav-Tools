export interface CameraPackagePair {
  hostPath: string
  lidarPath: string
}

/** 版本段允许预发布后缀（如 0.5.4-preview）；Windows 重复下载的 " (1)" 尾缀也容忍 */
const VERSION = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?`
const HOST_PACKAGE = new RegExp(
  String.raw`^e-wagon-${VERSION}-aarch64-\d{8}_\d{4}(?: \(\d+\))?\.tar\.gz$`,
)
const LIDAR_PACKAGE = new RegExp(
  String.raw`^e-wagon-lidar-${VERSION}-aarch64-\d{8}_\d{4}(?: \(\d+\))?\.tar\.gz$`,
)

function fileName(localPath: string): string {
  return localPath.split(/[\\/]/).pop() ?? ''
}

export interface CameraPackageAnalysis {
  hostPath?: string
  lidarPath?: string
  /** 选中里未识别为部署包的文件（部署时忽略并在输出里说明） */
  others: string[]
}

/** 从任意选择里识别 host/lidar 部署包：不再要求恰好两个文件，多余文件进 others */
export function analyzeCameraPackages(localPaths: readonly string[]): CameraPackageAnalysis {
  const analysis: CameraPackageAnalysis = { others: [] }
  for (const localPath of localPaths) {
    const name = fileName(localPath)
    if (HOST_PACKAGE.test(name)) analysis.hostPath ??= localPath
    else if (LIDAR_PACKAGE.test(name)) analysis.lidarPath ??= localPath
    else analysis.others.push(localPath)
  }
  return analysis
}

/** 选择里凑齐 host + lidar 即触发隐藏部署（其余文件由调用方决定忽略或报错） */
export function matchCameraPackagePair(
  localPaths: readonly string[],
): CameraPackagePair | undefined {
  const { hostPath, lidarPath } = analyzeCameraPackages(localPaths)
  return hostPath && lidarPath ? { hostPath, lidarPath } : undefined
}
