import { describe, expect, it } from 'vitest'
import { validateIpcRequest } from '../../src/shared/ipc-validation'

describe('feedback IPC validation', () => {
  it('accepts only empty list/select calls and strict submissions', () => {
    expect(validateIpcRequest('settings:list-feedback', undefined)).toBeUndefined()
    expect(validateIpcRequest('settings:choose-feedback-attachments', undefined)).toBeUndefined()
    expect(validateIpcRequest('settings:discard-feedback-attachment', {
      attachmentId: '11111111-1111-4111-8111-111111111111',
    })).toEqual({ attachmentId: '11111111-1111-4111-8111-111111111111' })
    expect(validateIpcRequest('settings:submit-feedback', {
      attachmentIds: [],
      description: 'A reproducible description.',
      priority: 'medium',
      submissionId: '22222222-2222-4222-8222-222222222222',
      title: 'A concise title',
      type: 'bug-report',
    })).toMatchObject({ priority: 'medium', type: 'bug-report' })
  })

  it('rejects forged paths and malformed submission values', () => {
    expect(() => validateIpcRequest('settings:choose-feedback-attachments', {
      paths: ['D:\\secret.txt'],
    })).toThrow(/unknown field|empty request/i)
    expect(() => validateIpcRequest('settings:discard-feedback-attachment', {
      attachmentId: 'not-an-id', filePath: 'D:\\secret.log',
    })).toThrow(/unknown field|invalid feedback/i)
    expect(() => validateIpcRequest('settings:submit-feedback', {
      attachmentIds: [], description: '', priority: 'critical',
      submissionId: 'not-an-id', title: '', type: 'bug-report',
    })).toThrow(/invalid feedback/i)
  })
})
