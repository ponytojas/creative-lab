import { compositionSchema, type Composition, type CompositionPayload } from '../resources/composition'
import { COMPOSITION_SCHEMA_VERSION } from '../resources/composition'
import type { CreativeLabDb } from './db'
import { listResources } from './resources'

export interface SaveCompositionInput {
  /** Recipe without blob ids; those are assigned here. */
  recipe: Omit<CompositionPayload, 'svgBlobId' | 'thumbnailBlobId'>
  producerId: string
  /** Names become "<namePrefix> #<n>". */
  namePrefix: string
  svg: Blob
  thumbnail: Blob
}

/**
 * Commits the composition and its snapshot blobs atomically. Everything that
 * can fail slowly (generation, serialization, rasterization) must happen before.
 * Resolves only after commit.
 */
export async function saveComposition(db: CreativeLabDb, input: SaveCompositionInput): Promise<Composition> {
  const svgBlobId = crypto.randomUUID()
  const thumbnailBlobId = crypto.randomUUID()
  return db.transaction('rw', db.blobs, db.resources, async () => {
    const count = await db.resources.where('type').equals('composition').count()
    const composition = compositionSchema.parse({
      id: crypto.randomUUID(),
      type: 'composition',
      schemaVersion: COMPOSITION_SCHEMA_VERSION,
      payload: { ...input.recipe, svgBlobId, thumbnailBlobId },
      provenance: {
        producerId: input.producerId,
        producerVersion: input.recipe.engineVersion,
        inputResourceIds: Object.values(input.recipe.inputs),
      },
      metadata: { name: `${input.namePrefix} #${count + 1}`, createdAt: new Date().toISOString() },
    }) satisfies Composition
    await db.blobs.bulkAdd([
      { id: svgBlobId, blob: input.svg },
      { id: thumbnailBlobId, blob: input.thumbnail },
    ])
    await db.resources.add(composition)
    return composition
  })
}

/** Valid compositions, newest first. Invalid rows are skipped with a warning. */
export const listCompositions = (db: CreativeLabDb): Promise<Composition[]> =>
  listResources(db, 'composition', compositionSchema)

/** Metadata is the only mutable part of a resource. */
export async function renameComposition(db: CreativeLabDb, id: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (trimmed === '' || trimmed.length > 200) throw new Error('Name must be 1–200 characters.')
  await db.transaction('rw', db.resources, async () => {
    const parsed = compositionSchema.parse(await db.resources.get(id))
    await db.resources.put({ ...parsed, metadata: { ...parsed.metadata, name: trimmed } })
  })
}

/**
 * Removes the composition record only. Its blobs stay until an explicit
 * cleanup action reclaims unreferenced blobs (plan §10: never by cascade).
 */
export async function deleteComposition(db: CreativeLabDb, id: string): Promise<void> {
  await db.resources.delete(id)
}

export async function getBlob(db: CreativeLabDb, id: string): Promise<Blob | undefined> {
  return (await db.blobs.get(id))?.blob
}
