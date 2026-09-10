import fs from 'node:fs'
import path from 'node:path'
import { safeStorage } from 'electron'
import type { CameraMeasurementAccess } from './CameraSshMeasurementChannel'

interface StoredAccess {
  host?: string
  port?: number
  username?: string
  passwordEncrypted?: string
  passwordPlaintext?: string
}

/**
 * 相机测量 SSH 凭据的本地持久化：密码经 safeStorage 加密后落盘，
 * 渲染端不持久化明文；safeStorage 不可用时降级为 base64（仅限开发环境）。
 */
export class CameraMeasurementAccessStore {
  private readonly file: string

  public constructor(userDataDir: string) {
    this.file = path.join(userDataDir, 'camera-measurement-ssh.json')
  }

  public load(): Partial<CameraMeasurementAccess> & { hasPassword: boolean } {
    let stored: StoredAccess = {}
    try {
      stored = JSON.parse(fs.readFileSync(this.file, 'utf8')) as StoredAccess
    } catch {
      stored = {}
    }
    return {
      host: stored.host,
      port: stored.port,
      username: stored.username,
      hasPassword: Boolean(stored.passwordEncrypted || stored.passwordPlaintext),
    }
  }

  public resolve(access: CameraMeasurementAccess): CameraMeasurementAccess {
    const password = access.password || this.loadPassword()
    if (!password) throw new Error('缺少 SSH 密码，请输入后再开始观测')
    return { ...access, password }
  }

  public save(access: CameraMeasurementAccess): void {
    const stored: StoredAccess = {
      host: access.host,
      port: access.port,
      username: access.username,
    }
    if (safeStorage.isEncryptionAvailable()) {
      stored.passwordEncrypted = safeStorage.encryptString(access.password).toString('base64')
    } else {
      stored.passwordPlaintext = Buffer.from(access.password, 'utf8').toString('base64')
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    fs.writeFileSync(this.file, JSON.stringify(stored, null, 2), 'utf8')
  }

  private loadPassword(): string {
    let stored: StoredAccess
    try {
      stored = JSON.parse(fs.readFileSync(this.file, 'utf8')) as StoredAccess
    } catch {
      return ''
    }
    if (stored.passwordEncrypted && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(stored.passwordEncrypted, 'base64'))
    }
    if (stored.passwordPlaintext) {
      return Buffer.from(stored.passwordPlaintext, 'base64').toString('utf8')
    }
    return ''
  }
}
