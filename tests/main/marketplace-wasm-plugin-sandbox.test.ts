import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MarketplaceWasmPluginSandboxAdapter } from '../../src/main/services/marketplace-wasm-plugin-sandbox-adapter'

const root = path.resolve(__dirname, '../..')

// (module (func (export "pivot_plugin_version") (result i32) i32.const 1)
//   (func (export "pivot_run") (result i32) i32.const 0))
const VALID_PLUGIN = Uint8Array.from([
  0,97,115,109,1,0,0,0,1,5,1,96,0,1,127,3,3,2,0,0,
  7,36,2,20,112,105,118,111,116,95,112,108,117,103,105,110,95,118,101,114,115,105,111,110,0,0,9,112,105,118,111,116,95,114,117,110,0,1,
  10,11,2,4,0,65,1,11,4,0,65,0,11,
])
const INFINITE_PLUGIN = Uint8Array.from([
  0,97,115,109,1,0,0,0,1,5,1,96,0,1,127,3,3,2,0,0,
  7,36,2,20,112,105,118,111,116,95,112,108,117,103,105,110,95,118,101,114,115,105,111,110,0,0,9,112,105,118,111,116,95,114,117,110,0,1,
  10,16,2,4,0,65,1,11,9,0,3,64,12,0,11,65,0,11,
])

describe('MarketplaceWasmPluginSandboxAdapter', () => {
  it('keeps untrusted WebAssembly compilation off the Main event loop', () => {
    const source = readFileSync(path.join(root, 'src/main/services/marketplace-wasm-plugin-sandbox-adapter.ts'), 'utf8')
    const registrationBody = source.slice(source.indexOf('private async register'), source.indexOf('private async unregister'))
    expect(registrationBody).not.toContain('WebAssembly.compile')
    expect(registrationBody).toContain("this.runWorker('validate'")
  })

  it('executes the bounded ABI without exposing Node capabilities', async () => {
    const sandbox = new MarketplaceWasmPluginSandboxAdapter({ timeoutMs: 1_000 }).openPort()
    await sandbox.register('plugin-registration', VALID_PLUGIN)
    await expect(sandbox.invoke('plugin-registration')).resolves.toEqual({
      emittedCodes: [], resultCode: 0, schemaVersion: 1,
    })
  })

  it('rejects JavaScript, memory-bearing modules, and unknown registrations', async () => {
    const sandbox = new MarketplaceWasmPluginSandboxAdapter().openPort()
    await expect(sandbox.register('javascript', new TextEncoder().encode('process.exit()'))).rejects.toThrow()
    const memoryModule = Uint8Array.from([0,97,115,109,1,0,0,0,5,3,1,0,1])
    await expect(sandbox.register('memory', memoryModule)).rejects.toThrow('memory')
    await expect(sandbox.invoke('missing')).rejects.toThrow('not registered')
  })

  it('terminates a non-cooperative plugin at the execution deadline', async () => {
    const sandbox = new MarketplaceWasmPluginSandboxAdapter({ timeoutMs: 20 }).openPort()
    await sandbox.register('infinite', INFINITE_PLUGIN)
    await expect(sandbox.invoke('infinite')).rejects.toThrow(/timed out/i)
  })
})
