import { useDeferredValue, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { ParameterControls } from '../../../components/ParameterControls'
import { defaults, type ParameterSpecs } from '../../../core/parameters'
import { wander, wanderCurves } from '../../../core/parameters/wander'
import { createRng, isSeed, MAX_SEED } from '../../../core/random'
import { radialFields } from '../engines/radialFields'
import { DEFAULT_SEED, renderRadialFields, type RadialFieldsParameters } from '../render'

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

export function AtelierWorkspace() {
  const [seed, setSeed] = useState(DEFAULT_SEED)
  const [params, setParams] = useState<RadialFieldsParameters>(() => defaults(engine.parameters))

  // Deferred so controls stay responsive; the last rendered artwork stays visible meanwhile.
  const recipe = useDeferredValue(useMemo(() => ({ seed, params }), [seed, params]))
  const svg = useMemo(() => renderRadialFields(recipe.seed, recipe.params), [recipe])

  const [auto, setAuto] = useState(false)
  const [speed, setSpeed] = useState<number>(autoSpecs.speed.default)
  const currentParams = useEffectEvent(() => params)
  const currentSpeed = useEffectEvent(() => speed)

  // Touching a control takes over from auto mode instead of fighting it.
  const setParam = (key: string, value: unknown) => {
    setAuto(false)
    setParams((prev) => ({ ...prev, [key]: value }))
  }

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

        <div className="auto">
          <button type="button" aria-pressed={auto} onClick={() => setAuto((a) => !a)}>
            {auto ? 'Stop auto' : 'Auto'}
          </button>
          <ParameterControls specs={autoSpecs} keys={['speed']} values={{ speed }}
            onChange={(_, v) => setSpeed(v as number)} />
        </div>

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
