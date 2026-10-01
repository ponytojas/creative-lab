import { oklabToHex } from '../../../core/color/oklab'
import type { PathShape, Point } from '../../../core/export/svg'
import type { ParameterSpecs } from '../../../core/parameters'
import type { Rng } from '../../../core/random'
import type { Swatch } from '../../../core/resources/palette'
import type { GenerativeEngine } from './types'

const TAU = Math.PI * 2

export const BACKGROUNDS = { light: '#f4f0e8', dark: '#141418' } as const

const parameters = {
  ringCount: { kind: 'integer', label: 'Rings', default: 32, min: 4, max: 96, mutationScale: 6 },
  amplitude: { kind: 'number', label: 'Wave amplitude', default: 0.35, min: 0, max: 1, step: 0.01, scale: 'linear', mutationScale: 0.12 },
  jitter: { kind: 'number', label: 'Jitter', default: 0.15, min: 0, max: 1, step: 0.01, scale: 'linear', mutationScale: 0.1 },
  paletteMapping: { kind: 'enum', label: 'Palette mapping', default: 'weighted', options: ['weighted', 'sequential'] },
  repetition: { kind: 'integer', label: 'Angular repetition', default: 7, min: 1, max: 32, mutationScale: 2 },
  frequency: { kind: 'number', label: 'Wave frequency', default: 0.35, min: 0, max: 3.14, step: 0.01, scale: 'linear', mutationScale: 0.15 },
  rotation: { kind: 'angle', label: 'Rotation', default: 0, mutationScale: 0.3 },
  strokeWidth: { kind: 'number', label: 'Stroke width', default: 2.5, min: 0.25, max: 16, step: 0.05, scale: 'log', mutationScale: 0.25 },
  background: { kind: 'enum', label: 'Background', default: 'light', options: ['light', 'dark'] },
} as const satisfies ParameterSpecs

function weightedPick(swatches: readonly Swatch[], rng: Rng): Swatch {
  const total = swatches.reduce((sum, s) => sum + s.weight, 0)
  let r = rng.next() * total
  for (const swatch of swatches) {
    r -= swatch.weight
    if (r < 0) return swatch
  }
  return swatches[swatches.length - 1]
}

export const radialFields: GenerativeEngine<typeof parameters> = {
  id: 'radial-fields',
  version: '1',
  name: 'Radial Fields',
  describe:
    'Concentric rings of segments whose radius follows a wave: repetition sets the symmetry, jitter breaks it.',
  parameters,
  primary: ['ringCount', 'amplitude', 'jitter', 'paletteMapping'],

  generate({ artboard, random, inputs, limits }, p) {
    const geometry = random.stream('geometry')
    const color = random.stream('color')
    const swatches = inputs.palette.swatches
    const hex = new Map(swatches.map((s) => [s.swatchId, oklabToHex(s.color)]))

    const cx = artboard.width / 2
    const cy = artboard.height / 2
    const maxR = Math.min(artboard.width, artboard.height) * 0.44
    const minR = maxR * 0.06
    const spacing = (maxR - minR) / (p.ringCount - 1)
    const waveAmp = p.amplitude * maxR * 0.18
    const jitterAmp = p.jitter * maxR * 0.06
    const segmentsPerRing = Math.max(2, p.repetition * 2)
    const span = TAU / segmentsPerRing

    // Vertex budget: sample every `stepPx` along the circumference.
    const totalCircumference = TAU * ((minR + maxR) / 2) * p.ringCount
    const stepPx = Math.max(4, totalCircumference / limits.maxVertices)

    const shapes: PathShape[] = []
    for (let i = 0; i < p.ringCount; i++) {
      const baseR = minR + i * spacing
      const ringAmp = waveAmp * Math.sqrt(baseR / maxR)
      const phase = i * p.frequency
      // Smooth per-ring wobble; integer harmonics keep the ring continuous.
      const h1 = geometry.int(1, 5), p1 = geometry.range(0, TAU), a1 = geometry.next()
      const h2 = geometry.int(1, 5), p2 = geometry.range(0, TAU), a2 = geometry.next()
      const ringOffset = geometry.next() * span * p.jitter
      const radius = (t: number) =>
        Math.max(
          1,
          baseR +
            ringAmp * Math.sin(p.repetition * t + phase) +
            jitterAmp * (a1 * Math.sin(h1 * t + p1) + a2 * Math.sin(h2 * t + p2)),
        )
      const angleStep = stepPx / Math.max(baseR, 1)

      for (let j = 0; j < segmentsPerRing; j++) {
        // Draws happen regardless of jitter so dragging jitter morphs smoothly.
        const startJitter = geometry.range(-0.5, 0.5)
        const gapJitter = geometry.next()
        const gap = 0.12 + p.jitter * gapJitter * 0.6
        const start = p.rotation + ringOffset + j * span + startJitter * span * 0.4 * p.jitter
        const arc = span * (1 - gap)
        const count = Math.max(2, Math.ceil(arc / angleStep) + 1)
        const points: Point[] = []
        for (let k = 0; k < count; k++) {
          const t = start + (arc * k) / (count - 1)
          const r = radius(t)
          points.push([cx + r * Math.cos(t), cy + r * Math.sin(t)])
        }
        const swatch =
          p.paletteMapping === 'sequential' ? swatches[i % swatches.length] : weightedPick(swatches, color)
        shapes.push({
          type: 'path',
          points,
          closed: false,
          stroke: hex.get(swatch.swatchId),
          strokeWidth: p.strokeWidth,
          lineCap: 'round',
        })
      }
    }

    return {
      width: artboard.width,
      height: artboard.height,
      background: BACKGROUNDS[p.background],
      shapes,
    }
  },
}
