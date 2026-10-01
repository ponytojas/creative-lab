import { describe, expect, it } from 'vitest'
import { defaults, schema } from '../../../core/parameters'
import { DEFAULT_SEED, getEngine, renderComposition } from '../render'
import { radialFields } from './radialFields'

const params = defaults(radialFields.parameters)
const renderRadialFields = (seed: number, p: typeof params) => renderComposition(getEngine('radial-fields')!, seed, p)

describe('Radial Fields v1', () => {
  // Golden file: an intentional change to the engine, palette, PRNG or serializer
  // must bump the matching version and regenerate with `pnpm test -u`.
  it('default recipe matches the golden SVG byte for byte', async () => {
    expect(radialFields.version).toBe('1')
    await expect(renderRadialFields(DEFAULT_SEED, params)).toMatchFileSnapshot(
      './__golden__/radial-fields-v1-default.svg',
    )
  })

  it('same recipe -> identical output; different seed -> different output', () => {
    const a = renderRadialFields(123, params)
    expect(renderRadialFields(123, params)).toBe(a)
    expect(renderRadialFields(124, params)).not.toBe(a)
  })

  it('palette mapping only changes colors, never geometry', () => {
    const geometry = (svg: string) => svg.replace(/stroke="#[0-9a-f]{6}"/g, '')
    const weighted = renderRadialFields(5, { ...params, paletteMapping: 'weighted' })
    const sequential = renderRadialFields(5, { ...params, paletteMapping: 'sequential' })
    expect(sequential).not.toBe(weighted)
    expect(geometry(sequential)).toBe(geometry(weighted))
  })

  it('stays within bounds and vertex limits at the extremes', () => {
    const specs = radialFields.parameters
    const max = schema(specs).parse({
      ringCount: specs.ringCount.max, repetition: specs.repetition.max, amplitude: 1, jitter: 1,
      frequency: specs.frequency.max, strokeWidth: specs.strokeWidth.max,
    })
    const svg = renderRadialFields(9, max)
    expect(svg).not.toMatch(/NaN|Infinity/)
    expect((svg.match(/L/g) ?? []).length).toBeLessThan(70_000)
  })

  it('primary controls exist and are a subset of parameters', () => {
    expect(radialFields.primary.length).toBeGreaterThanOrEqual(3)
    expect(radialFields.primary.length).toBeLessThanOrEqual(4)
    for (const key of radialFields.primary) expect(radialFields.parameters).toHaveProperty(key)
  })
})
