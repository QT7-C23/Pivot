import { describe, expect, it } from 'vitest'
import { createPivotTrayIconDataUrl } from '../../src/main/services/tray-icon'

describe('tray icon contract', () => {
  it('uses an embedded PNG that Electron can decode on Windows', () => {
    const dataUrl = createPivotTrayIconDataUrl()
    expect(dataUrl).toMatch(/^data:image\/png;base64,/)

    const bytes = Buffer.from(dataUrl.split(',')[1]!, 'base64')
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  })
})
