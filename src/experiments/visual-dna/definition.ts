import { VisualDnaWorkspace } from './components/VisualDnaWorkspace'
import { EXPERIMENT_ID, initVisualDna } from './session'

export const visualDna = {
  id: EXPERIMENT_ID,
  name: 'Visual DNA',
  summary: 'Extract the palette and color layout of your own images.',
  Workspace: VisualDnaWorkspace,
  init: initVisualDna,
  // Images are stored on import: there is never unsaved work here.
  hasUnsavedWork: () => false,
}
