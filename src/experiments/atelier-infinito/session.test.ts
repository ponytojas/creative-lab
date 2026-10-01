import { describe, expect, it } from 'vitest'
import { defaults } from '../../core/parameters'
import { flowField } from './engines/flowField'
import { radialFields } from './engines/radialFields'
import { sessionSchema } from './session'

describe('Atelier session drafts', () => {
  it('migrates single-engine drafts (M1/M2) to per-engine parameters', () => {
    const old = { revision: 7, seed: 5, params: { ...defaults(radialFields.parameters), ringCount: 12 }, dirty: true }
    const session = sessionSchema.parse(old)
    expect(session.engineId).toBe('radial-fields')
    expect(session.paramsByEngine['radial-fields'].ringCount).toBe(12)
    expect(session.paramsByEngine['flow-field']).toEqual(defaults(flowField.parameters))
    expect(session).not.toHaveProperty('params')
  })

  it('rejects unknown engines and normalizes parameters', () => {
    expect(sessionSchema.safeParse({ revision: 1, seed: 1, engineId: 'nope', paramsByEngine: {}, dirty: false }).success).toBe(false)
    const session = sessionSchema.parse({
      revision: 1, seed: 1, engineId: 'flow-field', paramsByEngine: { 'flow-field': { lineCount: 99999 } }, dirty: false,
    })
    expect(session.paramsByEngine['flow-field'].lineCount).toBe(3000)
  })
})
