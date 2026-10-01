import { z } from 'zod'
import { oklabSchema } from './palette'
import { resourceSchema, type Resource } from './resource'

// Row-major grid of color statistics. Grid size is data: never assume 3×3.
// The palette it refers to is `provenance.config.paletteResourceId`.

export const SPATIAL_COLOR_SCHEMA_VERSION = 1

export const spatialCellSchema = z.object({
  /** Visible-weighted mean color; undefined when the cell has no visible pixels. */
  color: oklabSchema.optional(),
  /** Weighted mean linear-sRGB relative luminance. */
  luminance: z.number(),
  /** Weighted luminance standard deviation (cell contrast). */
  luminanceStd: z.number(),
  dominantSwatchId: z.string().optional(),
  /** Visible weight / cell pixel count, 0–1. */
  visibleWeight: z.number().min(0).max(1),
})

export const spatialColorPayloadSchema = z
  .object({
    gridWidth: z.number().int().positive(),
    gridHeight: z.number().int().positive(),
    cells: z.array(spatialCellSchema),
    /** 95th − 5th luminance percentile over visible pixels. */
    tonalSpread: z.number(),
    brightestCell: z.number().int().nonnegative(),
    darkestCell: z.number().int().nonnegative(),
  })
  .refine((p) => p.cells.length === p.gridWidth * p.gridHeight, 'cells must match grid size')

export type SpatialCell = z.infer<typeof spatialCellSchema>
export type SpatialColor = z.infer<typeof spatialColorPayloadSchema>
export type SpatialColorResource = Resource<'spatial-color', SpatialColor>
export const spatialColorSchema = resourceSchema('spatial-color', SPATIAL_COLOR_SCHEMA_VERSION, spatialColorPayloadSchema)
