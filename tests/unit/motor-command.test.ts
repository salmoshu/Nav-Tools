import { describe, expect, it, vi } from 'vitest'
import {
  createMotorCmdManager,
  type MotorMessageFieldId,
  type ReadCommand,
  type WriteCommand,
} from '@/composables/motor/useMotorCmd'
import { t } from '@/i18n'

const createReadCommand = (overrides: Partial<ReadCommand> = {}): ReadCommand => ({
  name: 'GET_SPEED',
  address: '00',
  data: '0000',
  length: 4,
  dataType: 'int16',
  functionCode: '03',
  registerCount: 2,
  includeRegisterCount: true,
  includeLength: true,
  frequency: null,
  lastSentTime: 0,
  ...overrides,
})

const createWriteCommand = (overrides: Partial<WriteCommand> = {}): WriteCommand => ({
  name: 'SET_SPEED',
  address: '01',
  data: '0000',
  length: 2,
  dataType: 'int16',
  functionCode: '06',
  registerCount: 1,
  includeRegisterCount: true,
  includeLength: true,
  ...overrides,
})

describe('motor command configuration', () => {
  it('keeps byte length, value type, data size, and register count linked', () => {
    const manager = createMotorCmdManager()
    manager.writeCommands.value.push(createWriteCommand())
    const command = manager.writeCommands.value[0]

    manager.updateCommandLength(command, 3, 'write')
    expect(command).toMatchObject({ length: 4, registerCount: 2 })
    expect(command.data).toHaveLength(8)

    manager.updateCommandDataType(command, 'float32', 'write')
    expect(command).toMatchObject({ dataType: 'float32', length: 4, registerCount: 2 })
    expect(command.data).toHaveLength(8)

    manager.updateCommandRegisterCount(command, 1, 'write')
    expect(command).toMatchObject({ length: 4, registerCount: 2 })
    expect(command.data).toHaveLength(8)
  })

  it('encodes write data once and preserves its value when endianness changes', () => {
    const manager = createMotorCmdManager()
    manager.writeCommands.value.push(createWriteCommand())
    const command = manager.writeCommands.value[0]
    manager.configForm.checksum.method = 'none'

    command.data = manager.decimalToHex('4660', 'int16', 'little')
    expect(command.data).toBe('3412')
    expect(manager.buildWriteCommandMessage(command, manager.configForm)).toBe(
      'A501060100023412',
    )

    manager.reencodeWriteCommandData('little', 'big')
    manager.configForm.dataEndianness = 'big'
    expect(command.data).toBe('1234')
    expect(manager.buildWriteCommandMessage(command, manager.configForm)).toBe(
      'A501060100021234',
    )
  })

  it('normalizes integer input and implements the configured checksum methods', () => {
    const manager = createMotorCmdManager()

    expect(manager.decimalToHex('1.9', 'int16', 'little')).toBe('0100')
    expect(manager.calculateChecksum('313233343536373839', 'crc8', 0)).toBe('F4')
    expect(manager.calculateChecksum('313233343536373839', 'crc16', 0, 'big')).toBe(
      '4B37',
    )
    expect(manager.calculateChecksum('313233343536373839', 'crc16', 0, 'little')).toBe(
      '374B',
    )
  })

  it('parses responses with the active field order and rejects a bad checksum', () => {
    const manager = createMotorCmdManager()
    manager.readCommands.value.push(createReadCommand())
    const order: MotorMessageFieldId[] = [
      'header',
      'function',
      'address',
      'length',
      'registerCount',
      'data',
      'checksum',
    ]
    manager.messageFieldOrder.value = order
    manager.initializeCommandStatusCache()

    const payload = 'A5030000040201000200'
    const checksum = manager.calculateChecksum(payload, 'crc16', 0, 'big')
    const result = manager.convertByteArrayToJson(`${payload}${checksum}`)

    expect(JSON.parse(result)).toMatchObject({ GET_SPEED_1: 1, GET_SPEED_2: 2 })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(manager.convertByteArrayToJson(`${payload}0000`)).toBe('')
    warning.mockRestore()
  })

  it('reports ambiguous read mappings before commands can be sent', () => {
    const manager = createMotorCmdManager()
    manager.readCommands.value.push(
      createReadCommand({ name: 'GET_SPEED', address: '00' }),
      createReadCommand({ name: 'GET_CURRENT', address: '01' }),
    )
    manager.readCommands.value[1].address = manager.readCommands.value[0].address
    manager.readCommands.value[1].functionCode = manager.readCommands.value[0].functionCode

    expect(manager.isConfigValid.value).toBe(false)
    expect(manager.configurationIssues.value).toContain(
      t('motor.issueDuplicateMapping', {
        label: t('motor.readCommandLabel', { n: 2 }),
      }),
    )
  })
})
