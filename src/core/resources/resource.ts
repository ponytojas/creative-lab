import { z } from 'zod'

/** Resource envelope: payload and provenance are immutable; only metadata changes. */
export interface Resource<TType extends string, TPayload> {
  id: string
  type: TType
  /** Version of this resource type's payload. */
  schemaVersion: number
  payload: TPayload
  provenance: {
    producerId: string
    producerVersion: string
    inputResourceIds: string[]
    config?: Record<string, unknown>
  }
  metadata: {
    name: string
    createdAt: string
    favorite?: boolean
    tags?: string[]
  }
}

export const metadataSchema = z.object({
  name: z.string().min(1).max(200),
  createdAt: z.iso.datetime(),
  favorite: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
})

export function resourceSchema<T extends string, P extends z.ZodType>(type: T, schemaVersion: number, payload: P) {
  return z.object({
    id: z.string().min(1),
    type: z.literal(type),
    schemaVersion: z.literal(schemaVersion),
    payload,
    provenance: z.object({
      producerId: z.string(),
      producerVersion: z.string(),
      inputResourceIds: z.array(z.string()),
      config: z.record(z.string(), z.unknown()).optional(),
    }),
    metadata: metadataSchema,
  })
}
