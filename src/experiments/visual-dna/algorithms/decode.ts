import type { Pixels } from './analyze'
import { sniffImage, type ImageHeader } from './sniff'

// Browser-side validation and normalization. Limits are adjustable defaults (plan §12).
export const IMPORT_LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  maxPixels: 32_000_000,
  maxAnalysisDimension: 512,
  thumbnailPx: 160,
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

const megapixels = (w: number, h: number) => `${((w * h) / 1e6).toFixed(1)} MP`

/** Validates size and format from the bytes, before any full decode. */
export async function validateImageFile(file: Blob): Promise<ImageHeader> {
  if (file.size > IMPORT_LIMITS.maxBytes) throw new ImportError('This file is larger than 25 MiB.')
  const header = sniffImage(new Uint8Array(await file.arrayBuffer()))
  if (!header) throw new ImportError('This is not a JPEG, PNG or WebP image, or the file is damaged.')
  if (header.width * header.height > IMPORT_LIMITS.maxPixels) {
    throw new ImportError(`This image is ${megapixels(header.width, header.height)}; the limit is 32 MP.`)
  }
  return header
}

async function decode(blob: Blob): Promise<ImageBitmap> {
  try {
    // Orientation is applied exactly once, here.
    return await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    throw new ImportError("The image couldn't be decoded. The file may be damaged.")
  }
}

function draw(source: CanvasImageSource, width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true })
  if (!context) throw new ImportError('Canvas 2D is unavailable in this browser.')
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, width, height)
  return { canvas, context }
}

const fit = (w: number, h: number, max: number) => {
  const scale = Math.min(1, max / Math.max(w, h))
  return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))] as const
}

/** Decodes, orients, converts to sRGB and downsamples (aspect kept) to the analysis size. */
export async function decodeForAnalysis(blob: Blob): Promise<{ pixels: Pixels; width: number; height: number }> {
  const bitmap = await decode(blob)
  try {
    const { width, height } = bitmap
    if (width * height > IMPORT_LIMITS.maxPixels) {
      throw new ImportError(`This image is ${megapixels(width, height)}; the limit is 32 MP.`)
    }
    const [w, h] = fit(width, height, IMPORT_LIMITS.maxAnalysisDimension)
    const small = await createImageBitmap(bitmap, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' })
    const { context } = draw(small, w, h)
    small.close()
    const data = context.getImageData(0, 0, w, h, { colorSpace: 'srgb' }).data
    return { pixels: { width: w, height: h, data }, width, height }
  } finally {
    bitmap.close()
  }
}

export async function makeThumbnail(blob: Blob): Promise<Blob> {
  const bitmap = await decode(blob)
  try {
    const [w, h] = fit(bitmap.width, bitmap.height, IMPORT_LIMITS.thumbnailPx)
    return await draw(bitmap, w, h).canvas.convertToBlob({ type: 'image/png' })
  } finally {
    bitmap.close()
  }
}
