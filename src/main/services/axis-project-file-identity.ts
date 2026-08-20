import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  AxisFileIdentitySchema,
  AxisFileLeaseAcquireRequestSchema,
  AxisFileLeaseBindingSchema,
  type AxisFileIdentity,
  type AxisFileLeaseBinding,
} from '../../shared/axis-file-lease-contracts'
import type { AxisProjectFileIdentityPort } from './axis-file-lease-ports'
import type { AxisProjectBindingReaderPort } from './axis-project-binding-ports'
import { resolvePathWithinRoot } from './file-system'

export class AxisMainProjectFileIdentityAdapter implements AxisProjectFileIdentityPort {
  private readonly projectBindings: AxisProjectBindingReaderPort

  constructor(options: {
    projectBindings: AxisProjectBindingReaderPort
  }) {
    this.projectBindings = options.projectBindings
  }

  async resolve(
    bindingInput: AxisFileLeaseBinding,
    filePathInput: string,
  ): Promise<AxisFileIdentity> {
    const binding = AxisFileLeaseBindingSchema.parse(bindingInput)
    const filePath = AxisFileLeaseAcquireRequestSchema.shape.filePath.parse(filePathInput)
    const projectBinding = this.projectBindings.findBySession(binding.sessionId)
    if (!projectBinding) {
      throw new Error(`Unknown authoritative session project root: ${binding.sessionId}`)
    }
    if (projectBinding.projectId !== binding.projectId) {
      throw new Error('File identity project binding does not match the task project identity')
    }

    const projectRoot = await resolvePathWithinRoot(
      projectBinding.projectRoot,
      projectBinding.projectRoot,
    )
    const candidate = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath)
    const resolved = await resolvePathWithinRoot(projectRoot, candidate, { allowMissingLeaf: true })
    const projectRelativePath = path.relative(projectRoot, resolved).replaceAll('\\', '/')
    if (!projectRelativePath || projectRelativePath === '.') {
      throw new Error('File lease requires a file path below the project root')
    }

    const canonicalKeyInput = process.platform === 'win32'
      ? path.normalize(resolved).toLocaleLowerCase('en-US')
      : path.normalize(resolved)
    return AxisFileIdentitySchema.parse({
      fileKey: createHash('sha256').update(canonicalKeyInput, 'utf8').digest('hex'),
      projectRelativePath,
    })
  }
}
