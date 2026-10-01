import { describe, expect, it } from 'vitest'
import type { SpatialColor } from '../../../core/resources/spatialColor'
import { darknessField } from './placement'

const grid = (lum: number[], visible = lum.map(() => 1)): SpatialColor => ({
  gridWidth: 2, gridHeight: 2, tonalSpread: 0, brightestCell: 0, darkestCell: 0,
  cells: lum.map((l, i) => ({ luminance: l, luminanceStd: 0, visibleWeight: visible[i] })),
})

describe('darknessField', () => {
  it('normalizes to the image range and interpolates between cell centers', () => {
    const d = darknessField(grid([0.1, 0.5, 0.1, 0.5]))!
    expect(d(0, 0.5)).toBeCloseTo(1) // left edge: darkest column
    expect(d(1, 0.5)).toBeCloseTo(0) // right edge: brightest column
    expect(d(0.5, 0.5)).toBeCloseTo(0.5) // halfway between centers
    expect(d(0.25, 0.1)).toBeCloseTo(1) // at/inside the outer centers it clamps
  })

  it('treats cells without visible pixels as brightest', () => {
    const d = darknessField(grid([0.2, 0.9, 0.9, 0.9], [1, 0, 1, 1]))!
    expect(d(0, 0)).toBeCloseTo(1)
    expect(d(1, 0)).toBeCloseTo(0)
  })

  it('is undefined for flat or empty maps', () => {
    expect(darknessField(grid([0.3, 0.3, 0.3, 0.3]))).toBeUndefined()
    expect(darknessField(grid([0, 0, 0, 0], [0, 0, 0, 0]))).toBeUndefined()
  })
})
