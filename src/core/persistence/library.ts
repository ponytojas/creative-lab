import { compositionSchema } from '../resources/composition'
import { IMAGE_SCHEMA_VERSION, imageSchema, type ImagePayload, type ImageResource } from '../resources/image'
import { PALETTE_SCHEMA_VERSION, paletteSchema, type Palette, type PaletteResource } from '../resources/palette'
import {
  SPATIAL_COLOR_SCHEMA_VERSION, spatialColorSchema, type SpatialColor, type SpatialColorResource,
} from '../resources/spatialColor'
import type { CreativeLabDb } from './db'
import { listResources } from './resources'

// Images and the palette / spatial-color resources derived from them.

export const listImages = (db: CreativeLabDb) => listResources(db, 'image', imageSchema)
export const listPalettes = (db: CreativeLabDb) => listResources(db, 'palette', paletteSchema)

export interface SaveImageInput {
  payload: Omit<ImagePayload, 'blobId' | 'thumbnailBlobId'>
  name: string
  original: Blob
  thumbnail: Blob
}

/** Stores original bytes, thumbnail and the image resource atomically. */
export async function saveImage(db: CreativeLabDb, input: SaveImageInput): Promise<ImageResource> {
  const blobId = crypto.randomUUID()
  const thumbnailBlobId = crypto.randomUUID()
  const image = imageSchema.parse({
    id: crypto.randomUUID(),
    type: 'image',
    schemaVersion: IMAGE_SCHEMA_VERSION,
    payload: { ...input.payload, blobId, thumbnailBlobId },
    provenance: { producerId: 'import', producerVersion: '1', inputResourceIds: [] },
    metadata: { name: input.name, createdAt: new Date().toISOString() },
  }) satisfies ImageResource
  await db.transaction('rw', db.blobs, db.resources, async () => {
    await db.blobs.bulkAdd([
      { id: blobId, blob: input.original },
      { id: thumbnailBlobId, blob: input.thumbnail },
    ])
    await db.resources.add(image)
  })
  return image
}

export interface SaveExtractionInput {
  image: ImageResource
  producerId: string
  producerVersion: string
  config: Record<string, unknown>
  palette: Palette
  spatial: SpatialColor
}

/**
 * Persists an extraction as a Palette and a SpatialColor resource. The same
 * image + producer version + config returns the existing pair instead.
 */
export async function saveExtraction(
  db: CreativeLabDb,
  input: SaveExtractionInput,
): Promise<{ palette: PaletteResource; spatial: SpatialColorResource }> {
  const key = JSON.stringify(input.config)
  return db.transaction('rw', db.resources, async () => {
    const palettes = await listPalettes(db)
    const existing = palettes.find(
      (p) =>
        p.provenance.inputResourceIds[0] === input.image.id &&
        p.provenance.producerVersion === input.producerVersion &&
        JSON.stringify(p.provenance.config) === key,
    )
    if (existing) {
      const spatials = await listResources(db, 'spatial-color', spatialColorSchema)
      const spatial = spatials.find((s) => s.provenance.config?.paletteResourceId === existing.id)
      if (spatial) return { palette: existing, spatial }
    }

    const createdAt = new Date().toISOString()
    const count = input.palette.swatches.length
    const palette = paletteSchema.parse({
      id: crypto.randomUUID(),
      type: 'palette',
      schemaVersion: PALETTE_SCHEMA_VERSION,
      payload: input.palette,
      provenance: {
        producerId: input.producerId, producerVersion: input.producerVersion,
        inputResourceIds: [input.image.id], config: input.config,
      },
      metadata: { name: `${input.image.metadata.name} · ${count} color${count === 1 ? '' : 's'}`, createdAt },
    }) satisfies PaletteResource
    const spatial = spatialColorSchema.parse({
      id: crypto.randomUUID(),
      type: 'spatial-color',
      schemaVersion: SPATIAL_COLOR_SCHEMA_VERSION,
      payload: input.spatial,
      provenance: {
        producerId: input.producerId, producerVersion: input.producerVersion,
        inputResourceIds: [input.image.id, palette.id], config: { ...input.config, paletteResourceId: palette.id },
      },
      metadata: { name: `${input.image.metadata.name} · color grid`, createdAt },
    }) satisfies SpatialColorResource
    await db.resources.bulkAdd([palette, spatial])
    return { palette, spatial }
  })
}

export class DependencyError extends Error {
  readonly dependents: string[]
  constructor(dependents: string[]) {
    super(`Used by ${dependents.length} saved composition${dependents.length === 1 ? '' : 's'}: ${dependents.join(', ')}`)
    this.name = 'DependencyError'
    this.dependents = dependents
  }
}

/**
 * Deletes an image and the palettes / color grids derived from it. Refused
 * (DependencyError) while a saved composition uses any of them. Blobs stay
 * until an explicit cleanup reclaims unreferenced ones.
 */
export async function deleteImage(db: CreativeLabDb, imageId: string): Promise<void> {
  await db.transaction('rw', db.resources, async () => {
    const all = await db.resources.toArray()
    const doomed = new Set([imageId])
    // Derived resources list their sources in provenance; follow the chain.
    for (let grew = true; grew; ) {
      grew = false
      for (const r of all) {
        const inputs = (r.provenance as { inputResourceIds?: string[] } | undefined)?.inputResourceIds ?? []
        if (r.type !== 'composition' && !doomed.has(r.id) && inputs.some((id) => doomed.has(id))) {
          doomed.add(r.id)
          grew = true
        }
      }
    }
    const dependents = all
      .filter((r) => r.type === 'composition')
      .map((r) => compositionSchema.safeParse(r))
      .flatMap((p) => (p.success && Object.values(p.data.payload.inputs).some((id) => doomed.has(id)) ? [p.data.metadata.name] : []))
    if (dependents.length > 0) throw new DependencyError(dependents)
    await db.resources.bulkDelete([...doomed])
  })
}
