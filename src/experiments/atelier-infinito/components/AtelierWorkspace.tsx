import { useDeferredValue, useMemo, useState } from 'react'
import { ParameterControls } from '../../../components/ParameterControls'
import { defaults } from '../../../core/parameters'
import { isSeed, MAX_SEED } from '../../../core/random'
import { radialFields } from '../engines/radialFields'
import { DEFAULT_SEED, renderRadialFields, type RadialFieldsParameters } from '../render'

const engine = radialFields
const advanced = (Object.keys(engine.parameters) as (keyof typeof engine.parameters)[]).filter(
  (key) => !engine.primary.includes(key),
)

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

export function AtelierWorkspace() {
  const [seed, setSeed] = useState(DEFAULT_SEED)
  const [params, setParams] = useState<RadialFieldsParameters>(() => defaults(engine.parameters))

  // Deferred so controls stay responsive; the last rendered artwork stays visible meanwhile.
  const recipe = useDeferredValue(useMemo(() => ({ seed, params }), [seed, params]))
  const svg = useMemo(() => renderRadialFields(recipe.seed, recipe.params), [recipe])

  const setParam = (key: string, value: unknown) => setParams((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="workspace">
      {/* Our own serializer output: numbers and validated hex colors only, no text or scripts. */}
      <div className="artboard" role="img" aria-label={`${engine.name} artwork, seed ${seed}`}
        dangerouslySetInnerHTML={{ __html: svg }} />

      <aside className="panel" aria-label="Controls">
        <header>
          <h1>{engine.name}</h1>
          <p className="describe">{engine.describe}</p>
        </header>

        <SeedField seed={seed} onChange={setSeed} />

        <ParameterControls specs={engine.parameters} keys={engine.primary} values={params} onChange={setParam} />

        <details>
          <summary>Advanced</summary>
          <ParameterControls specs={engine.parameters} keys={advanced} values={params} onChange={setParam} />
        </details>

        <button className="primary" type="button"
          onClick={() => download(svg, `${engine.id}-${recipe.seed}.svg`)}>
          Download SVG
        </button>
      </aside>
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
