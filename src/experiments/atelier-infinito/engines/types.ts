import type { SvgScene } from '../../../core/export/svg'
import type { ParameterSpecs, ParametersOf } from '../../../core/parameters'
import type { RandomStreams } from '../../../core/random'
import type { Palette } from '../../../core/resources/palette'

/** Atelier scenes are the shared SVG scene; extend here only when an engine needs more. */
export type AtelierScene = SvgScene

export interface GenerationContext {
  artboard: { width: number; height: number }
  random: RandomStreams
  inputs: { palette: Palette }
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
  generate(context: GenerationContext, parameters: ParametersOf<S>): AtelierScene
}
