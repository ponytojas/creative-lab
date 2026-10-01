# 0001 — Determinism, randomness and SVG serialization

Status: accepted (M0)

## Decision

A recipe (engine id + version, `RANDOM_VERSION`, seed, validated parameters, inputs,
artboard) produces a byte-identical SVG on the same browser. Verified with golden files.

- **Seed:** uint32 integer, stored in every recipe.
- **PRNG (`RANDOM_VERSION` 1):** sfc32. Each named stream (`geometry`, `color`,
  `mutation`, `placement`) seeds its 128-bit state from four splitmix32 outputs of
  `seed XOR fnv1a32(streamName)`, then discards 12 outputs. Streams are independent: a
  new color draw never shifts geometry. Implemented in-repo, pinned by reference tests.
- **Serializer (`SERIALIZER_VERSION` 1, `core/export/svg.ts`):** numbers rounded to 3
  decimals (`toFixed(3)`, trailing zeros stripped, `-0` → `0`); fixed attribute order;
  one element per line in scene order. The same serializer feeds preview and download.
- **Colors:** canonical OKLab; display hex via linear-sRGB clamp (gamut policy v1).
- **Parameters:** normalized by the schema derived from the engine's `ParameterSpec`
  (missing → default, numbers clamped, integers rounded, angles wrapped).

## Consequences

- Any change in visible output requires bumping the engine version (or `RANDOM_VERSION`
  / `SERIALIZER_VERSION`) and regenerating golden files on purpose. Old implementations
  are kept when practical; saved recipes are never silently reinterpreted.
- Across browsers only geometric equivalence (~1e-3 units) is expected: `Math.sin` etc.
  may differ in the last bits.
- Engines must draw random numbers in a stable order. Radial Fields draws the same
  values regardless of jitter so the jitter slider morphs smoothly.

## Addendum (M2): image analysis

- Visual DNA analysis (`ANALYSIS_VERSION` 1) is deterministic for the same normalized
  pixels: stride sampling, seeded weighted k-means++ in OKLab, fixed tie-breaking and output
  order. A pinned inline snapshot guards it; changing results means bumping the version.
- Browser decoding and resizing may differ, so extracted palettes and color grids are
  persisted as immutable resources when handed to Atelier. Reopening a composition uses the
  stored palette; it never re-analyzes the image.
- Saved compositions record their inputs (`payload.inputs.palette`, mirrored in
  `provenance.inputResourceIds`). An image cannot be deleted while a saved composition uses
  a palette derived from it.

## Addendum (M3): noise, Flow Field and spatial placement

- **Noise (`NOISE_VERSION` 1, `core/random/noise.ts`):** in-repo seeded 2D Perlin gradient
  noise plus fbm, pinned by reference values. No dependency can change it.
- **Flow Field v1:** seeds from the `placement` stream, noise permutation from `geometry`,
  colors from `color`; forward Euler with a fixed step; lines stop at the artboard edge or
  after `lineLength` steps; generation stops when the vertex budget (60 000) is spent.
- **Spatial placement v1:** cell luminance normalized to the image's own range, bilinear
  between cell centers, image stretched to the artboard; rejection sampling (≤ 24 attempts,
  then the last uniform candidate). Influence 0, no map or a flat map draw exactly the same
  random numbers as uniform placement: identical output, tested.
- **Inputs:** a composition records `inputs.palette` and, for engines that read it,
  `inputs.spatial`. Reopening uses those exact resources.
- **Drafts:** working state holds parameters per engine. Older single-engine drafts are
  migrated on read (validation-time migration; it never changes how a recipe renders).
