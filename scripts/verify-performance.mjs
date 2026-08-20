import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const files = await walk(path.join(process.cwd(), 'out'))
const javascript = (await Promise.all(files.filter((file) => file.endsWith('.js') || file.endsWith('.cjs')).map(async (file) => ({ file, size: (await stat(file)).size }))))
  .sort((a, b) => b.size - a.size)
const largest = javascript[0]
const largestApplicationChunk = javascript.find((entry) => !entry.file.includes('.worker-'))
const rendererHtml = await readFile(path.join(process.cwd(), 'out/renderer/index.html'), 'utf8')
const initialScriptName = rendererHtml.match(/assets\/(index-[^"']+\.js)/)?.[1]
const initialRendererChunk = javascript.find((entry) => path.basename(entry.file) === initialScriptName)
const total = javascript.reduce((sum, entry) => sum + entry.size, 0)
const maxWorkerChunk = 15 * 1024 * 1024
const maxApplicationChunk = 6 * 1024 * 1024
const maxInitialRendererChunk = 1.75 * 1024 * 1024
const maxTotal = 25 * 1024 * 1024

if (!largest || !largestApplicationChunk || !initialRendererChunk || largest.size > maxWorkerChunk || largestApplicationChunk.size > maxApplicationChunk || initialRendererChunk.size > maxInitialRendererChunk || total > maxTotal) {
  throw new Error(`Performance budget exceeded: largest=${largest?.size ?? 0}, app=${largestApplicationChunk?.size ?? 0}, initial=${initialRendererChunk?.size ?? 0}, total=${total}`)
}
console.log(`Performance budget PASS: ${javascript.length} JS chunks, largest worker ${(largest.size / 1024 / 1024).toFixed(2)} MiB, largest app ${(largestApplicationChunk.size / 1024 / 1024).toFixed(2)} MiB, initial renderer ${(initialRendererChunk.size / 1024 / 1024).toFixed(2)} MiB, total ${(total / 1024 / 1024).toFixed(2)} MiB.`)

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))
  return nested.flat()
}
