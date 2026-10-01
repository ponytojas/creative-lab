import { z } from 'zod'
import type { Oklab } from '../color/oklab'
import { resourceSchema, type Resource } from './resource'

export interface Swatch {
  swatchId: string
  color: Oklab
  /** Non-negative; weights of a palette sum to 1. */
  weight: number
}

export interface Palette {
  swatches: readonly Swatch[]
}

export const PALETTE_SCHEMA_VERSION = 1

const oklabSchema = z.object({ L: z.number(), a: z.number(), b: z.number() })

export const palettePayloadSchema = z.object({
  swatches: z
    .array(z.object({ swatchId: z.string().min(1), color: oklabSchema, weight: z.number().nonnegative() }))
    .min(1)
    .max(16),
})

export type PaletteResource = Resource<'palette', Palette>
export const paletteSchema = resourceSchema('palette', PALETTE_SCHEMA_VERSION, palettePayloadSchema)
export { oklabSchema }
