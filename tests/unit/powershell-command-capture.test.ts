import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { TerminalService } from '../../electron/main/services/TerminalService'
import { createNodeTerminalServiceHost } from '../../electron/main/services/TerminalServiceHost'
import { CommandBlockAssembler } from '@/core/terminal/CommandBlocks'

const windowsIt = process.platform === 'win32' ? it : it.skip

describe('PowerShell command capture', () => {
  windowsIt(
    'captures an interactively entered command',
    async () => {
      const assembler = new CommandBlockAssembler()
      let notify = (): void => undefined
      const service = new TerminalService(
        tmpdir(),
        (channel, payload) => {
          if (channel !== 'terminal-output') return
          assembler.feed((payload as { data: string }).data)
          notify()
        },
        createNodeTerminalServiceHost(),
      )
      const session = await service.create({
        kind: 'local',
        localShell: 'powershell',
        cols: 80,
        rows: 24,
      })
      const waitFor = async (done: () => boolean): Promise<void> => {
        if (done()) return
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('PowerShell output timed out')), 5000)
          notify = () => {
            if (!done()) return
            clearTimeout(timeout)
            resolve()
          }
        })
      }

      try {
        await waitFor(() => assembler.hasMarkers)
        service.write(session.id, 'ls\r')
        await waitFor(() => assembler.getBlocks().length > 0)
        expect(assembler.getBlocks()[0].command).toBe('ls')
      } finally {
        await service.close(session.id)
      }
    },
    10_000,
  )
})
