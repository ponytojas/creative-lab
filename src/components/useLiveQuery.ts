import { liveQuery } from 'dexie'
import { useEffect, useEffectEvent, useState } from 'react'

/** Dexie live query: re-runs when the data it read changes, in this tab or another. Re-subscribes when `key` changes. */
export function useLiveQuery<T>(query: () => Promise<T>, key: unknown): T | undefined {
  const [value, setValue] = useState<T>()
  const run = useEffectEvent(query)
  useEffect(() => {
    const subscription = liveQuery(() => run()).subscribe({ next: setValue, error: (e) => console.error(e) })
    return () => subscription.unsubscribe()
  }, [key])
  return value
}
