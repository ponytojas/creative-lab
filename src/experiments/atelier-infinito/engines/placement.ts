import type { Point } from '../../../core/export/svg'
import type { Rng } from '../../../core/random'
import type { SpatialColor } from '../../../core/resources/spatialColor'

// First spatial mapping: darker source regions attract more starting points.
//
// v1: cell luminance is normalized to the image's own range (darkest cell = 1,
// brightest = 0; cells without visible pixels count as brightest) and sampled
// bilinearly between cell centers, with the image stretched to the artboard.
// Seeds use rejection sampling: accept with probability 1 − strength·(1 − darkness),
// at most MAX_ATTEMPTS tries, then the last uniform candidate is used.
// Strength 0, no map, or a map with no luminance range = plain uniform placement,
// drawing exactly the same random numbers as having no map at all.

export const MAX_ATTEMPTS = 24

/** Darkness in [0, 1] at normalized coordinates, or undefined when the map is flat. */
export function darknessField(spatial: SpatialColor): ((u: number, v: number) => number) | undefined {
  const { gridWidth: gw, gridHeight: gh, cells } = spatial
  const lum = cells.map((c) => (c.visibleWeight > 0 ? c.luminance : Number.NaN))
  const visible = lum.filter((l) => !Number.isNaN(l))
  if (visible.length === 0) return undefined
  const min = Math.min(...visible), max = Math.max(...visible)
  if (max - min < 1e-6) return undefined
  const dark = lum.map((l) => (Number.isNaN(l) ? 0 : 1 - (l - min) / (max - min)))
  const at = (cx: number, cy: number) => dark[cy * gw + cx]

  return (u, v) => {
    // Cell centers sit at (i + 0.5) / gw; clamp outside the outermost centers.
    const x = Math.min(gw - 1, Math.max(0, u * gw - 0.5))
    const y = Math.min(gh - 1, Math.max(0, v * gh - 0.5))
    const x0 = Math.floor(x), y0 = Math.floor(y)
    const x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1)
    const tx = x - x0, ty = y - y0
    const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx
    const bottom = at(x0, y1) * (1 - tx) + at(x1, y1) * tx
    return top * (1 - ty) + bottom * ty
  }
}

export function placeSeeds(
  count: number,
  artboard: { width: number; height: number },
  rng: Rng,
  darkness: ((u: number, v: number) => number) | undefined,
  strength: number,
): Point[] {
  const { width: w, height: h } = artboard
  const seeds: Point[] = []
  for (let i = 0; i < count; i++) {
    let x = rng.range(0, w), y = rng.range(0, h)
    if (darkness && strength > 0) {
      for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
        if (rng.next() < 1 - strength * (1 - darkness(x / w, y / h))) break
        x = rng.range(0, w)
        y = rng.range(0, h)
      }
    }
    seeds.push([x, y])
  }
  return seeds
}
