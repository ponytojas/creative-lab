import type { ComponentType } from 'react'
import type { Persistence } from '../core/persistence'
import type { Composition } from '../core/resources/composition'
import { atelierInfinito } from '../experiments/atelier-infinito/definition'

export interface ExperimentDefinition {
  id: string
  name: string
  summary: string
  Workspace: ComponentType
  /** Called once at launch, before the first render. */
  init(persistence: Persistence): Promise<void>
  /** Loads a saved composition as the working copy. */
  open(composition: Composition): { ok: true } | { ok: false; reason: string }
  hasUnsavedWork(): boolean
}

/** Static registry: the shell knows experiments only through this list. */
export const experiments: readonly ExperimentDefinition[] = [atelierInfinito]
