import { Worker } from 'node:worker_threads'
import { MarketplacePluginInvocationResultSchema } from '../../shared/marketplace-resource-contracts'
import type { MarketplacePluginSandboxPort } from './marketplace-resource-consumer-ports'

const MAX_PLUGIN_BYTES = 4 * 1024 * 1024
const MAX_EMITTED_CODES = 256
const WORKER_SOURCE = `
  const { parentPort } = require('node:worker_threads');
  parentPort.once('message', async ({ bytes, mode }) => {
    const emittedCodes = [];
    try {
      const module = await WebAssembly.compile(bytes);
      const imports = WebAssembly.Module.imports(module);
      if (imports.length > 1 || imports.some((item) => item.kind !== 'function' || item.module !== 'pivot' || item.name !== 'emit_code')) {
        throw new Error('Marketplace plugin imports exceed the Pivot Wasm v1 capability ABI');
      }
      const exports = WebAssembly.Module.exports(module);
      for (const name of ['pivot_plugin_version', 'pivot_run']) {
        if (!exports.some((item) => item.kind === 'function' && item.name === name)) throw new Error('Marketplace plugin is missing ' + name);
      }
      if (mode === 'validate') { parentPort.postMessage({ validated: true }); return; }
      if (mode !== 'invoke') throw new Error('Marketplace plugin worker mode is invalid');
      const instance = await WebAssembly.instantiate(module, { pivot: { emit_code(value) {
        if (!Number.isInteger(value) || emittedCodes.length >= ${MAX_EMITTED_CODES}) throw new Error('Plugin emitted invalid or excessive output');
        emittedCodes.push(value);
      } } });
      const version = instance.exports.pivot_plugin_version();
      if (version !== 1) throw new Error('Unsupported Pivot plugin ABI version');
      const resultCode = instance.exports.pivot_run();
      parentPort.postMessage({ emittedCodes, resultCode, schemaVersion: 1 });
    } catch (error) { parentPort.postMessage({ error: error instanceof Error ? error.message : 'Plugin execution failed' }); }
  });
`

export class MarketplaceWasmPluginSandboxAdapter {
  private readonly plugins = new Map<string, Uint8Array>()
  private readonly timeoutMs: number
  private readonly validationTimeoutMs: number

  constructor(options: { readonly timeoutMs?: number; readonly validationTimeoutMs?: number } = {}) {
    this.timeoutMs = options.timeoutMs ?? 2_000
    this.validationTimeoutMs = options.validationTimeoutMs ?? 2_000
    if ([this.timeoutMs, this.validationTimeoutMs].some((value) => !Number.isInteger(value) || value < 10 || value > 30_000)) {
      throw new Error('Marketplace plugin timeouts must be between 10 and 30000 ms')
    }
  }

  openPort(): MarketplacePluginSandboxPort {
    return Object.freeze({
      invoke: (registrationId: string) => this.invoke(registrationId),
      register: (registrationId: string, bytes: Uint8Array) => this.register(registrationId, bytes),
      unregister: (registrationId: string) => this.unregister(registrationId),
    })
  }

  private async register(registrationId: string, input: Uint8Array): Promise<void> {
    requireRegistrationId(registrationId)
    const bytes = Uint8Array.from(input)
    if (bytes.byteLength < 8 || bytes.byteLength > MAX_PLUGIN_BYTES
      || ![0, 97, 115, 109, 1, 0, 0, 0].every((value, index) => bytes[index] === value)) {
      throw new Error('Marketplace plugin entrypoint must be a bounded WebAssembly module')
    }
    rejectStatefulSections(bytes)
    const validation = await this.runWorker('validate', bytes)
    if (!validation || typeof validation !== 'object' || !('validated' in validation) || validation.validated !== true) {
      throw new Error('Marketplace plugin validation result is invalid')
    }
    this.plugins.set(registrationId, bytes)
  }

  private async unregister(registrationId: string): Promise<void> {
    this.plugins.delete(registrationId)
  }

  private invoke(registrationId: string): Promise<ReturnType<typeof MarketplacePluginInvocationResultSchema.parse>> {
    requireRegistrationId(registrationId)
    const bytes = this.plugins.get(registrationId)
    if (!bytes) return Promise.reject(new Error('Marketplace plugin is not registered'))
    return this.runWorker('invoke', bytes).then((result) => MarketplacePluginInvocationResultSchema.parse(result))
  }

  private runWorker(mode: 'invoke' | 'validate', bytes: Uint8Array): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(WORKER_SOURCE, {
        eval: true,
        resourceLimits: { maxOldGenerationSizeMb: 16, stackSizeMb: 1 },
      })
      let settled = false
      const finish = (error?: unknown, result?: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        void worker.terminate()
        if (error) reject(error)
        else resolve(result)
      }
      const deadline = mode === 'validate' ? this.validationTimeoutMs : this.timeoutMs
      const timer = setTimeout(() => finish(new Error(`Marketplace plugin ${mode} timed out`)), deadline)
      worker.once('message', (message: { error?: string } | unknown) => {
        if (message && typeof message === 'object' && 'error' in message && typeof message.error === 'string') {
          finish(new Error(message.error))
        } else finish(undefined, message)
      })
      worker.once('error', finish)
      worker.once('exit', (code) => { if (!settled) finish(new Error(`Marketplace plugin worker exited with code ${code}`)) })
      worker.postMessage({ bytes: Uint8Array.from(bytes), mode })
    })
  }
}

function requireRegistrationId(value: string): void {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new Error('Marketplace plugin registration id is invalid')
  }
}

function rejectStatefulSections(bytes: Uint8Array): void {
  let offset = 8
  while (offset < bytes.length) {
    const sectionId = bytes[offset++]!
    const size = readUnsignedLeb128(bytes, offset)
    offset = size.next
    if ([4, 5, 8].includes(sectionId)) {
      throw new Error('Marketplace plugin memory, tables, and start sections are not allowed')
    }
    offset += size.value
    if (offset > bytes.length) throw new Error('Marketplace plugin WebAssembly section is truncated')
  }
}

function readUnsignedLeb128(bytes: Uint8Array, start: number): { next: number; value: number } {
  let result = 0
  let shift = 0
  let offset = start
  while (offset < bytes.length && shift <= 28) {
    const byte = bytes[offset++]!
    result |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) return { next: offset, value: result }
    shift += 7
  }
  throw new Error('Marketplace plugin WebAssembly length is invalid')
}
