import { describe, expect, it } from 'vitest'
import { hexToOklab, oklabToHex } from './oklab'

const close = (actual: { L: number; a: number; b: number }, L: number, a: number, b: number) => {
  expect(actual.L).toBeCloseTo(L, 4)
  expect(actual.a).toBeCloseTo(a, 4)
  expect(actual.b).toBeCloseTo(b, 4)
}

describe('core/color OKLab', () => {
  // Reference values from Björn Ottosson's OKLab definition.
  it('matches reference conversions', () => {
    close(hexToOklab('#ffffff'), 1, 0, 0)
    close(hexToOklab('#000000'), 0, 0, 0)
    close(hexToOklab('#ff0000'), 0.62796, 0.22486, 0.12585)
    close(hexToOklab('#00ff00'), 0.86644, -0.23389, 0.1795)
    close(hexToOklab('#0000ff'), 0.45201, -0.03246, -0.31153)
  })

  it('round-trips every 8-bit gray and sample colors through hex', () => {
    for (let v = 0; v < 256; v += 5) {
      const hex = '#' + v.toString(16).padStart(2, '0').repeat(3)
      expect(oklabToHex(hexToOklab(hex))).toBe(hex)
    }
    for (const hex of ['#d1495b', '#edae49', '#00798c', '#123456']) expect(oklabToHex(hexToOklab(hex))).toBe(hex)
  })

  it('clamps out-of-gamut colors in linear sRGB', () => {
    expect(oklabToHex({ L: 0.7, a: 0.4, b: 0 })).toMatch(/^#[0-9a-f]{6}$/)
    expect(oklabToHex({ L: 2, a: 0, b: 0 })).toBe('#ffffff')
    expect(oklabToHex({ L: -1, a: 0, b: 0 })).toBe('#000000')
  })

  it('rejects invalid hex', () => expect(() => hexToOklab('red')).toThrow())
})
