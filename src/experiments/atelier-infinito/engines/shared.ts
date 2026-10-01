import type { Rng } from '../../../core/random'
import type { Swatch } from '../../../core/resources/palette'

export const BACKGROUNDS = { light: '#f4f0e8', dark: '#141418' } as const

/** Picks a swatch with probability proportional to its weight (one draw). */
export function weightedPick(swatches: readonly Swatch[], rng: Rng): Swatch {
  const total = swatches.reduce((sum, s) => sum + s.weight, 0)
  let r = rng.next() * total
  for (const swatch of swatches) {
    r -= swatch.weight
    if (r < 0) return swatch
  }
  return swatches[swatches.length - 1]
}
