import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import type { CameraPackagePair } from '../../../src/core/camera/CameraPackageSelection'

export interface CameraPackageDeploymentRequest {
  host: string
  port: number
  username: string
  password: string
}

export interface CameraPackageDeploymentHost {
  platform: typeof process.platform
  environment: typeof process.env
  spawn(file: string, args: string[], options: SpawnOptions): ChildProcess
}

const WSL_DISTRO = 'Ubuntu-20.04'
const DEPLOY_SCRIPT = `set -e
work_dir="$(mktemp -d /tmp/navtools-deploy.XXXXXX)"
cleanup() {
  rm -rf -- "$work_dir"
}
trap cleanup EXIT
cat > "$work_dir/askpass" <<'NAVTOOLS_ASKPASS'
#!/bin/sh
printf '%s\\n' "$NAVTOOLS_CAMERA_SSH_PASSWORD"
NAVTOOLS_ASKPASS
cat > "$work_dir/ssh" <<'NAVTOOLS_SSH'
#!/bin/sh
exec /usr/bin/ssh -p "$NAVTOOLS_CAMERA_SSH_PORT" "$@"
NAVTOOLS_SSH
cat > "$work_dir/scp" <<'NAVTOOLS_SCP'
#!/bin/sh
exec /usr/bin/scp -P "$NAVTOOLS_CAMERA_SSH_PORT" "$@"
NAVTOOLS_SCP
cat > "$work_dir/ssh-copy-id" <<'NAVTOOLS_SSH_COPY_ID'
#!/bin/sh
exec /usr/bin/ssh-copy-id -p "$NAVTOOLS_CAMERA_SSH_PORT" "$@"
NAVTOOLS_SSH_COPY_ID
chmod 700 "$work_dir/askpass" "$work_dir/ssh" "$work_dir/scp" "$work_dir/ssh-copy-id"
export PATH="$work_dir:$PATH"
export SSH_ASKPASS="$work_dir/askpass"
export SSH_ASKPASS_REQUIRE=force
host_package="$(wslpath -a -- "$2")"
lidar_package="$(wslpath -a -- "$3")"
cd /home/winchell/E-Wagon
setsid --wait ./scripts/combine/install-rk3566.sh "$1" --host-pkg "$host_package" --lidar-pkg "$lidar_package" &
deployment_pid=$!
trap 'kill -TERM -- "-$deployment_pid" 2>/dev/null || true' TERM INT
wait "$deployment_pid"
`

function nodeHost(): CameraPackageDeploymentHost {
  return { platform: process.platform, environment: process.env, spawn }
}

function sharedEnvironment(existing: string | undefined): string {
  const names = new Set(['NAVTOOLS_CAMERA_SSH_PASSWORD', 'NAVTOOLS_CAMERA_SSH_PORT'])
  const entries = (existing ?? '')
    .split(':')
    .filter((entry) => entry && !names.has(entry.split('/')[0]))
  entries.push('NAVTOOLS_CAMERA_SSH_PASSWORD/u', 'NAVTOOLS_CAMERA_SSH_PORT/u')
  return entries.join(':')
}

export class CameraPackageDeployer {
  private child: ChildProcess | undefined
  private token = ''
  private stopping = false
  private stopTimer: ReturnType<typeof setTimeout> | undefined

  public constructor(private readonly host: CameraPackageDeploymentHost = nodeHost()) {}

  public async run(
    request: CameraPackageDeploymentRequest,
    packages: CameraPackagePair,
    onOutput: (text: string) => void,
  ): Promise<void> {
    if (this.child) throw new Error('已有部署正在执行，请先停止')
    if (this.host.platform !== 'win32') throw new Error('当前环境不支持此部署')
    this.stopping = false
    this.token = `navtools-deploy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    const child = this.host.spawn(
      'wsl.exe',
      [
        '-d',
        WSL_DISTRO,
        '--exec',
        'bash',
        '-c',
        DEPLOY_SCRIPT,
        this.token,
        `${request.username}@${request.host}`,
        packages.hostPath.replaceAll('\\', '/'),
        packages.lidarPath.replaceAll('\\', '/'),
      ],
      {
        env: {
          ...this.host.environment,
          NAVTOOLS_CAMERA_SSH_PASSWORD: request.password,
          NAVTOOLS_CAMERA_SSH_PORT: String(request.port),
          WSLENV: sharedEnvironment(this.host.environment.WSLENV),
        },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    this.child = child

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const stdout = new StringDecoder('utf8')
      const stderr = new StringDecoder('utf8')
      const emit = (text: string) => {
        if (text) onOutput(text)
      }
      child.stdout?.on('data', (chunk: Buffer) => emit(stdout.write(chunk)))
      child.stderr?.on('data', (chunk: Buffer) => emit(stderr.write(chunk)))
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        emit(stdout.end())
        emit(stderr.end())
        this.clearChild(child)
        if (error) reject(error)
        else resolve()
      }
      child.once('error', (error) => {
        finish(new Error(`WSL 部署进程启动失败：${error.message}`))
      })
      child.once('close', (code) => {
        if (this.stopping) finish()
        else if (code === 0) finish()
        else finish(new Error(`部署进程退出码 ${code ?? '未知'}`))
      })
    })
  }

  public stop(): void {
    const child = this.child
    if (!child) return
    this.stopping = true
    const pattern = `[n]${this.token.slice(1)}`
    try {
      const stopProcess = this.host.spawn(
        'wsl.exe',
        ['-d', WSL_DISTRO, '--exec', 'pkill', '-TERM', '-f', pattern],
        { windowsHide: true, stdio: 'ignore' },
      )
      stopProcess.once('error', () => undefined)
      stopProcess.unref()
    } catch {
      child.kill()
      return
    }
    this.stopTimer = setTimeout(() => {
      if (this.child === child) child.kill()
    }, 2_000)
    this.stopTimer.unref()
  }

  private clearChild(child: ChildProcess): void {
    if (this.child !== child) return
    if (this.stopTimer) clearTimeout(this.stopTimer)
    this.stopTimer = undefined
    this.child = undefined
    this.token = ''
  }
}
