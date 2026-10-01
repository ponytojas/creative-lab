import { describe, expect, it } from 'vitest'
import { defaults, schema } from '../../../core/parameters'
import type { SpatialColor } from '../../../core/resources/spatialColor'
import { DEFAULT_PALETTE } from '../palette'
import { DEFAULT_SEED, getEngine, renderComposition } from '../render'
import { flowField } from './flowField'

const engine = getEngine('flow-field')!
const params = defaults(flowField.parameters)
const render = (seed: number, p: Record<string, unknown>, spatial?: SpatialColor) =>
  renderComposition(engine, seed, p as typeof params, { palette: DEFAULT_PALETTE, spatial })

/** Left half black, right half white, as an 8×8 grid. */
const leftDark: SpatialColor = {
  gridWidth: 8, gridHeight: 8, tonalSpread: 1, brightestCell: 7, darkestCell: 0,
  cells: Array.from({ length: 64 }, (_, i) => ({ luminance: i % 8 < 4 ? 0 : 1, luminanceStd: 0, visibleWeight: 1 })),
}
const startsX = (svg: string) => [...svg.matchAll(/d="M([\d.]+) /g)].map((m) => Number(m[1]))

describe('Flow Field v1', () => {
  it('default recipe matches the golden SVG byte for byte', async () => {
    expect(flowField.version).toBe('1')
    await expect(render(DEFAULT_SEED, params)).toMatchFileSnapshot('./__golden__/flow-field-v1-default.svg')
  })

  it('same recipe -> identical output; different seed -> different output', () => {
    expect(render(3, params)).toBe(render(3, params))
    expect(render(4, params)).not.toBe(render(3, params))
  })

  it('image influence 0 equals having no image map, exactly', () => {
    const off = { ...params, imageInfluence: 0 }
    expect(render(11, off, leftDark)).toBe(render(11, off))
  })

  it('darker source regions attract more starting points', () => {
    const p = { ...params, imageInfluence: 1, lineLength: 5 }
    const withMap = startsX(render(11, p, leftDark))
    const without = startsX(render(11, p))
    const leftShare = (xs: number[]) => xs.filter((x) => x < 500).length / xs.length
    expect(leftShare(without)).toBeGreaterThan(0.4)
    expect(leftShare(without)).toBeLessThan(0.6)
    expect(leftShare(withMap)).toBeGreaterThan(0.9)
  })

  it('a flat map falls back to uniform placement', () => {
    const flat = { ...leftDark, cells: leftDark.cells.map((c) => ({ ...c, luminance: 0.5 })) }
    expect(render(5, params, flat)).toBe(render(5, params))
  })

  it('stops at the vertex limit at the extremes and stays finite', () => {
    const specs = flowField.parameters
    const max = schema(specs).parse({ lineCount: specs.lineCount.max, lineLength: specs.lineLength.max, stepLength: 1 })
    const svg = render(9, max)
    expect(svg).not.toMatch(/NaN|Infinity/)
    expect((svg.match(/[ML]/g) ?? []).length).toBeLessThanOrEqual(60_000)
  })

  it('lines never leave the artboard', () => {
    const coords = [...render(2, { ...params, lineLength: 300 }).matchAll(/[ML]([-\d.]+) ([-\d.]+)/g)]
    for (const [, x, y] of coords) {
      expect(Number(x)).toBeGreaterThanOrEqual(0)
      expect(Number(x)).toBeLessThanOrEqual(1000)
      expect(Number(y)).toBeGreaterThanOrEqual(0)
      expect(Number(y)).toBeLessThanOrEqual(1000)
    }
  })
})
