import type { ComponentType } from 'react'
import { atelierInfinito } from '../experiments/atelier-infinito/definition'

export interface ExperimentDefinition {
  id: string
  name: string
  summary: string
  Workspace: ComponentType
}

/** Static registry: the shell knows experiments only through this list. */
export const experiments: readonly ExperimentDefinition[] = [atelierInfinito]
