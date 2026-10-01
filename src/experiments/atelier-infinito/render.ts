import { serializeSvg } from '../../core/export/svg'
import type { ParameterSpecs, ParametersOf } from '../../core/parameters'
import { createStreams } from '../../core/random'
import type { Palette } from '../../core/resources/palette'
import type { SpatialColor } from '../../core/resources/spatialColor'
import { flowField } from './engines/flowField'
import { radialFields } from './engines/radialFields'
import type { GenerativeEngine } from './engines/types'
import { DEFAULT_PALETTE } from './palette'

export const ARTBOARD = { width: 1000, height: 1000 } as const
export const LIMITS = { maxVertices: 60_000 } as const
export const DEFAULT_SEED = 20261001

export type AnyEngine = GenerativeEngine<ParameterSpecs>
export type EngineParameters = ParametersOf<ParameterSpecs>

/** Atelier's engines, in menu order. Erased to AnyEngine: values are validated by each engine's schema. */
export const ENGINES = [radialFields, flowField] as unknown as readonly AnyEngine[]
export const ENGINE_IDS = ENGINES.map((e) => e.id) as [string, ...string[]]
export const getEngine = (id: string): AnyEngine | undefined => ENGINES.find((e) => e.id === id)

export interface RenderInputs {
  palette: Palette
  spatial?: SpatialColor
}

/** Recipe -> serialized SVG. The single path used by preview, save, download and golden tests. */
export function renderComposition(
  engine: AnyEngine,
  seed: number,
  parameters: EngineParameters,
  inputs: RenderInputs = { palette: DEFAULT_PALETTE },
): string {
  const scene = engine.generate({ artboard: ARTBOARD, random: createStreams(seed), inputs, limits: LIMITS }, parameters)
  return serializeSvg(scene)
}
