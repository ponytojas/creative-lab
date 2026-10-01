import type { Rng } from '.'

// Seeded 2D gradient noise (Perlin, quintic fade) implemented in-repo so its
// output never changes with a dependency update. Changing output means bumping
// NOISE_VERSION and keeping the old implementation for saved recipes.
//
// v1: permutation = Fisher–Yates shuffle of 0..255 driven by the given Rng;
// 8 unit gradients at multiples of 45°; output scaled by √2 and clamped to [-1, 1].

export const NOISE_VERSION = 1

export type Noise2D = (x: number, y: number) => number

const GRADIENTS = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)])
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a: number, b: number, t: number) => a + t * (b - a)

export function createNoise2D(rng: Rng): Noise2D {
  const p = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = rng.int(0, i)
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  const perm = Uint8Array.from({ length: 512 }, (_, i) => p[i & 255])
  const corner = (ix: number, iy: number, dx: number, dy: number) => {
    const [gx, gy] = GRADIENTS[perm[(ix & 255) + perm[iy & 255]] & 7]
    return gx * dx + gy * dy
  }
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y)
    const dx = x - x0, dy = y - y0
    const u = fade(dx), v = fade(dy)
    const value = lerp(
      lerp(corner(x0, y0, dx, dy), corner(x0 + 1, y0, dx - 1, dy), u),
      lerp(corner(x0, y0 + 1, dx, dy - 1), corner(x0 + 1, y0 + 1, dx - 1, dy - 1), u),
      v,
    )
    return Math.max(-1, Math.min(1, value * Math.SQRT2))
  }
}

/** Fractal sum of octaves (each double frequency, half amplitude), normalized to [-1, 1]. */
export function fbm(noise: Noise2D, x: number, y: number, octaves: number): number {
  let sum = 0, amplitude = 1, total = 0, frequency = 1
  for (let o = 0; o < octaves; o++) {
    sum += amplitude * noise(x * frequency, y * frequency)
    total += amplitude
    amplitude /= 2
    frequency *= 2
  }
  return sum / total
}
