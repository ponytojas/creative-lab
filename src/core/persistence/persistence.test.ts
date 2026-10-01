import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDb, type CreativeLabDb } from './db'
import { deleteComposition, getBlob, listCompositions, renameComposition, saveComposition, type SaveCompositionInput } from './compositions'
import { deleteDraft, readDraft, writeDraft } from './drafts'

let db: CreativeLabDb
let n = 0
const freshDb = async () => {
  db = createDb(`test-${n++}`)
  await db.open()
  return db
}
afterEach(async () => {
  vi.restoreAllMocks()
  await db?.delete()
})

const input = (overrides: Partial<SaveCompositionInput['recipe']> = {}): SaveCompositionInput => ({
  recipe: {
    experimentId: 'atelier-infinito', engineId: 'radial-fields', engineVersion: '1', seed: 42, randomVersion: 1,
    parameters: { ringCount: 12 }, artboard: { width: 1000, height: 1000 }, ...overrides,
  },
  producerId: 'atelier-infinito/radial-fields',
  namePrefix: 'Radial Fields',
  svg: new Blob(['<svg/>'], { type: 'image/svg+xml' }),
  thumbnail: new Blob(['png'], { type: 'image/png' }),
})

describe('compositions', () => {
  it('saves atomically and reloads recipe and blobs', async () => {
    await freshDb()
    const saved = await saveComposition(db, input())
    expect(saved.metadata.name).toBe('Radial Fields #1')

    // Reopen the same database to prove it survives a "reload".
    db.close()
    await db.open()
    const [loaded] = await listCompositions(db)
    expect(loaded).toEqual(saved)
    expect(loaded.payload.parameters).toEqual({ ringCount: 12 })
    expect(await (await getBlob(db, loaded.payload.svgBlobId))?.text()).toBe('<svg/>')
    expect(await getBlob(db, loaded.payload.thumbnailBlobId)).toBeDefined()
  })

  it('a failed save writes nothing and leaves previous work intact', async () => {
    await freshDb()
    const first = await saveComposition(db, input())
    vi.spyOn(db.resources, 'add').mockRejectedValueOnce(new Error('quota exceeded'))
    await expect(saveComposition(db, input({ seed: 7 }))).rejects.toThrow('quota exceeded')
    expect(await listCompositions(db)).toEqual([first])
    expect(await db.blobs.count()).toBe(2)
  })

  it('rejects an invalid recipe before writing', async () => {
    await freshDb()
    await expect(saveComposition(db, input({ seed: -1 }))).rejects.toThrow()
    expect(await db.blobs.count()).toBe(0)
  })

  it('lists newest first, numbers names, keeps parentId, skips invalid rows', async () => {
    await freshDb()
    const a = await saveComposition(db, input())
    await new Promise((r) => setTimeout(r, 5))
    const b = await saveComposition(db, input({ parentId: a.id }))
    await db.resources.add({ id: 'broken', type: 'composition', payload: {} })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const list = await listCompositions(db)
    expect(list.map((c) => c.metadata.name)).toEqual(['Radial Fields #2', 'Radial Fields #1'])
    expect(list[0].payload.parentId).toBe(a.id)
    expect(b.id).not.toBe(a.id)
  })

  it('rename changes metadata only; delete removes the record but keeps blobs', async () => {
    await freshDb()
    const saved = await saveComposition(db, input())
    await renameComposition(db, saved.id, '  Bloom  ')
    const [renamed] = await listCompositions(db)
    expect(renamed.metadata.name).toBe('Bloom')
    expect(renamed.payload).toEqual(saved.payload)
    await expect(renameComposition(db, saved.id, '   ')).rejects.toThrow()

    await deleteComposition(db, saved.id)
    expect(await listCompositions(db)).toEqual([])
    expect(await db.blobs.count()).toBe(2)
  })
})

describe('drafts', () => {
  it('writes, reads and rejects stale revisions', async () => {
    await freshDb()
    const draft = (revision: number) => ({ id: 'atelier', revision, updatedAt: new Date().toISOString(), state: { revision } })
    expect(await writeDraft(db, draft(2))).toBe('written')
    expect(await writeDraft(db, draft(1))).toBe('stale')
    expect(await writeDraft(db, draft(2))).toBe('stale')
    expect((await readDraft(db, 'atelier'))?.revision).toBe(2)
  })

  it('serializes concurrent writes so the highest revision wins', async () => {
    await freshDb()
    const draft = (revision: number) => ({ id: 'atelier', revision, updatedAt: '', state: revision })
    await Promise.all([5, 3, 9, 1, 7].map((r) => writeDraft(db, draft(r))))
    expect((await readDraft(db, 'atelier'))?.state).toBe(9)
  })

  it('ignores invalid draft records and supports deletion', async () => {
    await freshDb()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await db.drafts.put({ id: 'bad', revision: -3, updatedAt: '', state: null })
    expect(await readDraft(db, 'bad')).toBeUndefined()
    await writeDraft(db, { id: 'atelier', revision: 1, updatedAt: '', state: 1 })
    await deleteDraft(db, 'atelier')
    expect(await readDraft(db, 'atelier')).toBeUndefined()
  })
})
