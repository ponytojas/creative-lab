import { useEffect, useEffectEvent, useState } from 'react'
import type { WorkspaceProps } from '../../../app/registry'
import { ParameterControls } from '../../../components/ParameterControls'
import { useBlobUrl } from '../../../components/useBlobUrl'
import { useLiveQuery } from '../../../components/useLiveQuery'
import { oklabToHex } from '../../../core/color/oklab'
import type { ParameterSpecs } from '../../../core/parameters'
import type { CreativeLabDb } from '../../../core/persistence/db'
import { DependencyError, listImages } from '../../../core/persistence/library'
import type { ImageResource } from '../../../core/resources/image'
import type { Palette } from '../../../core/resources/palette'
import type { SpatialColor } from '../../../core/resources/spatialColor'
import { importImage, openImage, persistExtraction, removeImage, setColors, useVisualDna } from '../session'

const ACCEPT = 'image/jpeg,image/png,image/webp'
const colorSpecs = {
  colors: { kind: 'integer', label: 'Colors', default: 6, min: 2, max: 8, mutationScale: 1 },
} as const satisfies ParameterSpecs

const percent = (w: number) => `${(w * 100).toFixed(1)}%`

function firstImageFile(list: FileList | null | undefined): File | undefined {
  return list ? [...list].find((f) => f.type.startsWith('image/') || f.type === '') : undefined
}

export function VisualDnaWorkspace({ onUsePalette }: WorkspaceProps) {
  const { persistence, image, colors, analysis, status } = useVisualDna()
  const db = persistence.db
  const canWrite = persistence.mode === 'editor'
  const imageUrl = useBlobUrl(db, image?.payload.blobId)
  const images = useLiveQuery(() => (db ? listImages(db) : Promise.resolve([])), db)
  const [message, setMessage] = useState<string>()
  const [dragging, setDragging] = useState(false)

  const take = (file: File | undefined) => {
    setMessage(undefined)
    if (file && canWrite) void importImage(file, file.name || 'Pasted image')
  }

  // Paste via the normal paste event: no clipboard permission needed.
  const onPaste = useEffectEvent((e: ClipboardEvent) => {
    const file = firstImageFile(e.clipboardData?.files)
    if (file) {
      e.preventDefault()
      take(file)
    }
  })
  useEffect(() => {
    const listener = (e: ClipboardEvent) => onPaste(e)
    addEventListener('paste', listener)
    return () => removeEventListener('paste', listener)
  }, [])

  const handOff = async () => {
    setMessage(undefined)
    try {
      onUsePalette(await persistExtraction())
    } catch (error) {
      console.error(error)
      setMessage("Couldn't store this palette.")
    }
  }

  const remove = async (target: ImageResource) => {
    if (!confirm(`Delete “${target.metadata.name}” and the palettes made from it?`)) return
    try {
      await removeImage(target)
    } catch (error) {
      setMessage(
        error instanceof DependencyError
          ? `Can't delete “${target.metadata.name}”: ${error.message}. Delete those first.`
          : `Couldn't delete “${target.metadata.name}”.`,
      )
    }
  }

  if (!db) {
    return <p className="empty">Visual DNA needs local storage, which this browser blocks.</p>
  }

  return (
    <div className={`workspace${dragging ? ' dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); take(firstImageFile(e.dataTransfer.files)) }}>
      <div className="artboard dna-stage">
        {imageUrl && image ? (
          <img className="dna-image" src={imageUrl} alt={image.metadata.name} />
        ) : (
          <div className="dna-empty">
            <p>Drop, paste or import a JPEG, PNG or WebP image.</p>
            <p className="muted">It stays in this browser. Nothing is uploaded.</p>
          </div>
        )}
      </div>

      <aside className="panel" aria-label="Controls">
        <header>
          <h1>Visual DNA</h1>
          <p className="describe">
            Groups the image's pixels into a few colors (k-means in the OKLab color space) and maps where they sit.
          </p>
        </header>

        <label className={`file-button${canWrite ? '' : ' disabled'}`}>
          Import image
          <input type="file" accept={ACCEPT} disabled={!canWrite} className="visually-hidden"
            onChange={(e) => { take(firstImageFile(e.target.files)); e.target.value = '' }} />
        </label>

        {images && images.length > 0 && (
          <section aria-label="Imported images">
            <h2 className="section-title">Images</h2>
            <ul className="image-strip">
              {images.map((img) => (
                <li key={img.id}>
                  <ImageThumb db={db} image={img} current={img.id === image?.id} onOpen={() => openImage(img)} />
                  <button type="button" className="strip-delete" disabled={!canWrite}
                    aria-label={`Delete ${img.metadata.name}`} onClick={() => remove(img)}>×</button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {status.kind === 'busy' && <p role="status">{status.message}</p>}
        {status.kind === 'error' && <p className="error" role="alert">{status.message}</p>}
        {message && <p className="error" role="alert">{message}</p>}
        {image?.payload.animated && <p className="muted">Animated image: only the first frame is analyzed.</p>}

        {image && (
          <>
            <ParameterControls specs={colorSpecs} keys={['colors']} values={{ colors }}
              onChange={(_, v) => setColors(v as number)} />
            {analysis?.kind === 'empty' && (
              <p className="error" role="alert">This image is fully transparent, so there are no colors to extract.</p>
            )}
            {analysis?.kind === 'ok' && (
              <>
                <PaletteView palette={analysis.palette} />
                <GridView spatial={analysis.spatial} palette={analysis.palette} />
                <Numbers palette={analysis.palette} spatial={analysis.spatial} />
                <button className="primary" type="button" disabled={!canWrite} onClick={handOff}>
                  Use in Atelier
                </button>
              </>
            )}
          </>
        )}

      </aside>
    </div>
  )
}

function ImageThumb({ db, image, current, onOpen }: { db: CreativeLabDb; image: ImageResource; current: boolean; onOpen: () => void }) {
  const url = useBlobUrl(db, image.payload.thumbnailBlobId)
  return (
    <button type="button" className="strip-thumb" aria-pressed={current} onClick={onOpen}
      aria-label={`Open ${image.metadata.name}`} title={image.metadata.name}>
      {url && <img src={url} alt="" />}
    </button>
  )
}

function PaletteView({ palette }: { palette: Palette }) {
  return (
    <section aria-label="Palette">
      <h2 className="section-title">Palette</h2>
      <div className="palette-bar" aria-hidden>
        {palette.swatches.map((s) => (
          <span key={s.swatchId} style={{ flexGrow: s.weight, background: oklabToHex(s.color) }} />
        ))}
      </div>
      <ul className="swatch-list">
        {palette.swatches.map((s) => (
          <li key={s.swatchId}>
            <span className="chip" style={{ background: oklabToHex(s.color) }} aria-hidden />
            <code>{oklabToHex(s.color)}</code>
            <span className="muted">{percent(s.weight)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function GridView({ spatial, palette }: { spatial: SpatialColor; palette: Palette }) {
  const swatchHex = new Map(palette.swatches.map((s) => [s.swatchId, oklabToHex(s.color)]))
  return (
    <section aria-label="Color grid">
      <h2 className="section-title">Where colors sit</h2>
      <div className="dna-grid" style={{ gridTemplateColumns: `repeat(${spatial.gridWidth}, 1fr)` }}>
        {spatial.cells.map((cell, i) => {
          const mark = i === spatial.brightestCell ? 'Brightest' : i === spatial.darkestCell ? 'Darkest' : undefined
          return (
            <div key={i} className="dna-cell" style={{ background: cell.color ? oklabToHex(cell.color) : 'transparent' }}
              title={cell.color ? `Average ${oklabToHex(cell.color)}${mark ? ` · ${mark}` : ''}` : 'No visible pixels'}>
              {cell.dominantSwatchId && (
                <span className="chip" style={{ background: swatchHex.get(cell.dominantSwatchId) }} aria-hidden />
              )}
              {mark && <span className="cell-mark">{mark}</span>}
            </div>
          )
        })}
      </div>
      <p className="muted small">Each cell: its average color; the dot is its most common palette color.</p>
    </section>
  )
}

function Numbers({ palette, spatial }: { palette: Palette; spatial: SpatialColor }) {
  const f = (n: number) => n.toFixed(3)
  return (
    <details>
      <summary>Numbers</summary>
      <table className="numbers">
        <thead><tr><th>Color</th><th>L</th><th>a</th><th>b</th><th>Share</th></tr></thead>
        <tbody>
          {palette.swatches.map((s) => (
            <tr key={s.swatchId}>
              <td><code>{oklabToHex(s.color)}</code></td>
              <td>{f(s.color.L)}</td><td>{f(s.color.a)}</td><td>{f(s.color.b)}</td><td>{percent(s.weight)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small">Tonal spread (95th − 5th luminance percentile): {f(spatial.tonalSpread)}</p>
      <table className="numbers">
        <thead><tr><th>Cell</th><th>Luminance</th><th>Contrast</th><th>Visible</th></tr></thead>
        <tbody>
          {spatial.cells.map((c, i) => (
            <tr key={i}>
              <td>{Math.floor(i / spatial.gridWidth) + 1}·{(i % spatial.gridWidth) + 1}</td>
              <td>{f(c.luminance)}</td><td>{f(c.luminanceStd)}</td><td>{percent(c.visibleWeight)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
