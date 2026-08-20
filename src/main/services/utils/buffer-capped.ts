export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

export function utf8Prefix(value: string, maxBytes: number): string {
  let bytes = 0
  let result = ''
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8')
    if (bytes + characterBytes > maxBytes) break
    bytes += characterBytes
    result += character
  }
  return result
}

export function appendCapped(current: string, chunk: string, maxBytes: number): { truncated: boolean; value: string } {
  if (utf8ByteLength(current) >= maxBytes) {
    return { truncated: true, value: current }
  }

  const next = current + chunk
  if (utf8ByteLength(next) <= maxBytes) {
    return { truncated: false, value: next }
  }

  return {
    truncated: true,
    value: current + utf8Prefix(chunk, maxBytes - utf8ByteLength(current)),
  }
}
