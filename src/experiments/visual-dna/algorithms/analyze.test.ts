import { describe, expect, it } from 'vitest'
import { oklabToHex } from '../../../core/color/oklab'
import { spatialColorPayloadSchema } from '../../../core/resources/spatialColor'
import { analyze, DEFAULT_ANALYSIS, type Pixels } from './analyze'

type RGBA = [number, number, number, number]

/** Builds an image where `paint(x, y)` gives each pixel. */
function image(width: number, height: number, paint: (x: number, y: number) => RGBA): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4)
  return { width, height, data }
}

const RED: RGBA = [255, 0, 0, 255]
const BLUE: RGBA = [0, 0, 255, 255]
const hexes = (r: ReturnType<typeof analyze>) =>
  r.kind === 'ok' ? r.palette.swatches.map((s) => [oklabToHex(s.color), Number(s.weight.toFixed(4))]) : r.kind

describe('Visual DNA analysis v1', () => {
  it('a flat image yields one swatch, not duplicates', () => {
    const result = analyze(image(40, 30, () => [200, 120, 40, 255]), { ...DEFAULT_ANALYSIS, colors: 8 })
    expect(hexes(result)).toEqual([['#c87828', 1]])
  })

  it('a limited-color image yields exactly its colors with proportions', () => {
    // Quadrants: red 1/2 (top), blue 1/4, yellow 1/4.
    const px = image(40, 40, (x, y) => (y < 20 ? RED : x < 20 ? BLUE : [255, 255, 0, 255]))
    expect(hexes(analyze(px, { ...DEFAULT_ANALYSIS, colors: 8 }))).toEqual([
      ['#ff0000', 0.5],
      ['#ffff00', 0.25],
      ['#0000ff', 0.25],
    ])
  })

  // Pinned output: if this changes, bump ANALYSIS_VERSION (saved palettes stay as they were).
  it('matches the pinned v1 palette for a gradient fixture', () => {
    const px = image(64, 64, (x, y) => [(x * 4) % 256, (y * 4) % 256, (x * y) % 256, 255])
    expect(hexes(analyze(px, DEFAULT_ANALYSIS))).toMatchInlineSnapshot(`
      [
        [
          "#8fdd6b",
          0.2195,
        ],
        [
          "#ce4b75",
          0.1833,
        ],
        [
          "#aab7bf",
          0.1599,
        ],
        [
          "#5e8a52",
          0.1541,
        ],
        [
          "#6f53c4",
          0.1489,
        ],
        [
          "#3f2c36",
          0.1343,
        ],
      ]
    `)
  })

  it('is deterministic', () => {
    const px = image(64, 64, (x, y) => [(x * 4) % 256, (y * 4) % 256, (x * y) % 256, 255])
    expect(analyze(px, DEFAULT_ANALYSIS)).toEqual(analyze(px, DEFAULT_ANALYSIS))
  })

  it('respects the requested number of colors and normalizes weights', () => {
    const px = image(64, 64, (x, y) => [(x * 4) % 256, (y * 4) % 256, 128, 255])
    for (const colors of [2, 5, 8]) {
      const result = analyze(px, { ...DEFAULT_ANALYSIS, colors })
      if (result.kind !== 'ok') throw new Error('expected ok')
      expect(result.palette.swatches).toHaveLength(colors)
      expect(result.palette.swatches.reduce((s, w) => s + w.weight, 0)).toBeCloseTo(1, 10)
    }
  })

  it('ignores transparent pixels and weights partial alpha', () => {
    // 1/4 opaque red, 3/4 blue at alpha 85 (1/3): equal visible weight; plus a transparent row.
    const px = image(4, 5, (x, y) => (y === 4 ? [0, 255, 0, 0] : x === 0 ? RED : [0, 0, 255, 85]))
    expect(hexes(analyze(px, DEFAULT_ANALYSIS))).toEqual([
      ['#ff0000', 0.5],
      ['#0000ff', 0.5],
    ])
  })

  it('a fully transparent image is an empty result', () => {
    expect(analyze(image(8, 8, () => [10, 20, 30, 0]), DEFAULT_ANALYSIS)).toEqual({ kind: 'empty' })
  })

  it('computes spatial statistics on a grid that is data, not a constant', () => {
    // Left 2/3 black, right 1/3 white.
    const px = image(60, 40, (x) => (x < 40 ? [0, 0, 0, 255] : [255, 255, 255, 255]))
    const result = analyze(px, { ...DEFAULT_ANALYSIS, gridWidth: 3, gridHeight: 2 })
    if (result.kind !== 'ok') throw new Error('expected ok')
    const { spatial, palette } = result
    expect(spatialColorPayloadSchema.safeParse(spatial).success).toBe(true)
    expect(spatial.cells).toHaveLength(6)
    expect(spatial.brightestCell).toBe(2)
    expect(spatial.darkestCell).toBe(0)
    expect(spatial.cells[2].luminance).toBeCloseTo(1, 6)
    expect(spatial.cells[0].luminance).toBe(0)
    expect(spatial.cells[2].dominantSwatchId).toBe(palette.swatches.find((s) => s.color.L > 0.5)?.swatchId)
    expect(spatial.cells.every((c) => c.visibleWeight === 1 && c.luminanceStd < 1e-9)).toBe(true)
    expect(spatial.tonalSpread).toBeCloseTo(1, 6)
  })

  it('cell contrast reflects mixed luminance; empty cells are marked', () => {
    const px = image(20, 10, (x, y) => (x >= 10 ? [0, 0, 0, 0] : (x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]))
    const result = analyze(px, { ...DEFAULT_ANALYSIS, gridWidth: 2, gridHeight: 1 })
    if (result.kind !== 'ok') throw new Error('expected ok')
    expect(result.spatial.cells[0].luminanceStd).toBeCloseTo(0.5, 6)
    expect(result.spatial.cells[1]).toEqual({ luminance: 0, luminanceStd: 0, visibleWeight: 0 })
  })
})
