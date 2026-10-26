export interface CameraPackagePair {
  hostPath: string
  lidarPath: string
}

const HOST_PACKAGE = /^e-wagon-\d+\.\d+\.\d+-aarch64-\d{8}_\d{4}\.tar\.gz$/
const LIDAR_PACKAGE = /^e-wagon-lidar-\d+\.\d+\.\d+-aarch64-\d{8}_\d{4}\.tar\.gz$/

function fileName(localPath: string): string {
  return localPath.split(/[\\/]/).pop() ?? ''
}

export function matchCameraPackagePair(
  localPaths: readonly string[],
): CameraPackagePair | undefined {
  if (localPaths.length !== 2) return undefined
  let hostPath = ''
  let lidarPath = ''
  for (const localPath of localPaths) {
    const name = fileName(localPath)
    if (HOST_PACKAGE.test(name)) hostPath = localPath
    else if (LIDAR_PACKAGE.test(name)) lidarPath = localPath
    else return undefined
  }
  return hostPath && lidarPath ? { hostPath, lidarPath } : undefined
}
