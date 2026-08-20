import { describe, expect, it } from 'vitest'
import { resolveUserDataPath } from '../../src/main/services/user-data-path'

describe('user-data path policy', () => {
  it('uses a clean LocalAppData directory on Windows', () => {
    expect(
      resolveUserDataPath(
        { LOCALAPPDATA: 'C:\\Users\\PivotUser\\AppData\\Local' },
        'win32',
        'C:\\Users\\PivotUser\\AppData\\Roaming\\pivot',
      ),
    ).toBe('C:\\Users\\PivotUser\\AppData\\Local\\Pivot')
  })

  it('honors the isolated E2E user-data directory first', () => {
    expect(
      resolveUserDataPath(
        {
          LOCALAPPDATA: 'C:\\Users\\PivotUser\\AppData\\Local',
          PIVOT_E2E_USER_DATA: 'D:\\Pivot\\e2e-data',
        },
        'win32',
        'C:\\Users\\PivotUser\\AppData\\Roaming\\pivot',
      ),
    ).toBe('D:\\Pivot\\e2e-data')
  })

  it('keeps the Electron default outside Windows', () => {
    expect(resolveUserDataPath({}, 'linux', '/home/pivot/.config/pivot')).toBe(
      '/home/pivot/.config/pivot',
    )
  })
})
