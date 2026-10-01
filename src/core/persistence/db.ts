import Dexie, { type EntityTable } from 'dexie'

export interface BlobRecord {
  id: string
  blob: Blob
}

/** Stored as-is; every read is validated with the resource type's Zod schema. */
export interface ResourceRecord {
  id: string
  type: string
  [key: string]: unknown
}

export interface DraftRecord {
  /** One draft per experiment workspace. */
  id: string
  revision: number
  updatedAt: string
  /** Experiment-owned working state, validated by the experiment on read. */
  state: unknown
}

export type CreativeLabDb = Dexie & {
  blobs: EntityTable<BlobRecord, 'id'>
  resources: EntityTable<ResourceRecord, 'id'>
  drafts: EntityTable<DraftRecord, 'id'>
}

export function createDb(name = 'creative-lab'): CreativeLabDb {
  const db = new Dexie(name) as CreativeLabDb
  db.version(1).stores({ blobs: 'id', resources: 'id, type', drafts: 'id' })
  return db
}
