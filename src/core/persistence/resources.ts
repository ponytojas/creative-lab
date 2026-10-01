import type { z } from 'zod'
import type { CreativeLabDb } from './db'

/** Valid resources of one type, newest first. Invalid rows are skipped with a warning. */
export async function listResources<S extends z.ZodType<{ metadata: { createdAt: string } }>>(
  db: CreativeLabDb,
  type: string,
  schema: S,
): Promise<z.infer<S>[]> {
  const rows = await db.resources.where('type').equals(type).toArray()
  const valid: z.infer<S>[] = []
  for (const row of rows) {
    const parsed = schema.safeParse(row)
    if (parsed.success) valid.push(parsed.data)
    else console.warn(`Skipping invalid ${type} "${row.id}"`, parsed.error)
  }
  return valid.sort((a, b) => b.metadata.createdAt.localeCompare(a.metadata.createdAt))
}

/** One validated resource, or undefined if missing or invalid. */
export async function getResource<S extends z.ZodType>(db: CreativeLabDb, id: string, schema: S): Promise<z.infer<S> | undefined> {
  const row = await db.resources.get(id)
  if (!row) return undefined
  const parsed = schema.safeParse(row)
  if (!parsed.success) console.warn(`Invalid resource "${id}"`, parsed.error)
  return parsed.success ? parsed.data : undefined
}
