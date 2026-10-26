import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import {
  CameraPackageDeployer,
  type CameraPackageDeploymentHost,
} from '../../electron/main/services/CameraPackageDeployer'
import { matchCameraPackagePair } from '../../src/core/camera/CameraPackageSelection'

const HOST_PATH = String.raw`C:\Users\Salmos\Desktop\E-Wagon固件\0.5.3\e-wagon-0.5.3-aarch64-20261026_0845.tar.gz`
const LIDAR_PATH = String.raw`C:\Users\Salmos\Desktop\E-Wagon固件\0.5.3\e-wagon-lidar-1.3.2-aarch64-20261026_0846.tar.gz`
const REQUEST = {
  host: '192.168.3.14',
  port: 2222,
  username: 'root',
  password: 'not-in-command-line',
}

function createChild(): ChildProcess {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
    unref: vi.fn(),
  }) as unknown as ChildProcess
}

function createHarness(platform: typeof process.platform = 'win32') {
  const children: ChildProcess[] = []
  const spawn = vi.fn((file: string, args: string[], options: SpawnOptions) => {
    void file
    void args
    void options
    const child = createChild()
    children.push(child)
    return child
  })
  const host: CameraPackageDeploymentHost = {
    platform,
    environment: { WSLENV: 'EXISTING/u', PATH: 'test-path' },
    spawn,
  }
  return { children, host, spawn }
}

describe('相机发布包选择', () => {
  it('识别实际文件、反序选择和后续版本，不绑定本次时间戳', () => {
    expect(matchCameraPackagePair([HOST_PATH, LIDAR_PATH])).toEqual({
      hostPath: HOST_PATH,
      lidarPath: LIDAR_PATH,
    })
    expect(matchCameraPackagePair([LIDAR_PATH, HOST_PATH])).toEqual({
      hostPath: HOST_PATH,
      lidarPath: LIDAR_PATH,
    })
    expect(
      matchCameraPackagePair([
        HOST_PATH.replace('0.5.3', '0.6.0').replace('20261026_0845', '20261027_1015'),
        LIDAR_PATH.replace('1.3.2', '1.4.0'),
      ]),
    ).toBeDefined()
  })

  it('拒绝单包、重复类型、混合文件和近似文件名', () => {
    expect(matchCameraPackagePair([HOST_PATH])).toBeUndefined()
    expect(matchCameraPackagePair([HOST_PATH, HOST_PATH])).toBeUndefined()
    expect(matchCameraPackagePair([HOST_PATH, LIDAR_PATH, 'check.sh'])).toBeUndefined()
    expect(matchCameraPackagePair([HOST_PATH, 'check.sh'])).toBeUndefined()
    expect(matchCameraPackagePair([`${HOST_PATH}.sh`, LIDAR_PATH])).toBeUndefined()
    expect(
      matchCameraPackagePair([HOST_PATH.replace('aarch64', 'x86_64'), LIDAR_PATH]),
    ).toBeUndefined()
  })
})

describe('CameraPackageDeployer', () => {
  it('通过固定 WSL 联合脚本部署，并只经环境传递密码和端口', async () => {
    const { children, host, spawn } = createHarness()
    const deployer = new CameraPackageDeployer(host)
    const output: string[] = []
    const running = deployer.run(REQUEST, { hostPath: HOST_PATH, lidarPath: LIDAR_PATH }, (text) =>
      output.push(text),
    )

    expect(spawn).toHaveBeenCalledOnce()
    const [file, args, options] = spawn.mock.calls[0]
    expect(file).toBe('wsl.exe')
    expect(args.slice(0, 5)).toEqual(['-d', 'Ubuntu-20.04', '--exec', 'bash', '-c'])
    expect(args[6]).toMatch(/^navtools-deploy-/)
    expect(args.slice(7)).toEqual([
      'root@192.168.3.14',
      HOST_PATH.replaceAll('\\', '/'),
      LIDAR_PATH.replaceAll('\\', '/'),
    ])
    expect(args[5]).toContain('scripts/combine/install-rk3566.sh')
    expect(args[5]).toContain('--host-pkg "$host_package" --lidar-pkg "$lidar_package"')
    expect(args[5]).toContain('wslpath -a -- "$2"')
    expect(args[5]).toContain('wslpath -a -- "$3"')
    expect(args[5]).toContain('SSH_ASKPASS_REQUIRE=force')
    expect(args[5]).toContain('/usr/bin/ssh -p "$NAVTOOLS_CAMERA_SSH_PORT"')
    expect(args[5]).toContain('/usr/bin/scp -P "$NAVTOOLS_CAMERA_SSH_PORT"')
    expect(args[5]).toContain('/usr/bin/ssh-copy-id -p "$NAVTOOLS_CAMERA_SSH_PORT"')
    expect(args[5]).toContain('setsid --wait')
    expect(JSON.stringify(args)).not.toContain(REQUEST.password)
    expect(options.env).toMatchObject({
      NAVTOOLS_CAMERA_SSH_PASSWORD: REQUEST.password,
      NAVTOOLS_CAMERA_SSH_PORT: '2222',
      WSLENV: 'EXISTING/u:NAVTOOLS_CAMERA_SSH_PASSWORD/u:NAVTOOLS_CAMERA_SSH_PORT/u',
    })

    const text = Buffer.from('联合部署完成\n', 'utf8')
    children[0].stdout?.write(text.subarray(0, 5))
    children[0].stdout?.write(text.subarray(5))
    children[0].emit('close', 0)
    await expect(running).resolves.toBeUndefined()
    expect(output.join('')).toBe('联合部署完成\n')
  })

  it('保留 stderr 并报告非零退出码', async () => {
    const { children, host } = createHarness()
    const deployer = new CameraPackageDeployer(host)
    const output: string[] = []
    const running = deployer.run(REQUEST, { hostPath: HOST_PATH, lidarPath: LIDAR_PATH }, (text) =>
      output.push(text),
    )
    children[0].stderr?.write('static check failed\n')
    children[0].emit('close', 7)

    await expect(running).rejects.toThrow('部署进程退出码 7')
    expect(output.join('')).toContain('static check failed')
  })

  it('停止时按本次 token 终止 WSL 部署进程组', async () => {
    const { children, host, spawn } = createHarness()
    const deployer = new CameraPackageDeployer(host)
    const running = deployer.run(
      REQUEST,
      { hostPath: HOST_PATH, lidarPath: LIDAR_PATH },
      () => undefined,
    )
    const token = spawn.mock.calls[0][1][6]

    deployer.stop()

    expect(spawn).toHaveBeenCalledTimes(2)
    expect(spawn.mock.calls[1][0]).toBe('wsl.exe')
    expect(spawn.mock.calls[1][1]).toEqual([
      '-d',
      'Ubuntu-20.04',
      '--exec',
      'pkill',
      '-TERM',
      '-f',
      `[n]${token.slice(1)}`,
    ])
    expect(children[1].unref).toHaveBeenCalledOnce()
    children[0].emit('close', 143)
    await expect(running).resolves.toBeUndefined()
    expect(children[0].kill).not.toHaveBeenCalled()
  })

  it('非 Windows 环境在创建进程前拒绝执行', async () => {
    const { host, spawn } = createHarness('linux')
    const deployer = new CameraPackageDeployer(host)
    await expect(
      deployer.run(REQUEST, { hostPath: HOST_PATH, lidarPath: LIDAR_PATH }, () => undefined),
    ).rejects.toThrow('当前环境不支持此部署')
    expect(spawn).not.toHaveBeenCalled()
  })
})
