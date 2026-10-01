// Byte-stable SVG serializer shared by preview, download and (later) snapshots
// and PNG export. Same scene -> same string. Changing the output format means
// bumping SERIALIZER_VERSION and updating golden files deliberately.
//
// v1 conventions: numbers rounded to 3 decimals with trailing zeros stripped
// and -0 written as 0; fixed attribute order; one element per line, emitted in
// scene order; no whitespace variation.

export const SERIALIZER_VERSION = 1

export type Point = readonly [x: number, y: number]

export interface PathShape {
  type: 'path'
  points: readonly Point[]
  closed: boolean
  /** `#rrggbb` or omitted for none. */
  fill?: string
  stroke?: string
  strokeWidth?: number
  lineCap?: 'butt' | 'round' | 'square'
}

/** Fixed logical coordinate system: viewBox is `0 0 width height`. */
export interface SvgScene {
  width: number
  height: number
  background?: string
  shapes: readonly PathShape[]
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Non-finite number in scene: ${value}`)
  const text = value.toFixed(3).replace(/\.?0+$/, '')
  return text === '-0' ? '0' : text
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
export const escapeXml = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPES[c])

function pathData(points: readonly Point[], closed: boolean): string {
  const d = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${formatNumber(x)} ${formatNumber(y)}`)
    .join('')
  return closed ? d + 'Z' : d
}

function serializePath(shape: PathShape): string {
  const attrs: string[] = [
    `d="${pathData(shape.points, shape.closed)}"`,
    `fill="${escapeXml(shape.fill ?? 'none')}"`,
  ]
  if (shape.stroke !== undefined) {
    attrs.push(`stroke="${escapeXml(shape.stroke)}"`)
    if (shape.strokeWidth !== undefined) attrs.push(`stroke-width="${formatNumber(shape.strokeWidth)}"`)
    if (shape.lineCap !== undefined) attrs.push(`stroke-linecap="${shape.lineCap}"`)
  }
  return `<path ${attrs.join(' ')}/>`
}

export function serializeSvg(scene: SvgScene): string {
  const w = formatNumber(scene.width)
  const h = formatNumber(scene.height)
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
  ]
  if (scene.background !== undefined) {
    lines.push(`<rect width="${w}" height="${h}" fill="${escapeXml(scene.background)}"/>`)
  }
  for (const shape of scene.shapes) lines.push(serializePath(shape))
  lines.push('</svg>')
  return lines.join('\n') + '\n'
}
