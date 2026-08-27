import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TerminalCredentialService } from '../../electron/main/services/TerminalCredentialService'

const temporaryDirectories: string[] = []
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`protected:${value}`, 'utf8'),
  decryptString: (value: Buffer) => value.toString('utf8').replace(/^protected:/, ''),
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => fs.rm(dir, { recursive: true })))
})

describe('TerminalCredentialService', () => {
  it('persists secrets only as encrypted bytes and restores them by profile', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nav-tools-credentials-'))
    temporaryDirectories.push(directory)
    const service = new TerminalCredentialService(directory, encryption)

    await service.save('robot-camera', { password: 'test-secret' })

    const raw = await fs.readFile(path.join(directory, 'terminal-credentials.json'), 'utf8')
    expect(raw).not.toContain('test-secret')
    expect(await service.load('robot-camera')).toEqual({ password: 'test-secret' })
  })

  it('removes a remembered credential without affecting other profiles', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nav-tools-credentials-'))
    temporaryDirectories.push(directory)
    const service = new TerminalCredentialService(directory, encryption)
    await service.save('one', { password: 'first' })
    await service.save('two', { password: 'second' })

    await service.remove('one')

    expect(await service.load('one')).toBeUndefined()
    expect(await service.load('two')).toEqual({ password: 'second' })
  })
})
