import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const SOURCE_PATH = path.resolve('build/icon-source.svg')
const OUTPUT_PATH = path.resolve('build/icon.svg')
const EXPECTED_SOURCE_SHA256 = 'c0ee85f726c43b7c8666122cc2feef521ea79861ff4c66d76fa2b7c55649459b'

async function renderIcon() {
  const mark = readFileSync(SOURCE_PATH)
  const actualHash = createHash('sha256').update(mark).digest('hex')
  if (actualHash !== EXPECTED_SOURCE_SHA256) {
    throw new Error('Pivot release icon source does not match the reviewed Figma AppIcon asset')
  }

  const source = mark.toString('utf8')
  const inner = source.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  if (inner === source) throw new Error('Pivot Figma AppIcon vector is not a bounded SVG asset')
  const appIcon = `<svg width="512" height="512" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="120" rx="28" fill="#111"/>
    <g transform="translate(26.31 32.5)">${inner}</g>
  </svg>\n`
  writeFileSync(OUTPUT_PATH, appIcon, 'utf8')
  process.stdout.write(`Rendered reviewed Pivot release icon: ${OUTPUT_PATH}\n`)
}

renderIcon()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    process.exitCode = 1
  })
