import type { Palette } from '../../core/resources/palette'

/** Built-in palette, mid-luminance so it reads on both light and dark backgrounds. */
export const DEFAULT_PALETTE: Palette = {
  swatches: [
    { swatchId: 'rose', color: { L: 0.596978, a: 0.164116, b: 0.047881 }, weight: 0.24 }, // #d1495b
    { swatchId: 'ochre', color: { L: 0.792045, a: 0.033042, b: 0.132496 }, weight: 0.2 }, // #edae49
    { swatchId: 'teal', color: { L: 0.52952, a: -0.077387, b: -0.051406 }, weight: 0.18 }, // #00798c
    { swatchId: 'cobalt', color: { L: 0.484656, a: -0.03543, b: -0.081172 }, weight: 0.16 }, // #30638e
    { swatchId: 'plum', color: { L: 0.498641, a: 0.083932, b: -0.089875 }, weight: 0.12 }, // #7b4b94
    { swatchId: 'sage', color: { L: 0.659444, a: -0.073062, b: 0.026099 }, weight: 0.1 }, // #66a182
  ],
}
