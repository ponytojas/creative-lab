// OKLab is the canonical color space. sRGB/hex is derived for display only.
// Gamut policy v1: convert OKLab -> linear sRGB, clamp each channel to [0, 1],
// then gamma-encode. Revisit if clamping visibly dulls saturated colors.
// Matrices: Björn Ottosson, https://bottosson.github.io/posts/oklab/

export interface Oklab {
  L: number
  a: number
  b: number
}

export type LinearRgb = [r: number, g: number, b: number]

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const clamp01 = (c: number) => Math.min(1, Math.max(0, c))

export function linearSrgbToOklab([r, g, b]: LinearRgb): Oklab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

/** Unclamped; may leave [0, 1] for out-of-gamut colors. */
export function oklabToLinearSrgb({ L, a, b }: Oklab): LinearRgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

export function hexToOklab(hex: string): Oklab {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) throw new Error(`Invalid hex color: ${hex}`)
  const n = parseInt(match[1], 16)
  return linearSrgbToOklab([
    toLinear(((n >> 16) & 255) / 255),
    toLinear(((n >> 8) & 255) / 255),
    toLinear((n & 255) / 255),
  ])
}

/** Display hex through the gamut policy above. Always `#rrggbb`, lowercase. */
export function oklabToHex(color: Oklab): string {
  return (
    '#' +
    oklabToLinearSrgb(color)
      .map((c) => Math.round(toGamma(clamp01(c)) * 255).toString(16).padStart(2, '0'))
      .join('')
  )
}
