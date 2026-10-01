import { describe, expect, it } from 'vitest'
import { defaults, schema, type ParameterSpecs } from '.'

const specs = {
  count: { kind: 'integer', label: 'Count', default: 10, min: 1, max: 20, mutationScale: 2 },
  size: { kind: 'number', label: 'Size', default: 1, min: 0.1, max: 10, step: 0.1, scale: 'log', mutationScale: 0.2 },
  turn: { kind: 'angle', label: 'Turn', default: 0, mutationScale: 0.1 },
  mode: { kind: 'enum', label: 'Mode', default: 'a', options: ['a', 'b'] },
  on: { kind: 'boolean', label: 'On', default: true },
} as const satisfies ParameterSpecs

describe('core/parameters', () => {
  it('derives defaults', () => {
    expect(defaults(specs)).toEqual({ count: 10, size: 1, turn: 0, mode: 'a', on: true })
  })

  it('fills missing values with defaults and drops unknown keys', () => {
    expect(schema(specs).parse({ count: 3, extra: 1 })).toEqual({ count: 3, size: 1, turn: 0, mode: 'a', on: true })
  })

  it('normalizes numbers: clamp, round integers, wrap angles', () => {
    const p = schema(specs).parse({ count: 25.4, size: 0, turn: -Math.PI / 2 })
    expect(p.count).toBe(20)
    expect(p.size).toBe(0.1)
    expect(p.turn).toBeCloseTo((3 * Math.PI) / 2)
    expect(schema(specs).parse({ count: 4.6 }).count).toBe(5)
  })

  it('rejects wrong types and unknown enum options', () => {
    expect(schema(specs).safeParse({ count: '3' }).success).toBe(false)
    expect(schema(specs).safeParse({ size: Infinity }).success).toBe(false)
    expect(schema(specs).safeParse({ mode: 'c' }).success).toBe(false)
    expect(schema(specs).safeParse({ on: 1 }).success).toBe(false)
  })

  it('accepts its own defaults unchanged', () => {
    expect(schema(specs).parse(defaults(specs))).toEqual(defaults(specs))
  })
})
