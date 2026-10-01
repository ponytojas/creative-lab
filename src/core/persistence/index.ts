import { createDb, type CreativeLabDb } from './db'

export type PersistenceMode =
  /** This tab owns the drafts and may write. */
  | 'editor'
  /** Another tab is the editor; this one reads only. */
  | 'readonly'
  /** IndexedDB is unavailable: explore and export only. */
  | 'unavailable'

export type Persistence =
  | { mode: 'editor' | 'readonly'; db: CreativeLabDb }
  | { mode: 'unavailable'; db?: undefined }

/**
 * Opens the database and claims the editor lock. The lock is held until the
 * tab closes; a second tab becomes read-only (no takeover in 0.1).
 */
export async function openPersistence(name = 'creative-lab'): Promise<Persistence> {
  let db: CreativeLabDb
  try {
    db = createDb(name)
    await db.open()
  } catch (error) {
    console.warn('Local storage unavailable', error)
    return { mode: 'unavailable' }
  }
  return { mode: (await claimEditorLock(`${name}:editor`)) ? 'editor' : 'readonly', db }
}

function claimEditorLock(name: string): Promise<boolean> {
  // Web Locks need a secure context (https or localhost); without them, assume a single tab.
  if (!navigator.locks) return Promise.resolve(true)
  return new Promise((resolve) => {
    void navigator.locks.request(name, { ifAvailable: true }, (lock) => {
      resolve(lock !== null)
      // Keep the lock for the lifetime of the page.
      return lock ? new Promise<never>(() => {}) : undefined
    })
  })
}

export type { CreativeLabDb } from './db'
