import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { saveComposition } from './compositions'
import { createDb, type CreativeLabDb } from './db'
import { DependencyError, deleteImage, listImages, listPalettes, saveExtraction, saveImage } from './library'
import { listResources } from './resources'
import { spatialColorSchema } from '../resources/spatialColor'

let db: CreativeLabDb
let n = 0
afterEach(() => db.delete())
const freshDb = async () => {
  db = createDb(`library-${n++}`)
  await db.open()
}

const importOne = (name = 'beach') =>
  saveImage(db, {
    payload: {
      mediaType: 'image/png', width: 40, height: 30, originalFilename: `${name}.png`, byteSize: 123, animated: false,
      normalization: { orientation: 'from-image', colorSpace: 'srgb' },
    },
    name,
    original: new Blob(['png-bytes'], { type: 'image/png' }),
    thumbnail: new Blob(['thumb'], { type: 'image/png' }),
  })

const extraction = { L: 0.6, a: 0.1, b: 0.05 }
const extract = (image: Awaited<ReturnType<typeof importOne>>, colors = 6) =>
  saveExtraction(db, {
    image,
    producerId: 'visual-dna/palette',
    producerVersion: '1',
    config: { colors, seed: 1 },
    palette: { swatches: [{ swatchId: 'c1', color: extraction, weight: 1 }] },
    spatial: {
      gridWidth: 1, gridHeight: 1, tonalSpread: 0, brightestCell: 0, darkestCell: 0,
      cells: [{ color: extraction, luminance: 0.3, luminanceStd: 0, dominantSwatchId: 'c1', visibleWeight: 1 }],
    },
  })

const compose = (paletteId?: string) =>
  saveComposition(db, {
    recipe: {
      experimentId: 'atelier-infinito', engineId: 'radial-fields', engineVersion: '1', seed: 1, randomVersion: 1,
      parameters: {}, artboard: { width: 1000, height: 1000 }, inputs: paletteId ? { palette: paletteId } : {},
    },
    producerId: 'atelier-infinito/radial-fields',
    namePrefix: 'Radial Fields',
    svg: new Blob(['<svg/>']),
    thumbnail: new Blob(['png']),
  })

describe('image library', () => {
  it('stores an image with its blobs and lists it after reopening the database', async () => {
    await freshDb()
    const image = await importOne()
    db.close()
    await db.open()
    expect(await listImages(db)).toEqual([image])
    expect(await db.blobs.count()).toBe(2)
  })

  it('extraction creates linked palette + spatial resources, deduplicated by image and config', async () => {
    await freshDb()
    const image = await importOne()
    const first = await extract(image)
    expect(first.palette.provenance.inputResourceIds).toEqual([image.id])
    expect(first.spatial.provenance.inputResourceIds).toEqual([image.id, first.palette.id])
    expect(first.spatial.provenance.config?.paletteResourceId).toBe(first.palette.id)
    expect(first.palette.metadata.name).toBe('beach · 1 color')

    expect((await extract(image)).palette.id).toBe(first.palette.id)
    expect((await extract(image, 4)).palette.id).not.toBe(first.palette.id)
    expect(await listPalettes(db)).toHaveLength(2)
  })

  it('composition inputs are recorded in provenance', async () => {
    await freshDb()
    const { palette } = await extract(await importOne())
    const composition = await compose(palette.id)
    expect(composition.payload.inputs).toEqual({ palette: palette.id })
    expect(composition.provenance.inputResourceIds).toEqual([palette.id])
  })

  it('refuses to delete an image whose palette a saved composition uses', async () => {
    await freshDb()
    const image = await importOne()
    const { palette } = await extract(image)
    await compose(palette.id)
    const error = await deleteImage(db, image.id).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DependencyError)
    expect((error as DependencyError).dependents).toEqual(['Radial Fields #1'])
    expect(await listImages(db)).toHaveLength(1)
    expect(await listPalettes(db)).toHaveLength(1)
  })

  it('deletes an unused image with its derived resources, keeping blobs and unrelated items', async () => {
    await freshDb()
    const keep = await importOne('keep')
    const { palette: kept } = await extract(keep)
    const doomed = await importOne('doomed')
    await extract(doomed)
    await compose(kept.id)
    await deleteImage(db, doomed.id)
    expect((await listImages(db)).map((i) => i.metadata.name)).toEqual(['keep'])
    expect((await listPalettes(db)).map((p) => p.id)).toEqual([kept.id])
    expect(await listResources(db, 'spatial-color', spatialColorSchema)).toHaveLength(1)
    expect(await db.blobs.count()).toBe(6) // reclaimed later by explicit cleanup, never by cascade
  })
})
