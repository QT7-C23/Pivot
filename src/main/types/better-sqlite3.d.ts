declare module 'better-sqlite3' {
  export interface RunResult {
    changes: number
    lastInsertRowid: bigint | number
  }

  export interface Statement {
    all: (...params: unknown[]) => unknown[]
    get: (...params: unknown[]) => unknown
    run: (...params: unknown[]) => RunResult
  }

  export interface DatabaseOptions {
    readonly?: boolean
    fileMustExist?: boolean
    timeout?: number
    verbose?: (message?: unknown, ...additionalArgs: unknown[]) => void
  }

  export default class Database {
    constructor(filename: string, options?: DatabaseOptions)
    close(): this
    exec(source: string): this
    pragma(source: string): unknown
    prepare(source: string): Statement
    transaction<TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult): (...args: TArgs) => TResult
  }
}
