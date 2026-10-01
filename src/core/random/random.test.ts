import { describe, expect, it } from 'vitest'
import { createRng, createStreams, fnv1a32, isSeed, MAX_SEED, RANDOM_VERSION } from '.'

describe('core/random v1', () => {
  it('is version 1', () => expect(RANDOM_VERSION).toBe(1))

  it('fnv1a32 matches published FNV-1a reference values', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5)
    expect(fnv1a32('a')).toBe(0xe40c292c)
  })

  // Pinned outputs. If these change, every saved artwork changes: bump RANDOM_VERSION instead.
  it('produces pinned reference values', () => {
    const rng = createRng(0)
    expect(Array.from({ length: 5 }, () => rng.uint32())).toEqual([
      548183886, 1097162541, 2219297441, 1664216021, 3479288465,
    ])
    const geometry = createStreams(1).stream('geometry')
    expect(Array.from({ length: 5 }, () => geometry.uint32())).toEqual([
      1612034915, 276379557, 1974396439, 998609320, 2803638956,
    ])
  })

  it('named streams are independent: drawing color never shifts geometry', () => {
    const a = createStreams(42)
    const b = createStreams(42)
    const color = b.stream('color')
    for (let i = 0; i < 100; i++) color.next()
    const ga = a.stream('geometry'), gb = b.stream('geometry')
    for (let i = 0; i < 10; i++) expect(ga.uint32()).toBe(gb.uint32())
    expect(a.stream('color').uint32()).not.toBe(a.stream('geometry').uint32())
  })

  it('stays within requested ranges', () => {
    const rng = createRng(7)
    for (let i = 0; i < 10_000; i++) {
      const f = rng.next()
      expect(f >= 0 && f < 1).toBe(true)
      const n = rng.int(-2, 3)
      expect(Number.isInteger(n) && n >= -2 && n <= 3).toBe(true)
    }
  })

  it('validates seeds as uint32', () => {
    expect(isSeed(0)).toBe(true)
    expect(isSeed(MAX_SEED)).toBe(true)
    expect(isSeed(MAX_SEED + 1)).toBe(false)
    expect(isSeed(-1)).toBe(false)
    expect(isSeed(1.5)).toBe(false)
    expect(isSeed(NaN)).toBe(false)
  })
})
