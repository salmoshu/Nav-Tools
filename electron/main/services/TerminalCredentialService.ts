import fs from 'node:fs/promises'
import path from 'node:path'
import type { SshConnectionSecrets } from '../../../src/core/terminal/TerminalTypes'

interface EncryptionAdapter {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

interface CredentialFile {
  version: 1
  credentials: Record<string, string>
}

const EMPTY_FILE: CredentialFile = { version: 1, credentials: {} }

/** Stores SSH secrets behind Electron safeStorage instead of renderer/localStorage. */
export class TerminalCredentialService {
  constructor(
    private readonly userDataPath: string,
    private readonly encryption: EncryptionAdapter,
  ) {}

  public async load(profileId: string): Promise<SshConnectionSecrets | undefined> {
    const payload = (await this.read()).credentials[profileId]
    if (!payload || !this.encryption.isEncryptionAvailable()) return undefined
    try {
      const decoded = this.encryption.decryptString(Buffer.from(payload, 'base64'))
      const secrets = JSON.parse(decoded) as SshConnectionSecrets
      return normalizeSecrets(secrets)
    } catch {
      return undefined
    }
  }

  public async save(profileId: string, secrets: SshConnectionSecrets): Promise<void> {
    if (!profileId) throw new Error('SSH profile id is required')
    if (!this.encryption.isEncryptionAvailable()) {
      throw new Error('Secure credential storage is unavailable')
    }
    const normalized = normalizeSecrets(secrets)
    if (!normalized) {
      await this.remove(profileId)
      return
    }
    const file = await this.read()
    file.credentials[profileId] = this.encryption
      .encryptString(JSON.stringify(normalized))
      .toString('base64')
    await this.write(file)
  }

  public async remove(profileId: string): Promise<void> {
    const file = await this.read()
    if (!(profileId in file.credentials)) return
    delete file.credentials[profileId]
    await this.write(file)
  }

  private filePath(): string {
    return path.join(this.userDataPath, 'terminal-credentials.json')
  }

  private async read(): Promise<CredentialFile> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath(), 'utf8')) as CredentialFile
      if (parsed.version !== 1 || !parsed.credentials || typeof parsed.credentials !== 'object') {
        return structuredClone(EMPTY_FILE)
      }
      return { version: 1, credentials: { ...parsed.credentials } }
    } catch {
      return structuredClone(EMPTY_FILE)
    }
  }

  private async write(file: CredentialFile): Promise<void> {
    await fs.mkdir(this.userDataPath, { recursive: true })
    await fs.writeFile(this.filePath(), JSON.stringify(file, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    })
  }
}

function normalizeSecrets(secrets: SshConnectionSecrets): SshConnectionSecrets | undefined {
  const password =
    typeof secrets.password === 'string' && secrets.password ? secrets.password : undefined
  const passphrase =
    typeof secrets.passphrase === 'string' && secrets.passphrase ? secrets.passphrase : undefined
  return password || passphrase ? { password, passphrase } : undefined
}
