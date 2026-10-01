import { z } from 'zod'
import { MAX_SEED } from '../random'
import { resourceSchema, type Resource } from './resource'

// A saved artwork: the editable recipe plus references to its immutable
// snapshot blobs (self-contained SVG and PNG thumbnail). Engine parameters are
// validated by the owning experiment against the engine's ParameterSpec.

export const COMPOSITION_SCHEMA_VERSION = 1

export const compositionPayloadSchema = z.object({
  experimentId: z.string().min(1),
  engineId: z.string().min(1),
  engineVersion: z.string().min(1),
  seed: z.number().int().min(0).max(MAX_SEED),
  randomVersion: z.number().int().positive(),
  parameters: z.record(z.string(), z.unknown()),
  artboard: z.object({ width: z.number().positive(), height: z.number().positive() }),
  /** Immutable input resources by role, e.g. { palette: id }. Absent in M1 saves. */
  inputs: z.record(z.string(), z.string()).default({}),
  parentId: z.string().optional(),
  svgBlobId: z.string().min(1),
  thumbnailBlobId: z.string().min(1),
})

export type CompositionPayload = z.infer<typeof compositionPayloadSchema>
export type Composition = Resource<'composition', CompositionPayload>

export const compositionSchema = resourceSchema('composition', COMPOSITION_SCHEMA_VERSION, compositionPayloadSchema)
