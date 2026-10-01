import { z } from 'zod'
import { resourceSchema, type Resource } from './resource'

export const IMAGE_SCHEMA_VERSION = 1
export const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export const imagePayloadSchema = z.object({
  /** Original bytes, untouched. */
  blobId: z.string().min(1),
  /** Small preview for lists. */
  thumbnailBlobId: z.string().min(1),
  mediaType: z.enum(IMAGE_MEDIA_TYPES),
  /** Decoded size after orientation. */
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Display only; never exported. */
  originalFilename: z.string().max(255),
  byteSize: z.number().int().nonnegative(),
  /** True when only the first frame of an animation is used. */
  animated: z.boolean(),
  normalization: z.object({ orientation: z.literal('from-image'), colorSpace: z.literal('srgb') }),
})

export type ImagePayload = z.infer<typeof imagePayloadSchema>
export type ImageResource = Resource<'image', ImagePayload>
export const imageSchema = resourceSchema('image', IMAGE_SCHEMA_VERSION, imagePayloadSchema)
