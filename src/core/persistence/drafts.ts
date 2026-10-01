import { z } from 'zod'
import type { CreativeLabDb, DraftRecord } from './db'

const draftSchema = z.object({
  id: z.string(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string(),
  state: z.unknown(),
})

export async function readDraft(db: CreativeLabDb, id: string): Promise<DraftRecord | undefined> {
  const record = await db.drafts.get(id)
  if (record === undefined) return undefined
  const parsed = draftSchema.safeParse(record)
  if (!parsed.success) {
    console.warn(`Ignoring invalid draft "${id}"`, parsed.error)
    return undefined
  }
  return parsed.data as DraftRecord
}

// Writes run one at a time, and a lower revision never overwrites a higher one.
let queue: Promise<unknown> = Promise.resolve()

export function writeDraft(db: CreativeLabDb, draft: DraftRecord): Promise<'written' | 'stale'> {
  const write = () =>
    db.transaction('rw', db.drafts, async () => {
      const existing = await db.drafts.get(draft.id)
      if (existing && existing.revision >= draft.revision) return 'stale' as const
      await db.drafts.put(draftSchema.parse(draft) as DraftRecord)
      return 'written' as const
    })
  const result = queue.then(write, write)
  queue = result.catch(() => undefined)
  return result
}

export function deleteDraft(db: CreativeLabDb, id: string): Promise<void> {
  const remove = () => db.drafts.delete(id)
  const result = queue.then(remove, remove)
  queue = result.catch(() => undefined)
  return result
}
