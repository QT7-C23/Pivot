import { deflateRawSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

export interface ZipFixtureEntry {
  readonly data?: Buffer | string
  readonly externalFileAttributes?: number
  readonly fileName: string
  readonly flags?: number
  readonly method?: 0 | 8 | number
  readonly uncompressedSize?: number
  readonly versionMadeByPlatform?: number
}

export function writeZipFixture(filePath: string, entries: readonly ZipFixtureEntry[]): void {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let localOffset = 0

  for (const input of entries) {
    const fileName = Buffer.from(input.fileName, 'utf8')
    const data = Buffer.isBuffer(input.data) ? input.data : Buffer.from(input.data ?? '')
    const method = input.method ?? 0
    const compressed = method === 8 ? deflateRawSync(data) : data
    const flags = (input.flags ?? 0) | 0x0800
    const crc = crc32(data)
    const declaredSize = input.uncompressedSize ?? data.byteLength

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(flags, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.byteLength, 18)
    local.writeUInt32LE(declaredSize, 22)
    local.writeUInt16LE(fileName.byteLength, 26)
    localParts.push(local, fileName, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(((input.versionMadeByPlatform ?? 3) << 8) | 20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(flags, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.byteLength, 20)
    central.writeUInt32LE(declaredSize, 24)
    central.writeUInt16LE(fileName.byteLength, 28)
    central.writeUInt32LE(input.externalFileAttributes ?? defaultAttributes(input.fileName), 38)
    central.writeUInt32LE(localOffset, 42)
    centralParts.push(central, fileName)
    localOffset += local.byteLength + fileName.byteLength + compressed.byteLength
  }

  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralDirectory.byteLength, 12)
  end.writeUInt32LE(localOffset, 16)
  writeFileSync(filePath, Buffer.concat([...localParts, centralDirectory, end]))
}

export function unixModeAttributes(mode: number): number {
  return (mode << 16) >>> 0
}

function defaultAttributes(fileName: string): number {
  return unixModeAttributes(fileName.endsWith('/') ? 0o040755 : 0o100644)
}

function crc32(input: Buffer): number {
  let crc = 0xffffffff
  for (const byte of input) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
