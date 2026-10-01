import { z } from 'zod'
import { create } from 'zustand'
import { rasterizeSvg } from '../../core/export/png'
import { defaults, schema } from '../../core/parameters'
import type { Persistence } from '../../core/persistence'
import { saveComposition } from '../../core/persistence/compositions'
import { deleteDraft, readDraft, writeDraft } from '../../core/persistence/drafts'
import { MAX_SEED, RANDOM_VERSION } from '../../core/random'
import type { Composition } from '../../core/resources/composition'
import { radialFields as engine } from './engines/radialFields'
import { ARTBOARD, DEFAULT_SEED, renderRadialFields, type RadialFieldsParameters } from './render'

export const EXPERIMENT_ID = 'atelier-infinito'
const DRAFT_ID = EXPERIMENT_ID
const DRAFT_DELAY_MS = 750
const THUMBNAIL_PX = 400

/** Working state. Every change bumps `revision`; drafts never go backwards. */
export interface Session {
  revision: number
  seed: number
  params: RadialFieldsParameters
  /** Composition this work was opened from or last saved as; parent of the next save. */
  basedOn?: string
  /** Changed since it was opened or last saved. */
  dirty: boolean
}

const sessionSchema = z.object({
  revision: z.number().int().nonnegative(),
  seed: z.number().int().min(0).max(MAX_SEED),
  params: schema(engine.parameters),
  basedOn: z.string().optional(),
  dirty: z.boolean(),
})

export type DraftStatus = 'saved' | 'pending' | 'error' | 'off'

interface AtelierState {
  session: Session
  persistence: Persistence
  /** A previous session offered for recovery on launch. Draft writes pause while it is pending. */
  pendingDraft?: Session
  draftStatus: DraftStatus
}

const freshSession = (revision: number): Session => ({
  revision,
  seed: DEFAULT_SEED,
  params: defaults(engine.parameters),
  dirty: false,
})

export const useAtelier = create<AtelierState>(() => ({
  session: freshSession(1),
  persistence: { mode: 'unavailable' },
  draftStatus: 'off',
}))

const { getState, setState } = useAtelier

// --- Editing -----------------------------------------------------------------

function edit(change: Partial<Pick<Session, 'seed' | 'params'>>) {
  setState(({ session }) => ({ session: { ...session, ...change, revision: session.revision + 1, dirty: true } }))
}

export const setSeed = (seed: number) => edit({ seed })
export const setParams = (params: RadialFieldsParameters) => edit({ params })
export const setParam = (key: string, value: unknown) =>
  edit({ params: { ...getState().session.params, [key]: value } })

function replace(next: Omit<Session, 'revision'>) {
  setState(({ session }) => ({ session: { ...next, revision: session.revision + 1 }, pendingDraft: undefined }))
}

// --- Launch and draft recovery ---------------------------------------------------

export async function initAtelier(persistence: Persistence): Promise<void> {
  setState({ persistence })
  if (!persistence.db) return

  const draft = await readDraft(persistence.db, DRAFT_ID)
  const parsed = draft ? sessionSchema.safeParse(draft.state) : undefined
  if (parsed && !parsed.success) console.warn('Ignoring incompatible Atelier draft', parsed.error)
  const restored = parsed?.success ? parsed.data : undefined
  // Continue numbering above the stored draft so new writes are never "stale".
  const revision = (draft?.revision ?? 0) + 1

  if (persistence.mode === 'readonly') {
    // Show the editor tab's latest state; never write.
    setState({ session: restored ? { ...restored, revision } : freshSession(revision) })
    return
  }
  setState({ session: freshSession(revision), pendingDraft: restored, draftStatus: 'saved' })
  startDraftWriter(persistence.db)
}

export function restoreDraft() {
  const { pendingDraft } = getState()
  if (pendingDraft) replace(pendingDraft)
}

/** Discards the offered draft. Anything edited meanwhile is written right after. */
export function dismissDraft() {
  const { persistence, session } = getState()
  setState({ pendingDraft: undefined })
  if (persistence.mode !== 'editor') return
  void deleteDraft(persistence.db, DRAFT_ID)
  if (session.dirty) scheduleDraft()
}

let scheduleDraft = () => {}

function startDraftWriter(db: NonNullable<Persistence['db']>) {
  let timer: ReturnType<typeof setTimeout> | undefined

  const flush = () => {
    clearTimeout(timer)
    timer = undefined
    const { session } = getState()
    writeDraft(db, { id: DRAFT_ID, revision: session.revision, updatedAt: new Date().toISOString(), state: session })
      .then((result) => {
        if (result === 'stale') setState({ draftStatus: 'error' })
        else if (getState().session.revision === session.revision) setState({ draftStatus: 'saved' })
      })
      .catch((error: unknown) => {
        console.error('Draft write failed', error)
        setState({ draftStatus: 'error' })
      })
  }

  // Throttled, not debounced: continuous changes (auto mode, long drags) still get written.
  scheduleDraft = () => {
    setState({ draftStatus: 'pending' })
    timer ??= setTimeout(flush, DRAFT_DELAY_MS)
  }

  useAtelier.subscribe((state, prev) => {
    if (state.session !== prev.session && !state.pendingDraft) scheduleDraft()
  })

  // Best effort when the tab is hidden or closed; the throttle above is the real guarantee.
  const flushPending = () => timer !== undefined && flush()
  addEventListener('pagehide', flushPending)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushPending())
}

// --- Saved compositions --------------------------------------------------------------

export const hasUnsavedWork = () => getState().session.dirty

/** Saves the current working state as a new composition. Resolves only after commit. */
export async function saveCurrent(): Promise<Composition | 'unchanged'> {
  const { session, persistence } = getState()
  if (persistence.mode !== 'editor') throw new Error('Saving is not available in this tab.')
  if (!session.dirty && session.basedOn) return 'unchanged'

  // Everything slow or fallible happens before the transaction.
  const params = schema(engine.parameters).parse(session.params)
  const svg = renderRadialFields(session.seed, params)
  const thumbnail = await rasterizeSvg(svg, THUMBNAIL_PX)

  const composition = await saveComposition(persistence.db, {
    recipe: {
      experimentId: EXPERIMENT_ID,
      engineId: engine.id,
      engineVersion: engine.version,
      seed: session.seed,
      randomVersion: RANDOM_VERSION,
      parameters: params,
      artboard: ARTBOARD,
      parentId: session.basedOn,
    },
    producerId: `${EXPERIMENT_ID}/${engine.id}`,
    namePrefix: engine.name,
    svg: new Blob([svg], { type: 'image/svg+xml' }),
    thumbnail,
  })

  // Changes made while saving (e.g. auto mode) stay unsaved.
  setState(({ session: current }) => ({
    session: {
      ...current,
      basedOn: composition.id,
      dirty: current.revision !== session.revision,
      revision: current.revision + 1,
    },
  }))
  return composition
}

/** Opens a saved composition as a working copy; the saved item never changes. */
export function openComposition(composition: Composition): { ok: true } | { ok: false; reason: string } {
  const { payload } = composition
  if (payload.engineId !== engine.id || payload.engineVersion !== engine.version || payload.randomVersion !== RANDOM_VERSION) {
    return { ok: false, reason: `Made with ${payload.engineId} v${payload.engineVersion}, which this version can't edit.` }
  }
  const params = schema(engine.parameters).safeParse(payload.parameters)
  if (!params.success) return { ok: false, reason: 'Its parameters are invalid for this engine.' }
  replace({ seed: payload.seed, params: params.data, basedOn: composition.id, dirty: false })
  return { ok: true }
}
