import { z } from 'zod'
import { create } from 'zustand'
import type { Persistence } from '../../core/persistence'
import { getBlob } from '../../core/persistence/compositions'
import { readDraft, writeDraft } from '../../core/persistence/drafts'
import { deleteImage, saveExtraction, saveImage } from '../../core/persistence/library'
import { getResource } from '../../core/persistence/resources'
import { imageSchema, type ImageResource } from '../../core/resources/image'
import { analyze, ANALYSIS_VERSION, DEFAULT_ANALYSIS, type AnalysisResult, type Pixels } from './algorithms/analyze'
import { decodeForAnalysis, ImportError, makeThumbnail, validateImageFile } from './algorithms/decode'

export const EXPERIMENT_ID = 'visual-dna'
const DRAFT_ID = EXPERIMENT_ID

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; message: string }
  | { kind: 'error'; message: string }

interface VisualDnaState {
  persistence: Persistence
  image?: ImageResource
  colors: number
  analysis?: AnalysisResult
  status: Status
}

export const useVisualDna = create<VisualDnaState>(() => ({
  persistence: { mode: 'unavailable' },
  colors: DEFAULT_ANALYSIS.colors,
  status: { kind: 'idle' },
}))

const { getState, setState } = useVisualDna

// Analysis pixels stay out of application state (plan §16); only the current image's are kept.
let cached: { imageId: string; pixels: Pixels } | undefined

const configFor = (colors: number) => ({ ...DEFAULT_ANALYSIS, colors })

// --- Draft: which image is open and the colors setting -------------------------

const draftSchema = z.object({ imageId: z.string().optional(), colors: z.number().int().min(2).max(8) })
let revision = 0

function persistDraft() {
  const { persistence, image, colors } = getState()
  if (persistence.mode !== 'editor') return
  revision++
  writeDraft(persistence.db, {
    id: DRAFT_ID, revision, updatedAt: new Date().toISOString(), state: { imageId: image?.id, colors },
  }).catch((error: unknown) => console.error('Visual DNA draft write failed', error))
}

export async function initVisualDna(persistence: Persistence): Promise<void> {
  setState({ persistence })
  if (!persistence.db) return
  const draft = await readDraft(persistence.db, DRAFT_ID)
  revision = draft?.revision ?? 0
  const parsed = draftSchema.safeParse(draft?.state)
  if (!parsed.success) return
  setState({ colors: parsed.data.colors })
  const image = parsed.data.imageId && (await getResource(persistence.db, parsed.data.imageId, imageSchema))
  // Decoding can take a moment: don't hold up launch.
  if (image) void openImage(image, { persist: false })
}

// --- Actions ------------------------------------------------------------------

function fail(error: unknown) {
  console.error(error)
  const message = error instanceof ImportError ? error.message : 'Something went wrong while reading this image.'
  setState({ status: { kind: 'error', message } })
}

function runAnalysis() {
  const { colors, image } = getState()
  if (!cached || cached.imageId !== image?.id) return
  setState({ analysis: analyze(cached.pixels, configFor(colors)), status: { kind: 'idle' } })
}

/** Imports a file: validate bytes → decode → store original + thumbnail → analyze. */
export async function importImage(file: Blob, filename: string): Promise<void> {
  const { persistence } = getState()
  if (persistence.mode !== 'editor') return
  setState({ status: { kind: 'busy', message: 'Importing…' } })
  try {
    const header = await validateImageFile(file)
    const { pixels, width, height } = await decodeForAnalysis(file)
    const thumbnail = await makeThumbnail(file)
    const name = filename.replace(/\.[^.]+$/, '').trim().slice(0, 120) || 'Pasted image'
    const image = await saveImage(persistence.db, {
      payload: {
        mediaType: header.mediaType, width, height, originalFilename: filename.slice(0, 255),
        byteSize: file.size, animated: header.animated,
        normalization: { orientation: 'from-image', colorSpace: 'srgb' },
      },
      name,
      original: new Blob([file], { type: header.mediaType }),
      thumbnail,
    })
    cached = { imageId: image.id, pixels }
    setState({ image })
    persistDraft()
    runAnalysis()
  } catch (error) {
    fail(error)
  }
}

export async function openImage(image: ImageResource, { persist = true } = {}): Promise<void> {
  const { db } = getState().persistence
  if (!db) return
  setState({ image, analysis: undefined, status: { kind: 'busy', message: 'Analyzing…' } })
  if (persist) persistDraft()
  try {
    const blob = await getBlob(db, image.payload.blobId)
    if (!blob) throw new ImportError('The original file of this image is missing.')
    const { pixels } = await decodeForAnalysis(blob)
    if (getState().image?.id !== image.id) return // another image was opened meanwhile
    cached = { imageId: image.id, pixels }
    runAnalysis()
  } catch (error) {
    fail(error)
  }
}

export function setColors(colors: number) {
  setState({ colors })
  persistDraft()
  runAnalysis()
}

/** Persists the current extraction (deduplicated) and returns the palette resource id. */
export async function persistExtraction(): Promise<string> {
  const { persistence, image, analysis, colors } = getState()
  if (persistence.mode !== 'editor' || !image || analysis?.kind !== 'ok') throw new Error('Nothing to hand off.')
  const { palette } = await saveExtraction(persistence.db, {
    image,
    producerId: `${EXPERIMENT_ID}/palette`,
    producerVersion: ANALYSIS_VERSION,
    config: configFor(colors) as unknown as Record<string, unknown>,
    palette: analysis.palette,
    spatial: analysis.spatial,
  })
  return palette.id
}

/** Throws DependencyError when a saved composition still uses it. */
export async function removeImage(image: ImageResource): Promise<void> {
  const { persistence } = getState()
  if (persistence.mode !== 'editor') return
  await deleteImage(persistence.db, image.id)
  if (getState().image?.id === image.id) {
    cached = undefined
    setState({ image: undefined, analysis: undefined, status: { kind: 'idle' } })
    persistDraft()
  }
}
