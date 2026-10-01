import { z } from 'zod'
import { create } from 'zustand'
import { rasterizeSvg } from '../../core/export/png'
import { defaults, schema } from '../../core/parameters'
import type { Persistence } from '../../core/persistence'
import { saveComposition } from '../../core/persistence/compositions'
import { deleteDraft, readDraft, writeDraft } from '../../core/persistence/drafts'
import { getResource, listResources } from '../../core/persistence/resources'
import { MAX_SEED, RANDOM_VERSION } from '../../core/random'
import type { Composition } from '../../core/resources/composition'
import { paletteSchema } from '../../core/resources/palette'
import { spatialColorSchema } from '../../core/resources/spatialColor'
import { DEFAULT_PALETTE } from './palette'
import {
  ARTBOARD, DEFAULT_SEED, ENGINE_IDS, ENGINES, getEngine, renderComposition,
  type AnyEngine, type EngineParameters, type RenderInputs,
} from './render'

export const EXPERIMENT_ID = 'atelier-infinito'
const DRAFT_ID = EXPERIMENT_ID
const DRAFT_DELAY_MS = 750
const THUMBNAIL_PX = 400

type Result = { ok: true } | { ok: false; reason: string }

/** Working state. Every change bumps `revision`; drafts never go backwards. */
export interface Session {
  revision: number
  seed: number
  engineId: string
  /** Last parameters per engine, so switching engines and back restores them. */
  paramsByEngine: Record<string, EngineParameters>
  /** Composition this work was opened from or last saved as; parent of the next save. */
  basedOn?: string
  /** Palette resource used as input; undefined = built-in palette. Its paired color grid comes with it. */
  paletteId?: string
  /** Changed since it was opened or last saved. */
  dirty: boolean
}

/** Drafts written before Flow Field had a single `params` object for Radial Fields. */
function migrateDraft(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || !('params' in raw) || 'paramsByEngine' in raw) return raw
  const { params, ...rest } = raw as { params: unknown }
  return { ...rest, engineId: 'radial-fields', paramsByEngine: { 'radial-fields': params } }
}

const allDefaults = (): Record<string, EngineParameters> =>
  Object.fromEntries(ENGINES.map((e) => [e.id, defaults(e.parameters)]))

export const sessionSchema = z.preprocess(
  migrateDraft,
  z.object({
    revision: z.number().int().nonnegative(),
    seed: z.number().int().min(0).max(MAX_SEED),
    engineId: z.enum(ENGINE_IDS),
    paramsByEngine: z.object(Object.fromEntries(ENGINES.map((e) => [e.id, schema(e.parameters).optional()]))),
    basedOn: z.string().optional(),
    paletteId: z.string().optional(),
    dirty: z.boolean(),
  }).transform((s): Session => ({ ...s, paramsByEngine: { ...allDefaults(), ...stripUndefined(s.paramsByEngine) } })),
)

function stripUndefined<T>(record: Record<string, T | undefined>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined)) as Record<string, T>
}

export type DraftStatus = 'saved' | 'pending' | 'error' | 'off'

/** Resolved inputs: always set together with `session.paletteId`. */
export interface Inputs extends RenderInputs {
  spatialId?: string
}

interface AtelierState {
  session: Session
  inputs: Inputs
  persistence: Persistence
  /** A previous session offered for recovery on launch. Draft writes pause while it is pending. */
  pendingDraft?: Session
  draftStatus: DraftStatus
}

const BUILT_IN: Inputs = { palette: DEFAULT_PALETTE }

const freshSession = (revision: number): Session => ({
  revision,
  seed: DEFAULT_SEED,
  engineId: ENGINES[0].id,
  paramsByEngine: allDefaults(),
  dirty: false,
})

export const useAtelier = create<AtelierState>(() => ({
  session: freshSession(1),
  inputs: BUILT_IN,
  persistence: { mode: 'unavailable' },
  draftStatus: 'off',
}))

const { getState, setState } = useAtelier

export const currentEngine = (session: Session): AnyEngine => getEngine(session.engineId) ?? ENGINES[0]
export const currentParams = (session: Session): EngineParameters =>
  session.paramsByEngine[session.engineId] ?? defaults(currentEngine(session).parameters)

// --- Editing -----------------------------------------------------------------

function edit(change: Partial<Pick<Session, 'seed' | 'engineId' | 'paramsByEngine' | 'paletteId'>>, inputs?: Inputs) {
  setState(({ session, inputs: current }) => ({
    session: { ...session, ...change, revision: session.revision + 1, dirty: true },
    inputs: inputs ?? current,
  }))
}

export const setSeed = (seed: number) => edit({ seed })
export const setEngine = (engineId: string) => getEngine(engineId) && edit({ engineId })

export function setParams(params: EngineParameters) {
  const { session } = getState()
  edit({ paramsByEngine: { ...session.paramsByEngine, [session.engineId]: params } })
}
export const setParam = (key: string, value: unknown) =>
  setParams({ ...currentParams(getState().session), [key]: value } as EngineParameters)

function replace(next: Omit<Session, 'revision'>, inputs: Inputs) {
  setState(({ session }) => ({ session: { ...next, revision: session.revision + 1 }, inputs, pendingDraft: undefined }))
}

/**
 * Loads the palette and its color grid. Without `spatialId`, the grid extracted
 * together with the palette is used. Undefined palette id = built-in (no grid).
 */
async function resolveInputs(paletteId: string | undefined, spatialId?: string): Promise<Inputs | undefined> {
  if (paletteId === undefined) return BUILT_IN
  const { db } = getState().persistence
  if (!db) return undefined
  const palette = await getResource(db, paletteId, paletteSchema)
  if (!palette) return undefined
  const spatial = spatialId
    ? await getResource(db, spatialId, spatialColorSchema)
    : (await listResources(db, 'spatial-color', spatialColorSchema)).find(
        (s) => s.provenance.config?.paletteResourceId === paletteId,
      )
  if (spatialId && !spatial) return undefined
  return { palette: palette.payload, spatial: spatial?.payload, spatialId: spatial?.id }
}

/** Switches the input palette (an edit). */
export async function setPalette(id: string | undefined): Promise<Result> {
  const inputs = await resolveInputs(id)
  if (!inputs) return { ok: false, reason: 'That palette is no longer available.' }
  edit({ paletteId: id }, inputs)
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
    const inputs = restored && (await resolveInputs(restored.paletteId))
    setState(restored && inputs ? { session: { ...restored, revision }, inputs } : { session: freshSession(revision) })
    return
  }
  setState({ session: freshSession(revision), pendingDraft: restored, draftStatus: 'saved' })
  startDraftWriter(persistence.db)
}

export async function restoreDraft() {
  const { pendingDraft } = getState()
  if (!pendingDraft) return
  const inputs = await resolveInputs(pendingDraft.paletteId)
  // A palette deleted since the draft was written falls back to the built-in one.
  if (inputs) replace(pendingDraft, inputs)
  else replace({ ...pendingDraft, paletteId: undefined, dirty: true }, BUILT_IN)
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
  const { session, persistence, inputs } = getState()
  if (persistence.mode !== 'editor') throw new Error('Saving is not available in this tab.')
  if (!session.dirty && session.basedOn) return 'unchanged'

  // Everything slow or fallible happens before the transaction.
  const engine = currentEngine(session)
  const params = schema(engine.parameters).parse(currentParams(session))
  const usedSpatial = engine.usesSpatial ? inputs.spatialId : undefined
  const svg = renderComposition(engine, session.seed, params, {
    palette: inputs.palette,
    spatial: usedSpatial ? inputs.spatial : undefined,
  })
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
      inputs: {
        ...(session.paletteId && { palette: session.paletteId }),
        ...(usedSpatial && { spatial: usedSpatial }),
      },
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
export async function openComposition(composition: Composition): Promise<Result> {
  const { payload } = composition
  const engine = getEngine(payload.engineId)
  if (!engine || payload.engineVersion !== engine.version || payload.randomVersion !== RANDOM_VERSION) {
    return { ok: false, reason: `Made with ${payload.engineId} v${payload.engineVersion}, which this version can't edit.` }
  }
  const params = schema(engine.parameters).safeParse(payload.parameters)
  if (!params.success) return { ok: false, reason: 'Its parameters are invalid for this engine.' }
  const inputs = await resolveInputs(payload.inputs.palette, payload.inputs.spatial)
  if (!inputs) return { ok: false, reason: 'One of its inputs (palette or color grid) is missing.' }
  replace(
    {
      seed: payload.seed,
      engineId: engine.id,
      paramsByEngine: { ...getState().session.paramsByEngine, [engine.id]: params.data },
      paletteId: payload.inputs.palette,
      basedOn: composition.id,
      dirty: false,
    },
    inputs,
  )
  return { ok: true }
}
