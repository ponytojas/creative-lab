import type { ComponentType } from 'react'
import { visualDna } from '../experiments/visual-dna/definition'
import type { Persistence } from '../core/persistence'
import type { Composition } from '../core/resources/composition'
import { atelierInfinito } from '../experiments/atelier-infinito/definition'

type Result = { ok: true } | { ok: false; reason: string }

export interface WorkspaceProps {
  /** Hands a palette resource to whichever experiment accepts palettes. */
  onUsePalette: (paletteId: string) => void
}

export interface ExperimentDefinition {
  id: string
  name: string
  summary: string
  Workspace: ComponentType<WorkspaceProps>
  /** Called once at launch, before the first render. */
  init(persistence: Persistence): Promise<void>
  /** Loads a saved composition as the working copy (experiments that save compositions). */
  open?(composition: Composition): Promise<Result>
  hasUnsavedWork(): boolean
  /** Uses a palette resource as input (experiments that take palettes). */
  acceptPalette?(paletteId: string): Promise<Result>
}

/** Static registry: the shell knows experiments only through this list. */
export const experiments: readonly ExperimentDefinition[] = [atelierInfinito, visualDna]
