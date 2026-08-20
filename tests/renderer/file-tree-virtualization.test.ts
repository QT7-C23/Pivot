import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('file tree virtualization', () => {
  it('renders the flattened file tree through the TanStack virtualizer seam', async () => {
    const source = await readFile(path.resolve('src/renderer/components/ide-sidebar.tsx'), 'utf8')

    expect(source).toContain("from '@tanstack/react-virtual'")
    expect(source).toContain('count: activity === \'files\' ? files.length : 0')
    expect(source).toContain('fileVirtualizer.getVirtualItems()')
    expect(source).toContain('ref={fileVirtualizer.measureElement}')
  })
})
