import { describe, expect, it } from 'vitest'
import type { ParameterSpecs } from '.'
import { createRng } from '../random'
import { wander, wanderCurves } from './wander'

const specs = {
  count: { kind: 'integer', label: 'Count', default: 10, min: 1, max: 20, mutationScale: 2 },
  size: { kind: 'number', label: 'Size', default: 1, min: 0.1, max: 10, step: 0.1, scale: 'log', mutationScale: 0.2 },
  amount: { kind: 'number', label: 'Amount', default: 0.99, min: 0, max: 1, step: 0.01, scale: 'linear', mutationScale: 0.1 },
  turn: { kind: 'angle', label: 'Turn', default: 0, mutationScale: 0.1 },
  mode: { kind: 'enum', label: 'Mode', default: 'a', options: ['a', 'b'] },
} as const satisfies ParameterSpecs

const start = { count: 10, size: 1, amount: 0.99, turn: 0, mode: 'a' }
const curves = wanderCurves(specs, createRng(1))

describe('core/parameters wander', () => {
  it('starts exactly at the current values', () => {
    const p = wander(specs, curves, start, 0)
    expect(p.count).toBe(10)
    expect(p.size).toBeCloseTo(1, 10)
    expect(p.amount).toBeCloseTo(0.99, 10)
    expect(p.turn).toBeCloseTo(0, 10)
  })

  it('never drifts enums and always stays in bounds', () => {
    for (let t = 0; t < 600; t += 0.37) {
      const p = wander(specs, curves, start, t)
      expect(p.mode).toBe('a')
      expect(Number.isInteger(p.count) && p.count >= 1 && p.count <= 20).toBe(true)
      expect(p.size >= 0.1 && p.size <= 10).toBe(true)
      expect(p.amount >= 0 && p.amount <= 1).toBe(true)
      expect(p.turn >= 0 && p.turn < Math.PI * 2).toBe(true)
    }
  })

  it('moves smoothly: small time steps give small changes', () => {
    for (let t = 0; t < 120; t += 1 / 60) {
      const a = wander(specs, curves, start, t).amount
      const b = wander(specs, curves, start, t + 1 / 60).amount
      expect(Math.abs(b - a)).toBeLessThan(0.01)
    }
  })

  it('actually moves', () => {
    expect(wander(specs, curves, start, 20).amount).not.toBeCloseTo(0.99, 3)
  })
})
