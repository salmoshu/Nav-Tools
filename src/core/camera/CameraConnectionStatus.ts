export interface CameraConnectionTarget {
  host: string
  port: number
}

export interface SharedDataConnection {
  type?: string
  protocol?: string
  host?: string
  port?: number
  connected: null | boolean
}

export function isCameraTcpDataConnected(
  connection: SharedDataConnection,
  target: CameraConnectionTarget,
): boolean {
  return (
    connection.connected === true &&
    connection.type === 'network' &&
    connection.protocol === 'tcp' &&
    connection.host?.trim() === target.host.trim() &&
    connection.port === target.port
  )
}
