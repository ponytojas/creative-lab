import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './app/App'
import { experiments } from './app/registry'
import { openPersistence } from './core/persistence'

async function boot() {
  const persistence = await openPersistence()
  // A failed draft read must not block the instrument: start fresh instead.
  await Promise.all(experiments.map((e) => e.init(persistence))).catch((e) => console.error('Init failed', e))
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App persistence={persistence} />
    </StrictMode>,
  )
}

void boot()
