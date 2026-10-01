import { useEffect, useState } from 'react'
import { getBlob } from '../core/persistence/compositions'
import type { CreativeLabDb } from '../core/persistence/db'

/** Object URL for a stored blob; revoked when the blob changes or on unmount. */
export function useBlobUrl(db: CreativeLabDb | undefined, blobId: string | undefined): string | undefined {
  const [loaded, setLoaded] = useState<{ blobId: string; url: string }>()
  useEffect(() => {
    if (!db || !blobId) return
    let url: string | undefined
    let active = true
    void getBlob(db, blobId).then((blob) => {
      if (!blob || !active) return
      url = URL.createObjectURL(blob)
      setLoaded({ blobId, url })
    })
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [db, blobId])
  return loaded && loaded.blobId === blobId ? loaded.url : undefined
}
