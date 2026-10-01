// Seeded randomness. Changing any output of this file changes every saved
// artwork: bump RANDOM_VERSION and keep the old implementation instead.
//
// v1: each named stream is an sfc32 generator whose 128-bit state is filled by
// splitmix32, seeded with `seed XOR fnv1a32(streamName)`, then warmed up.

export const RANDOM_VERSION = 1

export interface Rng {
  /** Next uint32. */
  uint32(): number
  /** Float in [0, 1). */
  next(): number
  /** Float in [min, max). */
  range(min: number, max: number): number
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number
}

export type StreamName = 'geometry' | 'color' | 'mutation' | 'placement'

export interface RandomStreams {
  stream(name: StreamName): Rng
}

export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function splitmix32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x9e3779b9) | 0
    let z = state
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad)
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97)
    return (z ^ (z >>> 15)) >>> 0
  }
}

export function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0
    const t = (((a + b) | 0) + d) | 0
    d = (d + 1) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    c = (c + t) | 0
    return t >>> 0
  }
}

export function createRng(seed: number): Rng {
  const mix = splitmix32(seed)
  const uint32 = sfc32(mix(), mix(), mix(), mix())
  for (let i = 0; i < 12; i++) uint32()
  const next = () => uint32() / 4294967296
  return {
    uint32,
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
  }
}

export function createStreams(seed: number): RandomStreams {
  return { stream: (name) => createRng((seed ^ fnv1a32(name)) >>> 0) }
}

export const MAX_SEED = 0xffffffff

export function isSeed(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_SEED
}
