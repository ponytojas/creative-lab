import { serializeSvg } from '../../core/export/svg'
import type { ParametersOf } from '../../core/parameters'
import { createStreams } from '../../core/random'
import { radialFields } from './engines/radialFields'
import { DEFAULT_PALETTE } from './palette'

export const ARTBOARD = { width: 1000, height: 1000 } as const
export const LIMITS = { maxVertices: 60_000 } as const
export const DEFAULT_SEED = 20261001

export type RadialFieldsParameters = ParametersOf<typeof radialFields.parameters>

/** Recipe -> serialized SVG. The single path used by preview, download and golden tests. */
export function renderRadialFields(seed: number, parameters: RadialFieldsParameters): string {
  const scene = radialFields.generate(
    { artboard: ARTBOARD, random: createStreams(seed), inputs: { palette: DEFAULT_PALETTE }, limits: LIMITS },
    parameters,
  )
  return serializeSvg(scene)
}
