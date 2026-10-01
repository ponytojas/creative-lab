import type { Oklab } from '../color/oklab'

export interface Swatch {
  swatchId: string
  color: Oklab
  /** Non-negative; weights of a palette sum to 1. */
  weight: number
}

export interface Palette {
  swatches: readonly Swatch[]
}
