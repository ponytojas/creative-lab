import { AtelierWorkspace } from './components/AtelierWorkspace'
import { EXPERIMENT_ID, hasUnsavedWork, initAtelier, openComposition } from './session'

export const atelierInfinito = {
  id: EXPERIMENT_ID,
  name: 'Atelier Infinito',
  summary: 'Generative compositions from seeded geometric engines.',
  Workspace: AtelierWorkspace,
  init: initAtelier,
  open: openComposition,
  hasUnsavedWork,
}
