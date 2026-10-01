import { linearSrgbToOklab, relativeLuminance, SRGB8_TO_LINEAR } from '../../../core/color/oklab'
import { createRng, type Rng } from '../../../core/random'
import type { Palette, Swatch } from '../../../core/resources/palette'
import type { SpatialCell, SpatialColor } from '../../../core/resources/spatialColor'

// Deterministic palette + spatial analysis of normalized sRGB pixels.
// Changing any result here means bumping ANALYSIS_VERSION.
//
// v1: visible pixels (alpha > 0) weighted by alpha; ≤ maxSamples taken at even
// index strides; seeded weighted k-means++ in OKLab (a candidate must be at
// least MIN_SEPARATION from every chosen centroid, so uniform images yield
// fewer swatches instead of duplicates); Lloyd iterations with ties going to
// the lower cluster index and empty clusters keeping their centroid; then every
// visible pixel is assigned. Swatches ordered by weight desc, then L desc.

export const ANALYSIS_VERSION = '1'
export const MIN_SEPARATION = 0.02

export interface AnalysisConfig {
  colors: number
  seed: number
  maxSamples: number
  maxIterations: number
  tolerance: number
  gridWidth: number
  gridHeight: number
}

export const DEFAULT_ANALYSIS: AnalysisConfig = {
  colors: 6,
  seed: 1,
  maxSamples: 20_000,
  maxIterations: 30,
  tolerance: 1e-4,
  gridWidth: 3,
  gridHeight: 3,
}

export interface Pixels {
  width: number
  height: number
  /** RGBA, not premultiplied, sRGB. */
  data: Uint8ClampedArray
}

export type AnalysisResult = { kind: 'ok'; palette: Palette; spatial: SpatialColor } | { kind: 'empty' }

type Lab = [number, number, number]

const dist2 = (L: number, a: number, b: number, c: Lab) => (L - c[0]) ** 2 + (a - c[1]) ** 2 + (b - c[2]) ** 2

function nearest(L: number, a: number, b: number, centroids: Lab[]): number {
  let best = 0
  let bestD = Infinity
  for (let k = 0; k < centroids.length; k++) {
    const d = dist2(L, a, b, centroids[k])
    if (d < bestD) { bestD = d; best = k } // strict: ties keep the lower index
  }
  return best
}

function weightedIndex(weights: Float64Array, total: number, rng: Rng): number {
  let r = rng.next() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r < 0) return i
  }
  for (let i = weights.length - 1; i >= 0; i--) if (weights[i] > 0) return i
  return 0
}

export function analyze({ width, height, data }: Pixels, config: AnalysisConfig): AnalysisResult {
  const n = width * height
  const L = new Float64Array(n), A = new Float64Array(n), B = new Float64Array(n)
  const Y = new Float64Array(n), W = new Float64Array(n)
  const visible: number[] = []
  for (let i = 0; i < n; i++) {
    const alpha = data[i * 4 + 3]
    if (alpha === 0) continue
    const linear: [number, number, number] = [
      SRGB8_TO_LINEAR[data[i * 4]], SRGB8_TO_LINEAR[data[i * 4 + 1]], SRGB8_TO_LINEAR[data[i * 4 + 2]],
    ]
    const lab = linearSrgbToOklab(linear)
    L[i] = lab.L; A[i] = lab.a; B[i] = lab.b
    Y[i] = relativeLuminance(linear)
    W[i] = alpha / 255
    visible.push(i)
  }
  if (visible.length === 0) return { kind: 'empty' }

  // Deterministic sample.
  const sampleCount = Math.min(visible.length, config.maxSamples)
  const samples = Array.from({ length: sampleCount }, (_, j) => visible[Math.floor((j * visible.length) / sampleCount)])

  // Weighted k-means++ initialization.
  const rng = createRng(config.seed)
  const sw = Float64Array.from(samples, (i) => W[i])
  const centroids: Lab[] = []
  const first = samples[weightedIndex(sw, sw.reduce((s, w) => s + w, 0), rng)]
  centroids.push([L[first], A[first], B[first]])
  const d2 = Float64Array.from(samples, (i) => dist2(L[i], A[i], B[i], centroids[0]))
  const minD2 = MIN_SEPARATION ** 2
  while (centroids.length < config.colors) {
    const candidate = Float64Array.from(samples, (_, j) => (d2[j] > minD2 ? sw[j] * d2[j] : 0))
    const total = candidate.reduce((s, w) => s + w, 0)
    if (total === 0) break
    const pick = samples[weightedIndex(candidate, total, rng)]
    const c: Lab = [L[pick], A[pick], B[pick]]
    centroids.push(c)
    samples.forEach((i, j) => (d2[j] = Math.min(d2[j], dist2(L[i], A[i], B[i], c))))
  }

  // Lloyd iterations on the samples.
  const k = centroids.length
  for (let iter = 0; iter < config.maxIterations; iter++) {
    const sum = Array.from({ length: k }, () => [0, 0, 0, 0])
    for (const i of samples) {
      const s = sum[nearest(L[i], A[i], B[i], centroids)]
      s[0] += W[i] * L[i]; s[1] += W[i] * A[i]; s[2] += W[i] * B[i]; s[3] += W[i]
    }
    let moved = 0
    for (let c = 0; c < k; c++) {
      const [sl, sa, sb, w] = sum[c]
      if (w === 0) continue // empty cluster keeps its centroid
      const next: Lab = [sl / w, sa / w, sb / w]
      moved = Math.max(moved, dist2(next[0], next[1], next[2], centroids[c]))
      centroids[c] = next
    }
    if (moved < config.tolerance ** 2) break
  }

  // Assign every visible pixel; accumulate palette and grid statistics.
  const { gridWidth: gw, gridHeight: gh } = config
  const clusterWeight = new Float64Array(k)
  const cells = Array.from({ length: gw * gh }, () => ({
    pixels: 0, w: 0, l: 0, a: 0, b: 0, y: 0, y2: 0, perCluster: new Float64Array(k),
  }))
  for (let i = 0; i < n; i++) {
    const x = i % width, row = Math.floor(i / width)
    const cell = cells[Math.floor((row * gh) / height) * gw + Math.floor((x * gw) / width)]
    cell.pixels++
    const w = W[i]
    if (w === 0) continue
    const c = nearest(L[i], A[i], B[i], centroids)
    clusterWeight[c] += w
    cell.w += w; cell.l += w * L[i]; cell.a += w * A[i]; cell.b += w * B[i]
    cell.y += w * Y[i]; cell.y2 += w * Y[i] * Y[i]
    cell.perCluster[c] += w
  }

  const totalWeight = clusterWeight.reduce((s, w) => s + w, 0)
  const order = centroids
    .map((_, c) => c)
    .filter((c) => clusterWeight[c] > 0)
    .sort((p, q) => clusterWeight[q] - clusterWeight[p] || centroids[q][0] - centroids[p][0])
  const idOf = new Map(order.map((c, rank) => [c, `c${rank + 1}`]))
  const swatches: Swatch[] = order.map((c) => ({
    swatchId: idOf.get(c)!,
    color: { L: centroids[c][0], a: centroids[c][1], b: centroids[c][2] },
    weight: clusterWeight[c] / totalWeight,
  }))

  const spatialCells: SpatialCell[] = cells.map((cell) => {
    if (cell.w === 0) return { luminance: 0, luminanceStd: 0, visibleWeight: 0 }
    const mean = cell.y / cell.w
    let dominant = order[0]
    for (const c of order) if (cell.perCluster[c] > cell.perCluster[dominant]) dominant = c
    return {
      color: { L: cell.l / cell.w, a: cell.a / cell.w, b: cell.b / cell.w },
      luminance: mean,
      luminanceStd: Math.sqrt(Math.max(0, cell.y2 / cell.w - mean * mean)),
      dominantSwatchId: idOf.get(dominant),
      visibleWeight: cell.w / cell.pixels,
    }
  })
  const lit = spatialCells.map((c, i) => [c, i] as const).filter(([c]) => c.visibleWeight > 0)
  const brightestCell = lit.reduce((best, cur) => (cur[0].luminance > best[0].luminance ? cur : best))[1]
  const darkestCell = lit.reduce((best, cur) => (cur[0].luminance < best[0].luminance ? cur : best))[1]

  return {
    kind: 'ok',
    palette: { swatches },
    spatial: {
      gridWidth: gw,
      gridHeight: gh,
      cells: spatialCells,
      tonalSpread: tonalSpread(visible, Y, W),
      brightestCell,
      darkestCell,
    },
  }
}

/** 95th − 5th weighted luminance percentile. */
function tonalSpread(indices: number[], Y: Float64Array, W: Float64Array): number {
  const sorted = [...indices].sort((i, j) => Y[i] - Y[j] || i - j)
  const total = sorted.reduce((s, i) => s + W[i], 0)
  const percentile = (p: number) => {
    let acc = 0
    for (const i of sorted) {
      acc += W[i]
      if (acc >= p * total) return Y[i]
    }
    return Y[sorted[sorted.length - 1]]
  }
  return percentile(0.95) - percentile(0.05)
}
