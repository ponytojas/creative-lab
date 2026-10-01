import { useState } from 'react'
import type { Persistence } from '../core/persistence'
import { experiments } from './registry'
import { SavedView } from './SavedView'

type View = { name: 'explore' } | { name: 'saved' } | { name: 'workspace'; experimentId: string }

export function App({ persistence }: { persistence: Persistence }) {
  // Launch straight into the first instrument: show something before asking for choices.
  const [view, setView] = useState<View>({ name: 'workspace', experimentId: experiments[0].id })
  const active = view.name === 'workspace' ? experiments.find((e) => e.id === view.experimentId) : undefined
  const current = (name: View['name']) => (view.name === name ? 'page' : undefined)
  const [message, setMessage] = useState<string>()

  // Shell-mediated handoff: experiments never import each other.
  const handOffPalette = async (paletteId: string) => {
    const target = experiments.find((e) => e.acceptPalette)
    const result = await target?.acceptPalette?.(paletteId)
    if (target && result?.ok) {
      setMessage(undefined)
      setView({ name: 'workspace', experimentId: target.id })
    } else {
      setMessage(result && !result.ok ? result.reason : 'No experiment can use palettes.')
    }
  }

  return (
    <div className="app">
      <nav className="nav" aria-label="Main">
        <span className="brand">Creative Lab</span>
        <button type="button" aria-current={current('explore')} onClick={() => setView({ name: 'explore' })}>
          Explore
        </button>
        <button type="button" aria-current={current('saved')} onClick={() => setView({ name: 'saved' })}>
          Saved
        </button>
        {active && <span className="nav-current" aria-current="page">{active.name}</span>}
      </nav>

      {persistence.mode === 'readonly' && (
        <p className="notice" role="status">Creative Lab is open in another tab. This tab is read-only.</p>
      )}
      {persistence.mode === 'unavailable' && (
        <p className="notice" role="status">
          This browser blocks local storage: nothing is saved. Download the SVG to keep your work.
        </p>
      )}

      {message && <p className="notice error" role="alert">{message}</p>}

      <main className="main">
        {active ? (
          <active.Workspace key={active.id} onUsePalette={handOffPalette} />
        ) : view.name === 'saved' ? (
          <SavedView persistence={persistence}
            onOpened={(experimentId) => setView({ name: 'workspace', experimentId })} />
        ) : (
          <ul className="explore" aria-label="Experiments">
            {experiments.map((e) => (
              <li key={e.id}>
                <button type="button" className="card"
                  onClick={() => setView({ name: 'workspace', experimentId: e.id })}>
                  <strong>{e.name}</strong>
                  <span>{e.summary}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
