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
