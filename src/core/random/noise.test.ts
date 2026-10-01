import { describe, expect, it } from 'vitest'
import { createRng } from '.'
import { createNoise2D, fbm, NOISE_VERSION } from './noise'

describe('core/random noise v1', () => {
  const noise = createNoise2D(createRng(1))

  it('is version 1', () => expect(NOISE_VERSION).toBe(1))

  // Pinned values: if these change, saved Flow Field artworks change. Bump NOISE_VERSION instead.
  it('produces pinned reference values', () => {
    expect([noise(0.5, 0.5), noise(1.3, 7.9), noise(-4.2, 2.25), fbm(noise, 3.7, 1.1, 3)].map((v) => v.toFixed(6)))
      .toMatchInlineSnapshot(`
        [
          "0.250000",
          "0.322350",
          "-0.024583",
          "-0.247512",
        ]
      `)
  })

  it('is zero on lattice points, bounded, continuous and seed-dependent', () => {
    expect(noise(3, 5)).toBeCloseTo(0, 12)
    for (let i = 0; i < 2000; i++) {
      const x = i * 0.137, y = i * 0.071
      const v = noise(x, y)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
      expect(Math.abs(noise(x + 1e-4, y) - v)).toBeLessThan(1e-3)
    }
    expect(createNoise2D(createRng(2))(0.5, 0.5)).not.toBe(noise(0.5, 0.5))
  })
})
