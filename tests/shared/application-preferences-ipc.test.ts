import { describe, expect, it } from 'vitest'
import { validateIpcRequest } from '../../src/shared/ipc-validation'

describe('application preferences IPC validation', () => {
  it('accepts only empty reads and strict optimistic updates', () => {
    expect(validateIpcRequest('settings:application-preferences', undefined)).toBeUndefined()
    expect(validateIpcRequest('settings:update-application-preferences', {
      expectedRevision: 3,
      patch: { startMinimized: true },
    })).toEqual({ expectedRevision: 3, patch: { startMinimized: true } })
  })

  it('rejects renderer authority fields and malformed preference values', () => {
    expect(() => validateIpcRequest('settings:update-application-preferences', {
      expectedRevision: 3,
      patch: { startMinimized: true },
      databasePath: 'D:\\forged.sqlite',
    })).toThrow(/unknown field/i)
    expect(() => validateIpcRequest('settings:update-application-preferences', {
      expectedRevision: 3,
      patch: { sessionTimeout: 30 },
    })).toThrow(/invalid application preferences/i)
  })
})
