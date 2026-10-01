// Identifies JPEG/PNG/WebP by their bytes (never by extension or claimed MIME
// type) and reads dimensions from the header, so oversized images are rejected
// before a full decode allocates memory.

export interface ImageHeader {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
  width: number
  height: number
  /** APNG or animated WebP: only the first frame will be used. */
  animated: boolean
}

const ascii = (b: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...b.subarray(at, at + length))
const u16be = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1]
const u32be = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
const u16le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8)
const u24le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)

function png(b: Uint8Array): ImageHeader | undefined {
  if (b.length < 24 || ascii(b, 12, 4) !== 'IHDR') return undefined
  let animated = false
  for (let at = 8; at + 8 <= b.length; ) {
    const type = ascii(b, at + 4, 4)
    if (type === 'acTL') animated = true
    if (type === 'IDAT') break
    at += 12 + u32be(b, at)
  }
  return { mediaType: 'image/png', width: u32be(b, 16), height: u32be(b, 20), animated }
}

function jpeg(b: Uint8Array): ImageHeader | undefined {
  for (let at = 2; at + 9 < b.length; ) {
    if (b[at] !== 0xff) return undefined
    const marker = b[at + 1]
    if (marker === 0xff) { at++; continue } // fill byte
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { at += 2; continue } // no length
    // SOF0–SOF15 except DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { mediaType: 'image/jpeg', height: u16be(b, at + 5), width: u16be(b, at + 7), animated: false }
    }
    at += 2 + u16be(b, at + 2)
  }
  return undefined
}

function webp(b: Uint8Array): ImageHeader | undefined {
  if (b.length < 30) return undefined
  const chunk = ascii(b, 12, 4)
  if (chunk === 'VP8 ') {
    return { mediaType: 'image/webp', width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff, animated: false }
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return undefined
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0
    return { mediaType: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, animated: false }
  }
  if (chunk === 'VP8X') {
    return { mediaType: 'image/webp', width: u24le(b, 24) + 1, height: u24le(b, 27) + 1, animated: (b[20] & 0x02) !== 0 }
  }
  return undefined
}

/** Undefined for anything that is not a readable JPEG, PNG or WebP header. */
export function sniffImage(bytes: Uint8Array): ImageHeader | undefined {
  const b = bytes
  const header =
    b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' ? png(b)
    : b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? jpeg(b)
    : ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP' ? webp(b)
    : undefined
  return header && header.width > 0 && header.height > 0 ? header : undefined
}
