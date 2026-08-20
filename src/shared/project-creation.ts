import { z } from 'zod'

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i

export const ProjectCreationRequestSchema = z.object({
  description: z.string().trim().max(2_000),
  initializeGit: z.boolean(),
  parentPath: z.string().trim().min(1).max(1_024),
  projectName: z.string().trim().min(1).max(80).refine(
    (value) => value !== '.'
      && value !== '..'
      && !WINDOWS_RESERVED_NAMES.test(value)
      && !/[<>:"/\\|?*\u0000-\u001f]/.test(value)
      && !/[. ]$/.test(value),
    'expected a portable project directory name',
  ),
  remoteOriginUrl: z.string().trim().max(2_048).refine(isSafeHttpsRemote, {
    message: 'expected an HTTPS remote URL without embedded credentials',
  }).optional(),
  schemaVersion: z.literal(1),
}).strict().superRefine((request, context) => {
  if (request.remoteOriginUrl && !request.initializeGit) {
    context.addIssue({
      code: 'custom',
      message: 'remote origin requires Git initialization',
      path: ['remoteOriginUrl'],
    })
  }
})

export const ProjectCreationResultSchema = z.object({
  initializedGit: z.boolean(),
  projectPath: z.string().trim().min(1).max(1_024),
  remoteOriginConfigured: z.boolean(),
  schemaVersion: z.literal(1),
}).strict().superRefine((result, context) => {
  if (result.remoteOriginConfigured && !result.initializedGit) {
    context.addIssue({ code: 'custom', message: 'remote origin requires an initialized repository' })
  }
})

export type ProjectCreationRequest = z.infer<typeof ProjectCreationRequestSchema>
export type ProjectCreationResult = z.infer<typeof ProjectCreationResultSchema>

function isSafeHttpsRemote(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && Boolean(url.hostname)
      && !url.username
      && !url.password
  } catch {
    return false
  }
}
