# Creative Lab

Local-first creative coding laboratory. See [PLAN.md](PLAN.md) for the product plan.

Current state: **M3 — second engine and spatial reuse.** Two experiments:

- **Atelier Infinito** — two engines, each remembering its own parameters:
  - *Radial Fields*: concentric wave-modulated rings.
  - *Flow Field*: streamlines through seeded noise. With a palette from Visual DNA,
    **Image influence** makes darker regions of the source image attract more starting
    points (0 = identical to no image).

  Seed, palette picker, auto mode, SVG download. **Save** (button or Cmd/Ctrl+S) stores the
  recipe, its inputs, a self-contained SVG snapshot and a thumbnail; **Saved** lists them
  (open as working copy, rename, delete). The working state is autosaved as a draft and
  offered for recovery after a reload. A second tab is read-only.
- **Visual DNA** — import a JPEG, PNG or WebP (picker, drag & drop or paste; ≤ 25 MiB,
  ≤ 32 MP). It extracts 2–8 colors with proportions and an 8×8 color grid, all locally.
  **Use in Atelier** stores the palette (with its grid) and selects it there.

Everything lives in this browser's storage for this origin only. Clearing site data deletes
it; backup/restore arrives in M5.

## Requirements

Node 22+, pnpm 10.

## Run

```sh
pnpm install
pnpm dev          # development: http://localhost:5173
pnpm build        # production build into dist/
pnpm preview      # serve the build: http://localhost:4173
```

Works offline once dependencies are installed: no remote fonts, CDNs or analytics.

## Stable local origin

Browser storage is scoped to the exact origin: **scheme + host + port**.
`http://localhost:4173`, `http://127.0.0.1:4173` and `http://localhost:5173` are three
different origins with three separate, unshared storages.

Both ports are fixed with `strictPort` (see `vite.config.ts`): if the port is taken the
server fails instead of silently picking another one. Always open the app at the same URL,
or your saved work will appear to be missing:

- local use: **`http://localhost:4173`**
- hosted (planned): **`https://creative-lab.ponytojas.dev`** — a separate storage; work
  saved locally does not appear there and vice versa.

Saving relies on Web Locks and `crypto.randomUUID`, which need a secure context: `https://`
or `localhost`. Plain `http://<ip>` will not work.

## Checks

```sh
pnpm typecheck
pnpm lint         # oxlint
pnpm test         # vitest
pnpm check        # all three
pnpm e2e          # Playwright journeys against the production build on :4173
```

First Playwright run: `pnpm exec playwright install chromium`.

Golden SVG files live in `src/experiments/atelier-infinito/engines/__golden__/`. A failing
golden test means the output changed. If the change is intentional, bump the relevant
version (engine, `RANDOM_VERSION` or `SERIALIZER_VERSION`) and regenerate with
`pnpm test -u`. See [docs/decisions/0001-determinism.md](docs/decisions/0001-determinism.md).
