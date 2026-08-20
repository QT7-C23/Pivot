import { mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectAccessRegistry } from '../../src/main/services/project-access'

let tempRoot = ''

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `pivot-project-access-${Date.now()}`)
  await mkdir(tempRoot, { recursive: true })
})

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

describe('ProjectAccessRegistry', () => {
  it('rejects roots that were invented by the renderer', async () => {
    const access = new ProjectAccessRegistry()

    await expect(access.requireAuthorized(tempRoot)).rejects.toThrow('has not been authorized')
  })

  it('accepts picker-authorized and persisted project roots', async () => {
    const access = new ProjectAccessRegistry()
    const authorizedRoot = await access.authorize(tempRoot)

    await expect(access.requireAuthorized(tempRoot)).resolves.toBe(authorizedRoot)
    await expect(new ProjectAccessRegistry([tempRoot]).requireAuthorized(tempRoot)).resolves.toBe(authorizedRoot)
  })
})
