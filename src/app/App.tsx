import { useState } from 'react'
import { experiments } from './registry'

type View = { name: 'explore' } | { name: 'workspace'; experimentId: string }

export function App() {
  // Launch straight into the first instrument: show something before asking for choices.
  const [view, setView] = useState<View>({ name: 'workspace', experimentId: experiments[0].id })
  const active = view.name === 'workspace' ? experiments.find((e) => e.id === view.experimentId) : undefined

  return (
    <div className="app">
      <nav className="nav" aria-label="Main">
        <span className="brand">Creative Lab</span>
        <button type="button" aria-current={view.name === 'explore' ? 'page' : undefined}
          onClick={() => setView({ name: 'explore' })}>
          Explore
        </button>
        {active && <span className="nav-current" aria-current="page">{active.name}</span>}
      </nav>

      <main className="main">
        {active ? (
          <active.Workspace />
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
