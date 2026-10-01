import { useId } from 'react'
import { wrapAngle, type ParameterSpec, type ParameterSpecs } from '../core/parameters'

type Value = number | string | boolean

interface Props<S extends ParameterSpecs> {
  specs: S
  keys: ReadonlyArray<keyof S & string>
  values: Record<keyof S, Value>
  onChange: (key: keyof S & string, value: Value) => void
}

export function ParameterControls<S extends ParameterSpecs>({ specs, keys, values, onChange }: Props<S>) {
  return (
    <div className="controls">
      {keys.map((key) => (
        <Control key={key} spec={specs[key]} value={values[key]} onChange={(v) => onChange(key, v)} />
      ))}
    </div>
  )
}

const DEG = 180 / Math.PI

function Control({ spec, value, onChange }: { spec: ParameterSpec; value: Value; onChange: (v: Value) => void }) {
  const id = useId()

  switch (spec.kind) {
    case 'enum':
      return (
        <div className="control">
          <label htmlFor={id}>{spec.label}</label>
          <select id={id} value={value as string} onChange={(e) => onChange(e.target.value)}>
            {spec.options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      )
    case 'boolean':
      return (
        <div className="control control-inline">
          <input id={id} type="checkbox" checked={value as boolean} onChange={(e) => onChange(e.target.checked)} />
          <label htmlFor={id}>{spec.label}</label>
        </div>
      )
    case 'angle': {
      const degrees = Math.round((value as number) * DEG)
      const set = (d: number) => Number.isFinite(d) && onChange(wrapAngle(d / DEG))
      return (
        <Slider id={id} label={`${spec.label} (°)`} min={0} max={359} step={1}
          sliderValue={degrees} numberValue={degrees}
          onSlider={set} onNumber={set} />
      )
    }
    case 'integer':
    case 'number': {
      const v = value as number
      const step = spec.kind === 'integer' ? 1 : spec.step
      const clamp = (n: number) => Math.min(spec.max, Math.max(spec.min, spec.kind === 'integer' ? Math.round(n) : n))
      // Round to the step's decimals so float noise never reaches the recipe.
      const decimals = (String(step).split('.')[1] ?? '').length
      const set = (n: number) => Number.isFinite(n) && onChange(clamp(Number(n.toFixed(decimals))))
      const log = spec.kind === 'number' && spec.scale === 'log'
      return (
        <Slider id={id} label={spec.label}
          min={log ? Math.log(spec.min) : spec.min}
          max={log ? Math.log(spec.max) : spec.max}
          step={log ? 'any' : step}
          sliderValue={log ? Math.log(v) : v}
          numberValue={v}
          numberStep={step} numberMin={spec.min} numberMax={spec.max}
          onSlider={(n) => set(log ? Math.exp(n) : n)}
          onNumber={set} />
      )
    }
  }
}

interface SliderProps {
  id: string
  label: string
  min: number
  max: number
  step: number | 'any'
  sliderValue: number
  numberValue: number
  numberStep?: number
  numberMin?: number
  numberMax?: number
  onSlider: (n: number) => void
  onNumber: (n: number) => void
}

function Slider(p: SliderProps) {
  const commit = (el: HTMLInputElement) => {
    if (Number.isFinite(el.valueAsNumber)) p.onNumber(el.valueAsNumber)
    el.value = String(p.numberValue) // shows the clamped value or reverts invalid text
  }
  return (
    <div className="control">
      <label htmlFor={p.id}>{p.label}</label>
      <div className="slider-row">
        <input id={p.id} type="range" min={p.min} max={p.max} step={p.step} value={p.sliderValue}
          onChange={(e) => p.onSlider(e.target.valueAsNumber)} />
        {/* Commits on blur/Enter so typing isn't clamped mid-entry; key resets it on outside changes. */}
        <input key={p.numberValue} type="number" aria-label={`${p.label} value`}
          min={p.numberMin ?? p.min} max={p.numberMax ?? p.max} step={p.numberStep ?? p.step}
          defaultValue={p.numberValue}
          onBlur={(e) => commit(e.target)}
          onKeyDown={(e) => e.key === 'Enter' && commit(e.currentTarget)} />
      </div>
    </div>
  )
}
