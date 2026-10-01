import { describe, expect, it } from 'vitest'
import { escapeXml, formatNumber, serializeSvg } from './svg'

describe('core/export SVG serializer v1', () => {
  it('formats numbers with 3 fixed decimals, no trailing zeros, no -0', () => {
    expect(formatNumber(1)).toBe('1')
    expect(formatNumber(100)).toBe('100')
    expect(formatNumber(0.5)).toBe('0.5')
    expect(formatNumber(1.23456)).toBe('1.235')
    expect(formatNumber(-0.0001)).toBe('0')
    expect(formatNumber(-0)).toBe('0')
    expect(formatNumber(-2.5)).toBe('-2.5')
    expect(() => formatNumber(NaN)).toThrow()
  })

  it('escapes XML special characters', () => {
    expect(escapeXml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;')
  })

  it('emits a fixed structure and attribute order', () => {
    const svg = serializeSvg({
      width: 100,
      height: 50,
      background: '#ffffff',
      shapes: [
        { type: 'path', points: [[0, 0], [10.0004, 5.5]], closed: false, stroke: '#ff0000', strokeWidth: 2, lineCap: 'round' },
        { type: 'path', points: [[1, 1], [2, 2], [3, 1]], closed: true, fill: '#00ff00' },
      ],
    })
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50">\n' +
        '<rect width="100" height="50" fill="#ffffff"/>\n' +
        '<path d="M0 0L10 5.5" fill="none" stroke="#ff0000" stroke-width="2" stroke-linecap="round"/>\n' +
        '<path d="M1 1L2 2L3 1Z" fill="#00ff00"/>\n' +
        '</svg>\n',
    )
  })
})
