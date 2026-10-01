import type { SvgScene } from '../../../core/export/svg'
import type { ParameterSpecs, ParametersOf } from '../../../core/parameters'
import type { RandomStreams } from '../../../core/random'
import type { Palette } from '../../../core/resources/palette'
import type { SpatialColor } from '../../../core/resources/spatialColor'

/** Atelier scenes are the shared SVG scene; extend here only when an engine needs more. */
export type AtelierScene = SvgScene

export interface GenerationContext {
  artboard: { width: number; height: number }
  random: RandomStreams
  inputs: { palette: Palette; spatial?: SpatialColor }
  limits: { maxVertices: number }
}

export interface GenerativeEngine<S extends ParameterSpecs> {
  id: string
  version: string
  name: string
  /** One sentence shown in the UI. */
  describe: string
  parameters: S
  /** The three or four controls shown first; the rest go under "Advanced". */
  primary: ReadonlyArray<keyof S & string>
  /** Reads `inputs.spatial` (the color grid paired with the palette). */
  usesSpatial?: boolean
  generate(context: GenerationContext, parameters: ParametersOf<S>): AtelierScene
}
