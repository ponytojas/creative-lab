import type { Rng } from '../random'
import type { ParameterSpec, ParameterSpecs } from '.'

// Live "auto" motion: every number/integer/angle parameter drifts along its own
// smooth random curve, starting exactly at the current value. Not reproducible
// by design (live mode); enums and booleans never drift.

type Drifting = Extract<ParameterSpec, { kind: 'number' | 'integer' | 'angle' }>

/** How far a value wanders from its start, as a fraction of its range. */
const REACH = 0.35
const AMPLITUDES = [0.5, 0.3, 0.2]

interface Curve {
  freqs: number[]
  phases: number[]
}

export type WanderCurves = Record<string, Curve>

const isDrifting = (spec: ParameterSpec): spec is Drifting =>
  spec.kind === 'number' || spec.kind === 'integer' || spec.kind === 'angle'

/** One random curve per drifting parameter. Frequencies are 0.02–0.1 Hz at speed 1. */
export function wanderCurves(specs: ParameterSpecs, rng: Rng): WanderCurves {
  const curves: WanderCurves = {}
  for (const [key, spec] of Object.entries(specs)) {
    if (!isDrifting(spec)) continue
    curves[key] = {
      freqs: AMPLITUDES.map(() => rng.range(0.02, 0.1)),
      phases: AMPLITUDES.map(() => rng.range(0, Math.PI * 2)),
    }
  }
  return curves
}

/** Smooth signal in [-1, 1]. */
const signal = ({ freqs, phases }: Curve, t: number) =>
  AMPLITUDES.reduce((sum, a, i) => sum + a * Math.sin(Math.PI * 2 * freqs[i] * t + phases[i]), 0)

/** Folds x into [0, 1] like a ball bouncing off the bounds (no sticking at the edges). */
const reflect = (x: number) => {
  const r = ((x % 2) + 2) % 2
  return r > 1 ? 2 - r : r
}

function toUnit(spec: Drifting, v: number): number {
  if (spec.kind === 'angle') return v / (Math.PI * 2)
  if (spec.kind === 'number' && spec.scale === 'log') return Math.log(v / spec.min) / Math.log(spec.max / spec.min)
  return (v - spec.min) / (spec.max - spec.min)
}

function fromUnit(spec: Drifting, u: number): number {
  if (spec.kind === 'angle') return (((u % 1) + 1) % 1) * Math.PI * 2
  if (spec.kind === 'number' && spec.scale === 'log') return spec.min * (spec.max / spec.min) ** u
  const v = spec.min + u * (spec.max - spec.min)
  return spec.kind === 'integer' ? Math.round(v) : v
}

/** Parameter values at time `t` seconds; at t = 0 equals `start`. */
export function wander<P extends Record<string, unknown>>(
  specs: ParameterSpecs,
  curves: WanderCurves,
  start: P,
  t: number,
): P {
  const out: Record<string, unknown> = { ...start }
  for (const [key, curve] of Object.entries(curves)) {
    const spec = specs[key]
    if (!isDrifting(spec)) continue
    const offset = REACH * (signal(curve, t) - signal(curve, 0))
    const u = toUnit(spec, start[key] as number) + offset
    out[key] = fromUnit(spec, spec.kind === 'angle' ? u : reflect(u))
  }
  return out as P
}
