import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import type { Persistence } from '../core/persistence'
import { deleteComposition, getBlob, listCompositions, renameComposition } from '../core/persistence/compositions'
import type { CreativeLabDb } from '../core/persistence/db'
import type { Composition } from '../core/resources/composition'
import { experiments } from './registry'

interface Props {
  persistence: Persistence
  onOpened: (experimentId: string) => void
}

export function SavedView({ persistence, onOpened }: Props) {
  if (!persistence.db) {
    return <p className="empty">Local storage is unavailable in this browser, so nothing can be saved here.</p>
  }
  return <SavedGrid db={persistence.db} readOnly={persistence.mode === 'readonly'} onOpened={onOpened} />
}

function SavedGrid({ db, readOnly, onOpened }: { db: CreativeLabDb; readOnly: boolean; onOpened: Props['onOpened'] }) {
  const compositions = useCompositions(db)
  const [message, setMessage] = useState<string>()
  const [renaming, setRenaming] = useState<string>()

  if (compositions === undefined) return null
  if (compositions.length === 0) {
    return <p className="empty">Nothing saved yet. Press Save (or Cmd/Ctrl+S) in a workspace to keep a composition.</p>
  }

  const open = (c: Composition) => {
    const experiment = experiments.find((e) => e.id === c.payload.experimentId)
    if (!experiment) return setMessage(`“${c.metadata.name}” belongs to an experiment that isn't available.`)
    if (experiment.hasUnsavedWork() && !confirm(`Replace your unsaved work with “${c.metadata.name}”?`)) return
    const result = experiment.open(c)
    if (result.ok) onOpened(experiment.id)
    else setMessage(`Can't open “${c.metadata.name}”: ${result.reason}`)
  }

  const remove = async (c: Composition) => {
    if (!confirm(`Delete “${c.metadata.name}”? This can't be undone.`)) return
    await deleteComposition(db, c.id).catch(() => setMessage(`Couldn't delete “${c.metadata.name}”.`))
  }

  const rename = async (c: Composition, name: string) => {
    setRenaming(undefined)
    if (name.trim() === '' || name.trim() === c.metadata.name) return
    await renameComposition(db, c.id, name).catch((e: Error) => setMessage(`Couldn't rename: ${e.message}`))
  }

  return (
    <div className="saved">
      {message && <p className="error" role="alert">{message}</p>}
      <ul className="saved-grid" aria-label="Saved compositions">
        {compositions.map((c) => (
          <li key={c.id} className="saved-item">
            <Thumbnail db={db} blobId={c.payload.thumbnailBlobId} alt={c.metadata.name} />
            {renaming === c.id ? (
              <input aria-label="Name" defaultValue={c.metadata.name} autoFocus maxLength={200}
                onBlur={(e) => rename(c, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') {
                    e.currentTarget.value = c.metadata.name // blur then commits nothing
                    e.currentTarget.blur()
                  }
                }} />
            ) : (
              <strong className="saved-name">{c.metadata.name}</strong>
            )}
            <time dateTime={c.metadata.createdAt}>{new Date(c.metadata.createdAt).toLocaleString()}</time>
            <div className="saved-actions">
              <button type="button" disabled={readOnly} onClick={() => open(c)}>Open</button>
              <button type="button" disabled={readOnly} onClick={() => setRenaming(c.id)}>Rename</button>
              <button type="button" disabled={readOnly} onClick={() => remove(c)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Live list: updates when compositions change in this tab or another. */
function useCompositions(db: CreativeLabDb): Composition[] | undefined {
  const [compositions, setCompositions] = useState<Composition[]>()
  useEffect(() => {
    const subscription = liveQuery(() => listCompositions(db)).subscribe({
      next: setCompositions,
      error: (e) => console.error('Saved list failed', e),
    })
    return () => subscription.unsubscribe()
  }, [db])
  return compositions
}

function Thumbnail({ db, blobId, alt }: { db: CreativeLabDb; blobId: string; alt: string }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let objectUrl: string | undefined
    let active = true
    void getBlob(db, blobId).then((blob) => {
      if (!blob || !active) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [db, blobId])
  return url ? <img className="thumb" src={url} alt={alt} /> : <div className="thumb" aria-hidden />
}
