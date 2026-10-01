import { describe, expect, it } from 'vitest'
import { sniffImage } from './sniff'

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)))
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255]

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const chunk = (type: string, data: number[]) => [...be32(data.length), ...bytes(type), ...data, 0, 0, 0, 0]
const ihdr = (w: number, h: number) => chunk('IHDR', [...be32(w), ...be32(h), 8, 6, 0, 0, 0])

describe('sniffImage', () => {
  it('reads PNG dimensions and detects APNG', () => {
    expect(sniffImage(bytes(PNG_SIG, ihdr(640, 480), chunk('IDAT', [0])))).toEqual({
      mediaType: 'image/png', width: 640, height: 480, animated: false,
    })
    expect(sniffImage(bytes(PNG_SIG, ihdr(10, 10), chunk('acTL', [0, 0, 0, 2, 0, 0, 0, 0]), chunk('IDAT', [0])))?.animated).toBe(true)
  })

  it('reads JPEG dimensions after APP segments', () => {
    const app0 = [0xff, 0xe0, 0, 6, ...bytes('JFIF')]
    const sof0 = [0xff, 0xc0, 0, 11, 8, ...[0x03, 0x20], ...[0x04, 0xb0], 3, 0, 0, 0]
    expect(sniffImage(bytes([0xff, 0xd8], app0, sof0))).toEqual({ mediaType: 'image/jpeg', width: 1200, height: 800, animated: false })
  })

  it('reads WebP lossy, lossless and extended headers', () => {
    const riff = (chunkType: string, data: number[]) => bytes('RIFF', le32(4 + 8 + data.length), 'WEBP', chunkType, le32(data.length), data)
    const lossy = riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0x20, 0x03, 0x58, 0x02, 0, 0])
    expect(sniffImage(lossy)).toMatchObject({ width: 800, height: 600, animated: false })
    const bits = (300 - 1) | ((200 - 1) << 14)
    expect(sniffImage(riff('VP8L', [0x2f, ...le32(bits), 0, 0, 0, 0, 0]))).toMatchObject({ width: 300, height: 200 })
    const vp8x = (flags: number) => riff('VP8X', [flags, 0, 0, 0, ...le24(4095), ...le24(2047), 0, 0])
    expect(sniffImage(vp8x(0x02))).toMatchObject({ width: 4096, height: 2048, animated: true })
    expect(sniffImage(vp8x(0))?.animated).toBe(false)
  })

  it('rejects other formats and truncated headers', () => {
    expect(sniffImage(bytes('GIF89a', [1, 0, 1, 0]))).toBeUndefined()
    expect(sniffImage(bytes('<svg></svg>'))).toBeUndefined()
    expect(sniffImage(bytes(PNG_SIG))).toBeUndefined()
    expect(sniffImage(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 2]))).toBeUndefined()
    expect(sniffImage(new Uint8Array())).toBeUndefined()
  })
})
