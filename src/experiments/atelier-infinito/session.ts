import { z } from 'zod'
import { create } from 'zustand'
import { rasterizeSvg } from '../../core/export/png'
import { defaults, schema } from '../../core/parameters'
import type { Persistence } from '../../core/persistence'
import { saveComposition } from '../../core/persistence/compositions'
import { deleteDraft, readDraft, writeDraft } from '../../core/persistence/drafts'
import { getResource } from '../../core/persistence/resources'
import { MAX_SEED, RANDOM_VERSION } from '../../core/random'
import type { Composition } from '../../core/resources/composition'
import { paletteSchema, type Palette } from '../../core/resources/palette'
import { radialFields as engine } from './engines/radialFields'
import { DEFAULT_PALETTE } from './palette'
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
  /** Palette resource used as input; undefined = built-in palette. */
  paletteId?: string
  /** Changed since it was opened or last saved. */
  dirty: boolean
}

const sessionSchema = z.object({
  revision: z.number().int().nonnegative(),
  seed: z.number().int().min(0).max(MAX_SEED),
  params: schema(engine.parameters),
  basedOn: z.string().optional(),
  paletteId: z.string().optional(),
  dirty: z.boolean(),
})

export type DraftStatus = 'saved' | 'pending' | 'error' | 'off'

interface AtelierState {
  session: Session
  /** `session.paletteId` resolved; always set together with it. */
  palette: Palette
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
  palette: DEFAULT_PALETTE,
  persistence: { mode: 'unavailable' },
  draftStatus: 'off',
}))

const { getState, setState } = useAtelier

// --- Editing -----------------------------------------------------------------

function edit(change: Partial<Pick<Session, 'seed' | 'params' | 'paletteId'>>, palette?: Palette) {
  setState(({ session, palette: current }) => ({
    session: { ...session, ...change, revision: session.revision + 1, dirty: true },
    palette: palette ?? current,
  }))
}

export const setSeed = (seed: number) => edit({ seed })
export const setParams = (params: RadialFieldsParameters) => edit({ params })
export const setParam = (key: string, value: unknown) =>
  edit({ params: { ...getState().session.params, [key]: value } })

function replace(next: Omit<Session, 'revision'>, palette: Palette) {
  setState(({ session }) => ({ session: { ...next, revision: session.revision + 1 }, palette, pendingDraft: undefined }))
}

/** Loads a palette resource; undefined id = built-in. */
async function resolvePalette(id: string | undefined): Promise<Palette | undefined> {
  if (id === undefined) return DEFAULT_PALETTE
  const { db } = getState().persistence
  return db && (await getResource(db, id, paletteSchema))?.payload
}

/** Switches the input palette (an edit). */
export async function setPalette(id: string | undefined): Promise<{ ok: true } | { ok: false; reason: string }> {
  const palette = await resolvePalette(id)
  if (!palette) return { ok: false, reason: 'That palette is no longer available.' }
  edit({ paletteId: id }, palette)
  return { ok: true }
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
    const palette = restored && (await resolvePalette(restored.paletteId))
    setState(
      restored && palette ? { session: { ...restored, revision }, palette } : { session: freshSession(revision) },
    )
    return
  }
  setState({ session: freshSession(revision), pendingDraft: restored, draftStatus: 'saved' })
  startDraftWriter(persistence.db)
}

export async function restoreDraft() {
  const { pendingDraft } = getState()
  if (!pendingDraft) return
  const palette = await resolvePalette(pendingDraft.paletteId)
  // A palette deleted since the draft was written falls back to the built-in one.
  if (palette) replace(pendingDraft, palette)
  else replace({ ...pendingDraft, paletteId: undefined, dirty: true }, DEFAULT_PALETTE)
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
  const { session, persistence, palette } = getState()
  if (persistence.mode !== 'editor') throw new Error('Saving is not available in this tab.')
  if (!session.dirty && session.basedOn) return 'unchanged'

  // Everything slow or fallible happens before the transaction.
  const params = schema(engine.parameters).parse(session.params)
  const svg = renderRadialFields(session.seed, params, palette)
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
      inputs: session.paletteId ? { palette: session.paletteId } : {},
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
export async function openComposition(composition: Composition): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { payload } = composition
  if (payload.engineId !== engine.id || payload.engineVersion !== engine.version || payload.randomVersion !== RANDOM_VERSION) {
    return { ok: false, reason: `Made with ${payload.engineId} v${payload.engineVersion}, which this version can't edit.` }
  }
  const params = schema(engine.parameters).safeParse(payload.parameters)
  if (!params.success) return { ok: false, reason: 'Its parameters are invalid for this engine.' }
  const palette = await resolvePalette(payload.inputs.palette)
  if (!palette) return { ok: false, reason: 'Its palette is missing.' }
  replace({ seed: payload.seed, params: params.data, paletteId: payload.inputs.palette, basedOn: composition.id, dirty: false }, palette)
  return { ok: true }
}
