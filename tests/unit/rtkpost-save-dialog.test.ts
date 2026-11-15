// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerRtkPostIpc } from '../../electron/main/rtkPostIpc'
import type { RtkPostService } from '../../electron/main/services/RtkPostService'
import type { RtkPostSaveConfigRequest } from '../../src/core/gnsslib/RtkPost'

const harness = vi.hoisted(() => ({
  handlers: new Map<string, (...args: never[]) => unknown>(),
  pick: vi.fn(),
  confirm: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: () => null },
  ipcMain: {
    handle: (name: string, handler: (...args: never[]) => unknown) =>
      harness.handlers.set(name, handler),
  },
  dialog: { showMessageBox: harness.confirm },
}))
vi.mock('../../electron/main/dialogs', () => ({ showScopedSaveDialog: harness.pick }))

const inspect = vi.fn()
const write = vi.fn()
const request: RtkPostSaveConfigRequest = {
  defaultPath: 'source.conf',
  content: 'pos2-arthres=4\n',
  protectedPaths: ['rover.obs'],
}
const event = { sender: {} }

beforeEach(() => {
  harness.handlers.clear()
  harness.pick.mockReset()
  harness.confirm.mockReset()
  inspect.mockReset()
  write.mockReset()
  write.mockResolvedValue(undefined)
  registerRtkPostIpc({
    inspectConfigTarget: inspect,
    writeConfig: write,
  } as unknown as RtkPostService)
})

function save(): Promise<string | null> {
  return (
    harness.handlers.get('rtkpost-save-config') as unknown as (
      event: object,
      request: RtkPostSaveConfigRequest,
    ) => Promise<string | null>
  )(event, request)
}

describe('post-processing save dialog', () => {
  it('does not write when file selection is cancelled', async () => {
    harness.pick.mockResolvedValue({ canceled: true })
    await expect(save()).resolves.toBeNull()
    expect(inspect).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it('creates a new file without an overwrite prompt', async () => {
    harness.pick.mockResolvedValue({ canceled: false, filePath: 'new.conf' })
    inspect.mockResolvedValue(false)
    await expect(save()).resolves.toBe('new.conf')
    expect(write).toHaveBeenCalledWith('new.conf', request.content, request.protectedPaths, false)
    expect(harness.confirm).not.toHaveBeenCalled()
  })

  it('requires explicit confirmation before replacing an existing file', async () => {
    harness.pick.mockResolvedValue({ canceled: false, filePath: 'source.conf' })
    inspect.mockResolvedValue(true)
    harness.confirm.mockResolvedValueOnce({ response: 0 }).mockResolvedValueOnce({ response: 1 })
    await expect(save()).resolves.toBeNull()
    expect(write).not.toHaveBeenCalled()
    await expect(save()).resolves.toBe('source.conf')
    expect(write).toHaveBeenCalledOnce()
    expect(write).toHaveBeenCalledWith('source.conf', request.content, request.protectedPaths, true)
  })
})
