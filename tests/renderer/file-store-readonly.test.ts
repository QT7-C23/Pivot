import { describe, expect, it } from 'vitest'
import { useFileStore } from '../../src/renderer/stores/file.store'

describe('file preview boundary', () => {
  it('does not expose direct draft or save operations from the renderer file store', () => {
    const state = useFileStore.getState() as unknown as Record<string, unknown>

    expect(state).not.toHaveProperty('activeFileDraft')
    expect(state).not.toHaveProperty('updateDraft')
    expect(state).not.toHaveProperty('saveActiveFile')
  })
})
