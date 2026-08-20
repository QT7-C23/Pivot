export interface StartupRuntimeResult<T> {
  databasePath: string
  primaryError?: Error
  recovered: boolean
  runtime: T
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function initializeStartupRuntime<T>(
  databasePath: string,
  createRuntime: (databasePath: string) => T,
): StartupRuntimeResult<T> {
  try {
    return {
      databasePath,
      recovered: false,
      runtime: createRuntime(databasePath),
    }
  } catch (error) {
    const primaryError = normalizeError(error)
    return {
      databasePath: ':memory:',
      primaryError,
      recovered: true,
      runtime: createRuntime(':memory:'),
    }
  }
}
