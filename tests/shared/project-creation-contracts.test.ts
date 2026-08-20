import { describe, expect, it } from 'vitest'
import { validateIpcRequest } from '../../src/shared/ipc-validation'
import {
  ProjectCreationRequestSchema,
  ProjectCreationResultSchema,
} from '../../src/shared/project-creation'

describe('project creation contracts', () => {
  const validRequest = {
    description: 'A durable local workspace.',
    initializeGit: true,
    parentPath: 'D:\\Workspaces',
    projectName: 'pivot-lab',
    remoteOriginUrl: 'https://github.com/example/pivot-lab.git',
    schemaVersion: 1,
  } as const

  it('strictly validates a bounded creation request and result', () => {
    expect(ProjectCreationRequestSchema.parse(validRequest)).toEqual(validRequest)
    expect(ProjectCreationResultSchema.parse({
      initializedGit: true,
      projectPath: 'D:\\Workspaces\\pivot-lab',
      remoteOriginConfigured: true,
      schemaVersion: 1,
    })).toEqual({
      initializedGit: true,
      projectPath: 'D:\\Workspaces\\pivot-lab',
      remoteOriginConfigured: true,
      schemaVersion: 1,
    })
    expect(validateIpcRequest('project:create', validRequest)).toEqual(validRequest)
  })

  it.each([
    { ...validRequest, projectName: '.' },
    { ...validRequest, projectName: '..' },
    { ...validRequest, projectName: 'nested/project' },
    { ...validRequest, projectName: 'CON' },
    { ...validRequest, unknownAuthority: true },
    { ...validRequest, remoteOriginUrl: 'http://github.com/example/repo.git' },
    { ...validRequest, remoteOriginUrl: 'https://token@github.com/example/repo.git' },
    { ...validRequest, initializeGit: false },
  ])('rejects malformed or authority-expanding input %#', (request) => {
    expect(() => ProjectCreationRequestSchema.parse(request)).toThrow()
  })
})
