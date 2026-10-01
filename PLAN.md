# Creative Lab — Product & Implementation Plan

Status: Implementation baseline  
Revision: 1.2  
Date: 2026-10-01  
Project type: Local-first creative coding laboratory  
Primary platform: Desktop web application  
Initial deployment: Local static server  
Optional deployment: Private static hosting  
Commercial objective: None  
Primary objective: Creative discovery, learning, and repeated personal use

---

## 0. What changed in 1.2

Revision 1.1 fixed the operational gaps of the original plan but inherited two problems: it still postponed the first creative result to the third milestone, and it specified several things twice in slightly different ways. This revision:

- **Makes the first milestone the first playable instrument.** M0 is now Radial Fields with a built-in palette, a seed, three controls and SVG download — no persistence, no image import. The plan's own success question ("is this enjoyable?") is answered by the first assignment, not the third.
- **Unifies parameter descriptors, normalization and mutation.** One `ParameterSpec` map per engine is the single source of truth for defaults, validation (Zod schema derived from it), UI controls and mutation. The separate `normalize()` method and the section-14 descriptor list described the same information and would have drifted.
- **Picks one canonical color space: OKLab.** Analysis runs in OKLab, swatches are stored in OKLab, sRGB display values are derived with one documented gamut policy. 1.1 proposed sRGB as canonical while clustering in OKLab, which forces a lossy round trip.
- **Makes SVG serialization byte-stable.** Fixed numeric precision, fixed attribute order, generation order preserved. "Same recipe → same output" becomes a string comparison and a golden-file test instead of a vaguely documented tolerance.
- **Cuts 0.1 scope.** Service worker / offline relaunch, multi-tab takeover UI and the five-way version split are deferred or simplified. Backup/restore stays, because browser storage can vanish.
- **Shortens the document.** The 1.0→1.1 review table and reference links moved to the appendix; agent instructions read the body only. Future-module contracts are kept brief.

Everything not listed here is carried over from 1.1 in condensed form.

---

## 1. Purpose

Creative Lab is a personal collection of computational instruments for exploring color, geometry, images, typography, motion, sound and simulation.

The defining workflow:

1. Start with an interesting default or an input.
2. Manipulate an algorithm.
3. Discover a result worth keeping.
4. Save the editable recipe.
5. Reuse an output in another experiment.

Make mathematical systems approachable without hiding their behavior. Success is enjoyable exploration and returning to saved work, not module count.

### Principles

- Show something interesting before asking for configuration.
- Keep the artwork central.
- Prefer expressive algorithms over decorative templates.
- Offer a few meaningful controls before exposing technical parameters.
- Keep core functionality local and independent of AI.
- Make saved work reproducible and portable.
- Introduce shared abstractions only when working experiments justify them.
- Preserve the hobby character of the project.

### Non-goals (initial product)

- Accounts, collaboration, cloud sync, social features.
- Node editor, timeline editor, scripting environment, plugin marketplace.
- Photoshop-style editing, layers, selection tools.
- A universal renderer.
- AI-generated images or executable AI-generated code.
- Production publishing or asset management.

---

## 2. Scope and Release Boundaries

### First playable checkpoint (= M0)

- Radial Fields engine with a built-in default palette.
- Editable seed, "New seed", three or four expressive controls, advanced parameters behind a disclosure.
- Self-contained SVG download.
- No persistence yet.

Answers: *Is manipulating this instrument enjoyable enough to continue?* Use it for several sessions before building anything else.

### Creative Lab 0.1

Adds, in milestone order (section 19):

- Save/reopen compositions, draft recovery.
- Local image import, deterministic palette extraction, spatial color grid, "Use in Atelier".
- Flow Field as second engine, one observable spatial mapping.
- Six-variation exploration with locks, experiment-scoped undo/redo.
- Gallery, safe deletion, project backup/restore, storage status.
- Robust SVG and PNG export, accessibility pass, performance measurement.

### Deferred until after 0.1

- Service worker / reopening without the local server.
- Multi-tab takeover UI (0.1 only detects a second editor and makes it read-only).
- Additional experiments, AI integration, connection editors, branching-history UI, advanced library organization, video/animation export, WebGL/3D.

---

## 3. Primary User Journeys

- **Start without an image.** Open Atelier → see a complete artwork → adjust → create variations → save. The product must be useful without imported media. (This is the first journey and the first milestone.)
- **Transform an image.** Import → inspect palette → use in Atelier → adjust → save or export.
- **Continue an exploration.** Open Saved → choose a composition → exact recipe and inputs restored → continue in a working copy. Editing never modifies the saved item until explicitly saved as a new item.
- **Move work elsewhere.** Export bundle → import on another browser/machine → reopen editable compositions.
- **Experiment without committing.** Untitled session → explore → discard or save. A recoverable draft prevents accidental loss without requiring project creation first.

---

## 4. Navigation and Workspace

### Navigation

- **Explore:** implemented experiments.
- **Workspace:** the current experiment.
- **Saved:** saved compositions (introduced in M1). Projects and resources start as filters/panels inside Saved, not separate sections.

### Workspace behavior

- Canvas occupies most of the space.
- Each experiment owns its controls and layout; shared controls cover save, export, undo, redo, resource selection.
- Primary controls first; advanced parameters available but folded.
- One short sentence explains what the current algorithm does.
- Rendering indicators never obscure the last successful artwork.

### Accessibility

- Accessible names and keyboard operation for all controls; numeric entry beside sliders.
- Color is never the only state indicator; focus stays visible.
- Motion can be paused; respect `prefers-reduced-motion` for UI animation.
- Shortcuts ignore inputs and editable content. Use Cmd/Ctrl+S for save; do not intercept bare letters globally.

---

## 5. Architecture

One application, one repository, no backend for 0.1.

### Stack

React + TypeScript, Vite, component state for local UI, Zustand only for state that genuinely crosses components, Dexie on IndexedDB, Zod at external and persistence boundaries, Vitest (with `fake-indexeddb` for persistence tests), Playwright for critical journeys.

Choose stable versions at bootstrap and commit the lockfile. This document does not pin versions.

### Dependency direction

- Algorithms (`core/`, `experiments/*/engines`) import no React, storage or stores.
- Experiments depend only on small shared resource and utility contracts.
- Persistence stores validated domain data.
- The shell discovers experiments through a static registry.
- Experiments never import other experiments' implementations.
- No generic plugin system.

### Rendering

SVG for the first two Atelier engines, via a small Atelier-specific scene type containing only what those engines need: paths, basic shapes, solid fills/strokes, document background, fixed logical coordinate system. It is not a mandatory format for future experiments; Canvas, WebGL and Web Audio experiments may use their own runtime models.

### Source layout

```text
src/
  app/
  core/
    color/        # OKLab/sRGB conversion, gamut policy
    random/       # seeded PRNG, named streams
    parameters/   # ParameterSpec, schema derivation, mutation
    resources/
    persistence/
    export/       # SVG serializer, PNG rasterizer
  experiments/
    atelier-infinito/
      engines/
      scene/
      components/
      definition.ts
    visual-dna/
      algorithms/
      components/
      definition.ts
  components/
  styles/
e2e/
docs/
  decisions/
```

Add folders when code needs them. Do not pre-create structure for future modules.

---

## 6. State Ownership

Three kinds of state:

- **Ephemeral:** hover/focus, open panels, viewport zoom, rendering progress, in-progress slider drag. Not part of the artwork.
- **Working:** experiment and engine identity, parameters, seed, input resource references, palette overrides (order, disabled swatches), parameter locks, artboard settings. Mutable, serializable, carries a monotonically increasing `revision`.
- **Saved:** an immutable snapshot of recipe + exact input resources. Rename/favorite freely; changing the artwork creates a new saved item with an optional `parentId`. That is the whole version history for 0.1 — no event sourcing.

---

## 7. Resource Model

Resources enable reuse without coupling experiments. Implement only: **Image, Palette, SpatialColor, Composition.** No generic resource for every intermediate calculation.

### Envelope

```ts
interface Resource<TType extends string, TPayload> {
  id: string;
  type: TType;
  schemaVersion: number;          // of this resource type's payload
  payload: TPayload;              // immutable
  provenance: {                   // immutable
    producerId: string;
    producerVersion: string;
    inputResourceIds: string[];
    config?: Record<string, unknown>;   // e.g. extraction settings
  };
  metadata: {                     // mutable
    name: string;
    createdAt: string;
    favorite?: boolean;
    tags?: string[];
  };
}
```

Payload and provenance never change after creation. Metadata is the only mutable part (this also covers "rename without changing creative payload").

### Palette

- Canonical color: **OKLab** `{ L, a, b }`. Display sRGB/hex is derived on demand through one documented gamut policy (0.1: clamp in linear sRGB; revisit if clamping visibly dulls saturated centroids).
- Swatch: stable `swatchId`, OKLab color, non-negative normalized `weight`.
- Extraction configuration lives in `provenance.config`.
- Reordering and disabling are working-state overrides; they never modify the palette resource.

### SpatialColor

- `gridWidth`, `gridHeight`, row-major cells. Default extraction grid is 3×3 for display, but the grid size is data, not a constant — do not hardcode 3 in consumers.
- Per cell: mean OKLab, mean relative luminance, luminance standard deviation, `dominantSwatchId`, visible-pixel weight.
- `paletteResourceId` in provenance. Reference swatches by ID, never by array index.

### Image

- Blob reference, decoded dimensions, validated media type, original filename (display only), normalization metadata.
- Original bytes separate from analysis pixels.
- Never propagate source-image metadata into exported artwork.

### Composition

- `experimentId`, experiment-state `schemaVersion`.
- `engineId`, `engineVersion`.
- `seed`, `randomVersion`.
- Parameters, already validated against the engine's `ParameterSpec`.
- Immutable input resource IDs; palette overrides.
- Logical artboard size and background.
- Optional `parentId`.

Thumbnail (PNG blob) and self-contained SVG snapshot are stored as separate blobs. The recipe is for editing; the SVG preserves appearance if the engine version can no longer run.

---

## 8. Parameters: One Source of Truth

Every engine declares its parameters once. Defaults, validation, UI, and mutation are all derived from this map — nothing else describes parameters.

```ts
type ParameterSpec =
  | { kind: "number";  default: number; min: number; max: number; step: number;
      scale: "linear" | "log"; mutationScale: number; lockable?: boolean }
  | { kind: "integer"; default: number; min: number; max: number;
      mutationScale: number; lockable?: boolean }
  | { kind: "angle";   default: number; mutationScale: number; lockable?: boolean }   // radians, wraps
  | { kind: "enum";    default: string; options: readonly string[];
      mutationWeights?: Record<string, number>; lockable?: boolean }
  | { kind: "boolean"; default: boolean; lockable?: boolean };

interface GenerativeEngine<P extends Record<string, unknown>> {
  id: string;
  version: string;
  parameters: { [K in keyof P]: ParameterSpec };
  primary: ReadonlyArray<keyof P>;      // the three or four controls shown first
  describe: string;                     // one-sentence explanation shown in the UI
  generate(context: GenerationContext, parameters: P): AtelierScene;
}
```

`core/parameters` provides, from a spec map:

- `defaults(specs)`
- `schema(specs)` → Zod schema used for normalization at load, import and save.
- `mutate(specs, params, locks, intensity, rng)` → additive for linear, multiplicative for log, wrapped for angles, rounded for integers, weighted choice for enums; clamp or reflect at bounds consistently (choose one and document it). Intensity: Subtle 0.5×, Medium 1×, Wild 2× base `mutationScale`.
- Control rendering in the shell.

If a UI label like "Density" maps to an engine parameter, the mapping is explicit in the spec (display name on the spec, or a documented derived control). No decorative sliders that change several unrelated properties.

`GenerationContext` provides: logical artboard, seeded named random streams, resolved immutable inputs, explicit generation limits (max vertices, max steps, time budget). Engines return scene data only — no React, no persistence, no wall-clock time.

---

## 9. Reproducibility Contract

A composition is defined by: engine implementation and version, PRNG/noise versions, seed, validated parameters, exact input resources, artboard geometry, and the serializer's numeric conventions.

### Guarantees

- **Same engine version, same browser:** the serialized SVG is byte-identical. This is tested with golden files.
- **Same engine version, different browser/JS engine:** geometry equivalent within 1e-3 logical units after parsing (transcendental functions may differ in the last bits). Pixel-identical rasterization is never promised.
- **Algorithm changes:** bump `engineVersion`. Keep the old implementation when practical, or offer migration as an explicit copy. Never silently reinterpret a saved recipe. A data migration that enables *loading* is not permission to change the *visual algorithm*.

### Randomness

- One tested seeded PRNG (`core/random`) with reference-value tests.
- Named streams per concern (geometry, color, mutation, placement) so a new color draw never shifts geometry.
- Seed stored in every recipe. No wall-clock time in generation. Stable output ordering.
- Noise functions are implemented in-repo and versioned, not pulled from a dependency whose output can change.

### Byte-stable SVG serialization

- Coordinates rounded to a fixed precision (3 decimals) at serialization.
- Fixed attribute order per element type; no incidental whitespace variation.
- Elements emitted in generation order.
- The serializer has its own version; it is part of `export/` and shared by preview, snapshot and PNG.

### Versions

Three version fields do the work in 0.1: resource `schemaVersion` (per type), `engineVersion` (per engine), bundle `formatVersion` (manifest). Dexie's database version number handles table migrations and is internal. Add an experiment-state version only when an experiment's working state gains fields that are not engine parameters.

### Image analysis

Deterministic extraction starts from normalized pixel data and a pinned analysis implementation. Browser decoding and resizing may differ; therefore extracted resources are persisted and reopening artwork never re-analyzes the original.

---

## 10. Persistence and Lifecycle

### Tables

Introduce incrementally: `blobs`, `resources`, `drafts`; `projects` when grouping becomes useful. Compositions are resources; no separate table. Choose one authoritative membership representation (resource → project ID), never parallel arrays.

### Save transaction

1. Validate working state against the engine schema.
2. Resolve referenced inputs.
3. Generate final-quality scene, serialize SVG snapshot, rasterize thumbnail — **before** opening the transaction.
4. Commit resource and blobs atomically.
5. Report success only after commit.

A failed save keeps the working state and the previous saved item intact and never shows "saved".

### Drafts

- Debounced persistence of working state with its `revision`; writes are serialized and a lower revision never overwrites a higher one.
- Visible "saved locally / unsaved" indicator. Never rely solely on `beforeunload`.
- Offer recovery of the last draft on launch.
- Variation thumbnails are never persisted as resources.

### Multiple tabs (0.1)

Use the Web Locks API (or a BroadcastChannel heartbeat) per draft. The second tab opens read-only with a notice. No takeover UI in 0.1; revision checks still reject stale writes.

### Deletion

- Removing from a project does not delete shared inputs.
- Permanent deletion is refused while a saved composition references the resource; explain the dependency.
- Unreferenced blobs are reclaimed by an explicit cleanup action, never by cascade.

### Storage status

Small storage panel: approximate usage estimate, `navigator.storage.persist()` request with graceful handling of denial, quota-failure handling, note that clearing site data removes local work, visible backup action.

If persistence is unavailable at all, allow temporary exploration and export with a clear unsaved indicator.

---

## 11. Backup and Restore

Part of the 0.1 definition of done.

### Bundle

ZIP containing `manifest.json`, `resources.json`, `projects.json`, `assets/`, `previews/`. Manifest: `formatVersion`, application version, creation time, resource count, asset paths with sizes and checksums. Export the full dependency closure of the selected compositions or projects. Recipe-only JSON export is optional and must state when required inputs are missing.

### Restore

- Validate manifest and schemas before any write; verify asset presence and checksums.
- Enforce file-count, expanded-size and image-dimension limits; reject unsafe paths.
- Import as a new project; remap IDs and references consistently.
- All-or-nothing: the existing database is untouched if validation fails.
- An unknown engine version blocks editing of that composition only; its SVG remains viewable and other resources import normally.

---

## 12. Visual DNA

Extract visual characteristics that become creative inputs. No object recognition, captions, face analysis or semantic segmentation.

### Import

Static JPEG, PNG, WebP via file picker and drag/drop; paste via the normal paste event (no clipboard permission requirement). Animated formats out of scope — reject or clearly state that a single frame is used.

### Initial limits (adjustable defaults)

25 MiB file, 32 MP decoded, 512 px longest analysis dimension, ≤ 20,000 deterministic samples, ≤ 8 palette colors, bounded k-means iterations. Validate metadata before full decode when possible and dimensions immediately after. Compressed size does not bound memory.

### Pipeline

1. Validate → 2. decode with orientation applied once → 3. normalize to the sRGB analysis representation → 4. downsample preserving aspect → 5. deterministic sample → 6. convert to OKLab → 7. k-means++ (seeded) → 8. assign analysis pixels to clusters → 9. spatial statistics → 10. persist normalized outputs.

### Transparency policy

Ignore fully transparent pixels; weight partial alpha by alpha; proportions over visible weight; a fully transparent image is a recoverable empty result. Preview on a checkerboard.

### Clustering

Seeded k-means++ in OKLab with specified sample order, initialization version, max iterations, convergence tolerance, stable distance tie-breaking, empty-cluster handling and deterministic output ordering. A uniform image returns fewer swatches, not duplicates. Centroids stay in OKLab; display conversion uses the shared gamut policy.

### Metrics

- Palette proportion: cluster visible weight / total visible weight.
- Cell luminance: weighted mean linear-sRGB relative luminance.
- Cell contrast: weighted luminance standard deviation.
- Global tonal spread: 95th − 5th luminance percentile.
- Brightest/darkest area: cell with max/min mean luminance.

Descriptive artistic metrics, not accessibility scores.

### Interface

Source image, palette with proportions, optional numeric details, grid view, one-sentence explanation, "Use in Atelier". Not a dashboard.

---

## 13. Atelier Infinito

### Radial Fields (first engine)

Concentric rings of path segments whose radius is modulated by a wave; angular repetition creates symmetry, jitter breaks it. Parameters: ring count, angular repetition, wave amplitude, wave frequency, rotation, jitter, stroke width, palette mapping. `primary`: ring count, wave amplitude, jitter, palette mapping. It is the first test of visual enjoyment, determinism and SVG export.

### Flow Field (second engine)

Streamlines through a deterministic vector field. Define seed-point distribution, noise implementation and scale, integration method, step length, max steps, boundary behavior, max total vertices. Start with Euler and document it; switch to midpoint only if curves are visibly better for the cost. The engine stops at its limits and never freezes the workspace.

### Palette mappings

Modes: sequential, weighted. Disabled swatches receive no assignments and remaining weights renormalize. Prevent the all-disabled state (or restore one with an explanation). Proportions guide assignment; they do not guarantee visible area percentages.

### First spatial mapping

SpatialColor influences Flow Field seed placement: bilinear sampling of cell luminance, darker → higher placement probability, seeded sampler, bounded attempts, documented uniform fallback. Strength 0 must equal non-spatial behavior exactly. UI text: "Darker source regions attract more starting points."

---

## 14. Variations, Locks, History

### Operations

- **New seed:** new random realization, parameters and inputs unchanged.
- **Mutate:** change unlocked parameters, seed unchanged by default.
- **Explore freely:** later, optional, changes both.

A locked seed is never changed by any operation. If every mutable parameter is locked, explain why no variation can be generated.

### Variation batch

1. Capture working state. 2. Generate and record a batch seed. 3. Produce six valid children via `core/parameters.mutate`. 4. Render bounded previews (final geometry at small display size when practical). 5. Deduplicate where practical. 6. Select or cancel. The active artwork changes only on selection; only the selected recipe is persisted.

### History

Bounded history of small serialized working states. One slider drag = one entry; one variation selection = one entry; input-resource changes are included. No blobs in history. Referenced immutable inputs stay available while in active history.

---

## 15. Rendering and Export

### One source of geometry

Preview, SVG snapshot and PNG export come from the same scene and the same serializer for a given recipe. Stable logical `viewBox`; export resolution never changes composition.

### Interactive quality

Full generation when cheap; reduced update frequency during drag; full regeneration on release. If reduced geometry is used mid-drag, label it as preview and regenerate before save/export.

### SVG export

Explicit width/height and `viewBox`, SVG namespace, inline styles, no scripts/handlers, no external resources, escaped text/metadata, no dependence on app CSS. Test the exported file outside the application.

### PNG export

Rasterize the same SVG. Presets 1024/2048/4096 where supported; background or transparency choice; progress and recoverable failure; lower-resolution retry on allocation failure. Keep one large buffer alive at a time; release object URLs and bitmaps.

---

## 16. Performance and Job Scheduling

Targets to measure, not promises. Record browser, hardware, fixtures and build mode.

| Interaction | Initial target |
|---|---|
| Basic control feedback | < 100 ms for default scenes |
| Default Visual DNA analysis | < 2 s |
| Six default variations | < 3 s |
| UI during heavy work | no sustained blocking |

### Scheduling

One active heavy job plus the latest pending request per workspace; tag jobs with the working-state `revision`; ignore stale results; cancel or supersede; keep the last good preview visible; debounce expensive changes; cap variation-render concurrency.

### Workers

Measure first. Move work off the main thread when realistic default workloads produce repeated long tasks. Cancellation and stale-result protection are implemented regardless. Use transferable buffers; never push full pixel arrays through application state.

---

## 17. Deployment

### Local static-server mode (0.1)

Production build served from a fixed localhost origin with strict-port behavior (e.g. `vite preview --port 4173 --strictPort`). A different scheme, host or port is a different storage origin — document this prominently. Works without internet while the server runs. No remote fonts, CDNs or analytics.

### Offline relaunch (deferred)

If a later release promises reopening without the server, add a production service worker caching the full shell, with the update discipline: keep the current editor running, persist the draft before activation, prompt reload at a safe point, never mix old code with migrated storage.

### Private hosting

Static hosting serves the application, not the user's IndexedDB. Same URL in another browser does not sync; use backup/restore.

---

## 18. Validation, Failure Handling, Tests

### Validate at

File import, bundle import, persistence reads and writes, migrations, future AI command execution. Not inside hot loops.

### Recoverable failures

Unsupported/corrupt image, empty visible image, invalid parameters, superseded job, storage unavailable or full, missing asset, unknown engine version, failed PNG allocation, corrupt bundle. Each gives a short explanation, a next action, the previous working state, and never a false success message.

### Unit tests

PRNG reference values; color conversion reference cases; palette extraction on flat, transparent and limited-color fixtures; `core/parameters` schema derivation, mutation bounds and locks; spatial sampling; **golden SVG files per engine version and fixture recipe**; version migrations.

### Persistence and integration tests (`fake-indexeddb`)

Atomic save and reload; failed save leaves previous work intact; palette edits create new resources; saved recipes keep their inputs; deletion respects dependencies; bundle export → import into a fresh database preserves recipes and assets; stale draft writes rejected.

### End-to-end (Playwright)

1. Generate → save → reload → reopen (M1).
2. Import image → reload → recover; analyze → hand off → generate → save (M2).
3. Variations → select → undo → redo (M4).
4. Export SVG and PNG; verify structure and dimensions (M6).
5. Export bundle → import into fresh database → reopen (M5).

One primary desktop browser for acceptance; smoke-test the core journey in a second browser before claiming support.

### Artistic review

After each engine milestone, manually inspect defaults, extremes, multiple seeds, sparse and dense palettes, subtle and wild mutations, saved/reopened results, large exports. No coverage target.

---

## 19. Milestones

Every milestone ends with visible behavior and a short report.

### M0 — First playable instrument

- Minimal Vite/React/TS app with typecheck, lint, Vitest.
- Canvas-centered shell; Explore list with one entry.
- `core/random` with named streams and reference tests.
- `core/parameters` (spec → defaults, schema, controls; mutation can wait for M4).
- Radial Fields engine, built-in palette, seed field and "New seed", primary controls, advanced disclosure.
- Byte-stable SVG serializer; SVG download; golden-file test for the default recipe.
- No persistence, no image import.

**Gate:** it is enjoyable. Use it for several sessions. Stop here for the first implementation assignment.

### M1 — Keep what you find

- Dexie tables `blobs`, `resources`, `drafts`; Zod at persistence boundaries.
- Atomic save of a composition (recipe + SVG snapshot + thumbnail); minimal Saved list; reopen as working copy.
- Debounced draft with revision checks; recovery on launch.
- Persistence integration tests; first Playwright journey.

**Gate:** nothing found in M0 can be lost by a reload.

### M2 — Visual DNA

- Image import, validation, limits, blob storage, restoration after reload.
- Normalization, OKLab, seeded k-means++, palette resource with proportions, SpatialColor grid.
- "Use in Atelier" handoff.

**Gate:** limited-color fixtures produce stable, sensible results.

### M3 — Second engine and spatial reuse

- Flow Field with bounded generation; dark-region seed-density mapping; shared scene/export path.

**Gate:** both engines fit the contract without forcing their algorithms into one implementation.

### M4 — Variation instrument

- Locks, mutation, six-child batches with bounded preview scheduling, selection history, undo/redo.

**Gate:** locks are exact; variations are meaningfully distinct.

### M5 — Saved work and portability

- Gallery with thumbnails, safe deletion, project grouping if needed, backup/restore, storage panel.

**Gate:** a fresh database restores a bundle and reopens its compositions.

### M6 — Release hardening

- Robust SVG and PNG export, accessibility pass, performance measurement, stable-origin documentation, second-browser smoke test, complete critical-path tests.

**Gate:** all 0.1 criteria pass.

---

## 20. Creative Lab 0.1 Acceptance Criteria

- [ ] Works without accounts or a backend.
- [ ] Launches with a useful built-in example.
- [ ] Imports supported local images and restores them after reload.
- [ ] Extracts deterministic palettes from normalized pixels; produces SpatialColor resources.
- [ ] Transfers resources into Atelier without module coupling.
- [ ] Provides Radial Fields and Flow Field with editable seeds and expressive parameters.
- [ ] Same recipe → byte-identical SVG on the acceptance browser; golden tests pass.
- [ ] Applies one observable spatial mapping.
- [ ] Supports locks, variations, undo and redo.
- [ ] Preserves saved recipes and immutable inputs; opens saved artwork as a working copy.
- [ ] Exports self-contained SVG and PNG from the same composition.
- [ ] Restores project bundles into a fresh database.
- [ ] Failed saves never lose the current artwork; stale background results are ignored.
- [ ] Works from the local static server without internet.
- [ ] Has been used for several real exploration sessions.

Do not begin another module merely because implementation is faster than refinement.

---

## 21. Future Experiments

Choose the next module through interest and demonstrated reuse.

| Experiment | Smallest interesting version | Entry condition |
|---|---|---|
| Texture Lab | One halftone or dithering process | "Render as image" bridge (below) |
| Optical Playground | One moiré system | Palette input only |
| Geometry Lab | One point-distribution or Voronoi experiment | GeometryResource only when a second consumer exists |
| Kinetic Type | One deformation with a bundled licensed font | Decide text-as-text vs outlines |
| Motion Lab | One parameter driven by a sine oscillator | Engine declares safe animatable parameters |
| Resonance | One audio-reactive visual | Audio import, playback, time alignment |
| Impossible Instruments | One pointer-controlled oscillator | User-initiated audio, master gain, mute |
| Chromesthesia | One palette-to-note mapping | Stable palette, basic synthesis |
| Feedback Lab | One transform-and-blend loop | Explicit initial frame and reset |
| Shader Lab | One parameterized shader | A demonstrated reason for GPU rendering |
| Artificial Garden | One bounded Particle Life simulation | Fixed timestep, stable update order |
| Interaction Lab | Pointer position/speed signals | Signal contract exists |
| Ambient Worlds | One composition of existing instruments | Supporting modules work |
| Cinematic Fingerprints | Sample a short local video into palette bands | Explicit sampling times, cancellation, media limits |
| Sonic Sculptures | Map an energy curve to a 3D form | Audio analysis plus a concrete 3D need |

**Composition-to-texture bridge:** an explicit "Render as image" operation (Composition → raster Image resource → Texture Lab), keeping the recipe as provenance. A raster operation does not preserve editable vector geometry.

---

## 22. Motion, Audio, Simulation Contracts (design at first consumer)

- **Persist descriptions, not functions.** Saved state holds a `SignalSpec` union (`constant`, `sine`, `audio-band`, …); evaluators are constructed at runtime. Add variants only when needed.
- **Motion:** base parameters + modulation definitions; explicit clock; pause freezes; seek reproduces procedural output; keyframes/timeline deferred; distinguish expensive topology parameters from cheap transforms — never regenerate thousands of paths to rotate a result.
- **Audio:** separate live analysis (feedback) from stored analysis (repeatable mappings). Stored analysis records sample rate, channel mix, window/hop, band definitions, normalization, time origin, version. Mappings declare ranges, clamping, inversion, smoothing; smoothing resets predictably and has a replay policy on seek.
- **Interaction signals:** live pointer/microphone input is not reproducible; mark sessions as live, record signals or substitute deterministic sources for reproduction.
- **Simulation:** initial state, fixed timestep, stable update order, boundaries, integrator + engine version, recorded interactions. Frame rate never changes physics.

---

## 23. Optional AI

Outside the critical path. No provider interface during 0.1.

When one concrete feature is chosen: verify official integration and deployment requirements; test auth and one request; confirm what leaves the device; define structured, bounded commands validated against the current engine spec and locks; preview; apply as one undoable action. A late response is rejected or reconfirmed if the recipe's `revision` moved.

First candidate: "Make this more chaotic while keeping the palette" — the model proposes parameter changes within `ParameterSpec` bounds; the local engine renders. Never: generated JavaScript, filesystem access, arbitrary network, direct database writes, unbounded jobs. Never store credentials in bundles. Verify provider requirements for local-browser, local-helper and hosted shapes before design; keep any helper separate from the offline core.

---

## 24. Working Rules for Implementation Agents

At each milestone:

1. Read **this document's body** (sections 1–20) and the repository instructions. The appendix is history.
2. Inspect the existing implementation.
3. Identify the smallest complete vertical slice.
4. State assumptions and acceptance criteria.
5. Implement only that milestone.
6. Test the relevant domain and persistence boundaries.
7. Run typecheck, lint, and the relevant browser journey.
8. Inspect visible output when tools permit. Never claim visual verification without a browser or image inspection.
9. Report completed behavior, verification and remaining limits.

### Scope discipline

No opportunistic future modules; no dependencies for future capabilities; no generalized architecture before a second real consumer; no persistence redesign without migration and recovery; no silent engine behavior changes. Prefer a satisfying instrument over another layer of infrastructure.

### Decision records

Record only consequential choices in `docs/decisions/`: local-first persistence and backup model; immutable resource payloads; determinism, serializer and engine-version policy; SVG scene and export strategy; deployment behavior.

---

## 25. Immediate Assignment

Implement **M0 only** (section 19).

1. Initialize the repository and basic quality tooling.
2. Build the minimal, canvas-centered shell.
3. Implement `core/random`, `core/parameters` (defaults, schema, controls) and the SVG serializer.
4. Implement Radial Fields with a built-in palette.
5. Wire seed, "New seed", primary controls and advanced disclosure.
6. Add SVG download.
7. Add PRNG reference tests and one golden SVG test.
8. Document startup and the stable local origin.
9. Stop.

Do not implement persistence, image import, palette extraction, AI, future modules or a plugin system.

The first screen should feel like the beginning of a creative instrument.

---

## 26. Decision Rules

- Prefer visible creative value over speculative infrastructure.
- Prefer a reversible working copy over modifying saved history.
- Prefer explicit behavior over generic abstractions.
- Prefer three expressive controls over fifteen weak ones.
- Prefer restoring existing work over adding another export format.
- Prefer an enjoyable standalone experiment over a large incomplete system.

Creative Lab grows through instruments worth returning to.

---

## Appendix A — Review of the original plan (1.0 → 1.1)

Retained for context; not an implementation input.

| Original gap | Revision | Why it matters |
|---|---|---|
| Four top-level areas before the core loop works | Explore + workspace; add Saved when saving exists | Less navigation and implementation overhead |
| Determinism described mainly through seeds | Engine versions, normalized parameters, immutable inputs, numerical conventions | A seed alone does not reproduce an artwork |
| Mutable resource references | Immutable payloads and composition snapshots | Later edits must not change saved artwork |
| IndexedDB treated as sufficient | Backup/restore, storage failure handling, stable-origin guidance | Browser storage can be cleared or lost |
| Preview and export defined separately | Both from the same scene | Avoids different artwork in exports |
| Evolution described conceptually | Mutation rules, locks, batch seeds, selection history | Implementable and testable |
| Spatial DNA without a precise consumer | First mapping for flow-field seed placement | Proves reuse observably |
| Long sequence before first creative result | Reorder milestones (further tightened in 1.2) | Earlier feedback |
| Generic state and version fields | Separate version concerns (simplified to three in 1.2) | Migrations must not change artwork |
| Control signals as functions | Persist descriptors, build evaluators at runtime | Functions cannot be saved |
| Keyframes listed while rejecting a timeline | Procedural modulators first | Removes a scope contradiction |
| Extensive future phases read as delivery obligation | Independent experiments with entry conditions | Keeps development flexible |
| ChatGPT integration assumed a flow | Separate capability and deployment spike | Avoids coupling to provider changes |

## Appendix B — References

Recheck browser capabilities and provider requirements when implementing the relevant milestone.

- MDN — Storage quotas and eviction criteria: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- MDN — StorageManager.persist(): https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
- MDN — Web Locks API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
- MDN — Using Service Workers: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
- OpenAI — Using your ChatGPT plan in other apps and sites: https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites
