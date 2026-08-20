import { mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveAgentContext } from '../../src/main/services/agent-context'

let tempRoot = ''

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `pivot-agent-context-${Date.now()}`)
  await mkdir(path.join(tempRoot, 'src'), { recursive: true })
})

afterEach(async () => {
  await rm(tempRoot, { force: true, recursive: true })
})

describe('resolveAgentContext', () => {
  it('reads renderer-selected references through the project file boundary', async () => {
    const filePath = path.join(tempRoot, 'src', 'answer.ts')
    await writeFile(filePath, 'export const answer = 42')

    await expect(resolveAgentContext(tempRoot, {
      referencedFilePaths: [filePath],
    })).resolves.toMatchObject({
      projectPath: await realpath(tempRoot),
      referencedFiles: [{
        content: 'export const answer = 42',
        filePath: await realpath(filePath),
      }],
    })
  })

  it('rejects a referenced file outside the active session project', async () => {
    const outsideFile = `${tempRoot}-outside.txt`
    await writeFile(outsideFile, 'secret')

    await expect(resolveAgentContext(tempRoot, {
      referencedFilePaths: [outsideFile],
    })).rejects.toThrow('outside the project root')

    await rm(outsideFile, { force: true })
  })
})
