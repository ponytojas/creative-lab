import { useDeferredValue, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { ParameterControls } from '../../../components/ParameterControls'
import { useLiveQuery } from '../../../components/useLiveQuery'
import { oklabToHex } from '../../../core/color/oklab'
import type { CreativeLabDb } from '../../../core/persistence/db'
import { listPalettes } from '../../../core/persistence/library'
import type { Palette } from '../../../core/resources/palette'
import type { ParameterSpecs } from '../../../core/parameters'
import { wander, wanderCurves } from '../../../core/parameters/wander'
import { createRng, isSeed, MAX_SEED } from '../../../core/random'
import { radialFields } from '../engines/radialFields'
import { renderRadialFields } from '../render'
import {
  dismissDraft, restoreDraft, saveCurrent, setPalette, setParam as setSessionParam, setParams, setSeed, useAtelier,
  type DraftStatus, type Session,
} from '../session'

const engine = radialFields
const advanced = (Object.keys(engine.parameters) as (keyof typeof engine.parameters)[]).filter(
  (key) => !engine.primary.includes(key),
)

const autoSpecs = {
  speed: { kind: 'number', label: 'Speed', default: 1, min: 0.1, max: 10, step: 0.1, scale: 'log', mutationScale: 0 },
} as const satisfies ParameterSpecs

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

function download(svg: string, filename: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; name: string } | { kind: 'error'; message: string }

const DRAFT_TEXT: Record<DraftStatus, string> = {
  saved: 'Autosaved locally',
  pending: 'Autosaving…',
  error: "Couldn't autosave locally",
  off: '',
}

function compositionText(session: Session, save: SaveState): string {
  if (save.kind === 'saving') return 'Saving…'
  if (save.kind === 'error') return save.message
  if (session.dirty) return session.basedOn ? 'Unsaved changes' : 'Not saved yet'
  if (save.kind === 'saved') return `Saved as “${save.name}”`
  return session.basedOn ? 'Saved' : 'Not saved yet'
}

export function AtelierWorkspace() {
  const session = useAtelier((s) => s.session)
  const mode = useAtelier((s) => s.persistence.mode)
  const db = useAtelier((s) => s.persistence.db)
  const palette = useAtelier((s) => s.palette)
  const draftStatus = useAtelier((s) => s.draftStatus)
  const pendingDraft = useAtelier((s) => s.pendingDraft)
  const { seed, params } = session
  const readOnly = mode === 'readonly'

  // Deferred so controls stay responsive; the last rendered artwork stays visible meanwhile.
  const recipe = useDeferredValue(useMemo(() => ({ seed, params, palette }), [seed, params, palette]))
  const svg = useMemo(() => renderRadialFields(recipe.seed, recipe.params, recipe.palette), [recipe])

  const [auto, setAuto] = useState(false)
  const [speed, setSpeed] = useState<number>(autoSpecs.speed.default)
  const currentParams = useEffectEvent(() => params)
  const currentSpeed = useEffectEvent(() => speed)

  // Touching a control takes over from auto mode instead of fighting it.
  const setParam = (key: string, value: unknown) => {
    setAuto(false)
    setSessionParam(key, value)
  }

  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })
  const save = async () => {
    if (mode !== 'editor' || saveState.kind === 'saving') return
    setSaveState({ kind: 'saving' })
    try {
      const result = await saveCurrent()
      setSaveState(result === 'unchanged' ? { kind: 'idle' } : { kind: 'saved', name: result.metadata.name })
    } catch (error) {
      console.error('Save failed', error)
      const reason = error instanceof Error && error.name === 'QuotaExceededError' ? 'storage is full' : 'an error occurred'
      setSaveState({ kind: 'error', message: `Couldn't save (${reason}). Your artwork is still here; download the SVG to be safe.` })
    }
  }
  const onSaveShortcut = useEffectEvent((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault() // never the browser's "Save page" dialog
      void save()
    }
  })
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onSaveShortcut(e)
    addEventListener('keydown', listener)
    return () => removeEventListener('keydown', listener)
  }, [])

  // Auto mode: drift from the values at start. Stopping keeps the current frame.
  useEffect(() => {
    if (!auto) return
    const start = currentParams()
    const curves = wanderCurves(engine.parameters, createRng(randomSeed()))
    let t = 0
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      t += (Math.min(now - last, 100) / 1000) * currentSpeed() // clamp: no jump after a hidden tab
      last = now
      setParams(wander(engine.parameters, curves, start, t))
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [auto])

  return (
    <div className="workspace">
      {/* Our own serializer output: numbers and validated hex colors only, no text or scripts. */}
      <div className="artboard" role="img" aria-label={`${engine.name} artwork, seed ${seed}`}
        dangerouslySetInnerHTML={{ __html: svg }} />

      <aside className="panel" aria-label="Controls">
        {pendingDraft && (
          <div className="recovery" role="region" aria-label="Session recovery">
            <p>Restore your last session?</p>
            <div className="recovery-actions">
              <button type="button" onClick={restoreDraft}>Restore</button>
              <button type="button" onClick={dismissDraft}>Dismiss</button>
            </div>
          </div>
        )}

        <header>
          <h1>{engine.name}</h1>
          <p className="describe">{engine.describe}</p>
        </header>

        <fieldset className="editor" disabled={readOnly}>
        <SeedField seed={seed} onChange={setSeed} />
        <PalettePicker db={db} paletteId={session.paletteId} palette={palette} />

        <ParameterControls specs={engine.parameters} keys={engine.primary} values={params} onChange={setParam} />

        <details>
          <summary>Advanced</summary>
          <ParameterControls specs={engine.parameters} keys={advanced} values={params} onChange={setParam} />
        </details>

        <div className="auto">
          <button type="button" aria-pressed={auto} onClick={() => setAuto((a) => !a)}>
            {auto ? 'Stop auto' : 'Auto'}
          </button>
          <ParameterControls specs={autoSpecs} keys={['speed']} values={{ speed }}
            onChange={(_, v) => setSpeed(v as number)} />
        </div>

        </fieldset>

        <div className="actions">
          {mode !== 'unavailable' && (
            <p className="status" role="status">
              <span>{compositionText(session, saveState)}</span>
              {mode === 'editor' && (
                <span className="muted">{pendingDraft ? 'Autosave paused until you choose above' : DRAFT_TEXT[draftStatus]}</span>
              )}
            </p>
          )}
          <button className="primary" type="button" onClick={save}
            disabled={mode !== 'editor' || saveState.kind === 'saving'} aria-keyshortcuts="Meta+S Control+S">
            Save
          </button>
          <button type="button" onClick={() => download(svg, `${engine.id}-${recipe.seed}.svg`)}>
            Download SVG
          </button>
        </div>
      </aside>
    </div>
  )
}

function PalettePicker({ db, paletteId, palette }: { db?: CreativeLabDb; paletteId?: string; palette: Palette }) {
  const palettes = useLiveQuery(() => (db ? listPalettes(db) : Promise.resolve([])), db)
  const [error, setError] = useState<string>()
  return (
    <div className="control">
      <label htmlFor="palette">Palette</label>
      <select id="palette" value={paletteId ?? ''}
        onChange={async (e) => {
          const result = await setPalette(e.target.value || undefined)
          setError(result.ok ? undefined : result.reason)
        }}>
        <option value="">Built-in</option>
        {palettes?.map((p) => <option key={p.id} value={p.id}>{p.metadata.name}</option>)}
      </select>
      <div className="palette-bar" aria-hidden>
        {palette.swatches.map((s) => (
          <span key={s.swatchId} style={{ flexGrow: s.weight, background: oklabToHex(s.color) }} />
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}

function SeedField({ seed, onChange }: { seed: number; onChange: (seed: number) => void }) {
  const [text, setText] = useState(String(seed))
  const [lastSeed, setLastSeed] = useState(seed)
  if (seed !== lastSeed) {
    setLastSeed(seed)
    setText(String(seed))
  }
  const valid = text.trim() !== '' && isSeed(Number(text))

  return (
    <div className="control">
      <label htmlFor="seed">Seed</label>
      <div className="seed-row">
        <input id="seed" inputMode="numeric" value={text} aria-invalid={!valid}
          aria-describedby={valid ? undefined : 'seed-error'}
          onChange={(e) => {
            setText(e.target.value)
            const n = Number(e.target.value)
            if (e.target.value.trim() !== '' && isSeed(n)) onChange(n)
          }}
          onBlur={() => !valid && setText(String(seed))} />
        <button type="button" onClick={() => onChange(randomSeed())}>New seed</button>
      </div>
      {!valid && <p id="seed-error" className="error">Whole number from 0 to {MAX_SEED}.</p>}
    </div>
  )
}
