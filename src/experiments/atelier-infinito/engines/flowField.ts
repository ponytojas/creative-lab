import { oklabToHex } from '../../../core/color/oklab'
import type { PathShape, Point } from '../../../core/export/svg'
import type { ParameterSpecs } from '../../../core/parameters'
import { createNoise2D, fbm } from '../../../core/random/noise'
import { darknessField, placeSeeds } from './placement'
import { BACKGROUNDS, weightedPick } from './shared'
import type { GenerativeEngine } from './types'

// Streamlines through a noise vector field.
// v1: seeds from the 'placement' stream (optionally steered by the image map);
// field angle = fbm(noise)·2π·swirl + rotation, noise from the 'geometry' stream;
// forward Euler integration with a fixed step; a line stops at the artboard edge
// or after `lineLength` steps; generation stops when the vertex budget is spent.

const parameters = {
  lineCount: { kind: 'integer', label: 'Lines', default: 500, min: 20, max: 3000, mutationScale: 150 },
  noiseScale: { kind: 'number', label: 'Noise scale', default: 2.5, min: 0.5, max: 12, step: 0.05, scale: 'log', mutationScale: 0.3 },
  lineLength: { kind: 'integer', label: 'Line length', default: 60, min: 5, max: 300, mutationScale: 20 },
  imageInfluence: { kind: 'number', label: 'Image influence', default: 0.75, min: 0, max: 1, step: 0.01, scale: 'linear', mutationScale: 0.15 },
  stepLength: { kind: 'number', label: 'Step length', default: 4, min: 1, max: 12, step: 0.1, scale: 'log', mutationScale: 0.2 },
  octaves: { kind: 'integer', label: 'Octaves', default: 2, min: 1, max: 4, mutationScale: 1 },
  swirl: { kind: 'number', label: 'Swirl', default: 1, min: 0.25, max: 4, step: 0.05, scale: 'log', mutationScale: 0.25 },
  rotation: { kind: 'angle', label: 'Rotation', default: 0, mutationScale: 0.3 },
  strokeWidth: { kind: 'number', label: 'Stroke width', default: 1.4, min: 0.25, max: 8, step: 0.05, scale: 'log', mutationScale: 0.25 },
  paletteMapping: { kind: 'enum', label: 'Palette mapping', default: 'weighted', options: ['weighted', 'sequential'] },
  background: { kind: 'enum', label: 'Background', default: 'light', options: ['light', 'dark'] },
} as const satisfies ParameterSpecs

export const flowField: GenerativeEngine<typeof parameters> = {
  id: 'flow-field',
  version: '1',
  name: 'Flow Field',
  describe: 'Lines follow an invisible current made of noise. Darker source regions attract more starting points.',
  parameters,
  primary: ['lineCount', 'noiseScale', 'lineLength', 'imageInfluence'],
  usesSpatial: true,

  generate({ artboard, random, inputs, limits }, p) {
    const noise = createNoise2D(random.stream('geometry'))
    const color = random.stream('color')
    const swatches = inputs.palette.swatches
    const hex = new Map(swatches.map((s) => [s.swatchId, oklabToHex(s.color)]))
    const { width: w, height: h } = artboard
    const frequency = p.noiseScale / Math.max(w, h)
    const darkness = inputs.spatial && darknessField(inputs.spatial)
    const seeds = placeSeeds(p.lineCount, artboard, random.stream('placement'), darkness, p.imageInfluence)

    const shapes: PathShape[] = []
    let budget = limits.maxVertices
    for (let i = 0; i < seeds.length; i++) {
      const swatch = p.paletteMapping === 'sequential' ? swatches[i % swatches.length] : weightedPick(swatches, color)
      let [x, y] = seeds[i]
      const points: Point[] = [[x, y]]
      for (let step = 0; step < p.lineLength; step++) {
        const angle = fbm(noise, x * frequency, y * frequency, p.octaves) * Math.PI * 2 * p.swirl + p.rotation
        x += Math.cos(angle) * p.stepLength
        y += Math.sin(angle) * p.stepLength
        if (x < 0 || x > w || y < 0 || y > h) break
        points.push([x, y])
      }
      if (points.length < 2) continue
      if (points.length > budget) break // vertex limit reached: stop, never freeze
      budget -= points.length
      shapes.push({
        type: 'path', points, closed: false,
        stroke: hex.get(swatch.swatchId), strokeWidth: p.strokeWidth, lineCap: 'round',
      })
    }

    return { width: w, height: h, background: BACKGROUNDS[p.background], shapes }
  },
}
