import { z } from 'zod'

// One ParameterSpec map per engine is the single source of truth for defaults,
// validation/normalization, UI controls and (from M4) mutation.

interface Common {
  /** Display name in the UI. */
  label: string
  lockable?: boolean
}

export type ParameterSpec = Common &
  (
    | { kind: 'number'; default: number; min: number; max: number; step: number;
        scale: 'linear' | 'log'; mutationScale: number }
    | { kind: 'integer'; default: number; min: number; max: number; mutationScale: number }
    /** Radians; wraps to [0, 2π). */
    | { kind: 'angle'; default: number; mutationScale: number }
    | { kind: 'enum'; default: string; options: readonly string[];
        mutationWeights?: Record<string, number> }
    | { kind: 'boolean'; default: boolean }
  )

export type ParameterSpecs = Record<string, ParameterSpec>

/** Parameter values for a spec map. */
export type ParametersOf<S extends ParameterSpecs> = {
  [K in keyof S]: S[K] extends { kind: 'enum'; options: readonly (infer O)[] }
    ? O
    : S[K] extends { kind: 'boolean' }
      ? boolean
      : number
}

const TAU = Math.PI * 2
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
export const wrapAngle = (v: number) => ((v % TAU) + TAU) % TAU

export function defaults<S extends ParameterSpecs>(specs: S): ParametersOf<S> {
  return Object.fromEntries(
    Object.entries(specs).map(([key, spec]) => [key, spec.default]),
  ) as ParametersOf<S>
}

function fieldSchema(spec: ParameterSpec) {
  switch (spec.kind) {
    case 'number':
      return z.number().transform((v) => clamp(v, spec.min, spec.max)).default(spec.default)
    case 'integer':
      return z.number().transform((v) => clamp(Math.round(v), spec.min, spec.max)).default(spec.default)
    case 'angle':
      return z.number().transform(wrapAngle).default(spec.default)
    case 'enum':
      return z.enum(spec.options as [string, ...string[]]).default(spec.default)
    case 'boolean':
      return z.boolean().default(spec.default)
  }
}

/**
 * Normalizing schema: missing keys get defaults, numbers are clamped (integers
 * rounded, angles wrapped), unknown keys are dropped. Wrong types and unknown
 * enum options are rejected.
 */
export function schema<S extends ParameterSpecs>(specs: S): z.ZodType<ParametersOf<S>> {
  return z.object(
    Object.fromEntries(Object.entries(specs).map(([key, spec]) => [key, fieldSchema(spec)])),
  ) as unknown as z.ZodType<ParametersOf<S>>
}
