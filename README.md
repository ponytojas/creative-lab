# Creative Lab

Local-first creative coding laboratory. See [PLAN.md](PLAN.md) for the product plan.

Current state: **M1 — keep what you find.** Atelier Infinito with the Radial Fields engine
(seed, controls, auto mode, SVG download), plus local saving:

- **Save** (button or Cmd/Ctrl+S) stores the recipe, a self-contained SVG snapshot and a
  thumbnail in IndexedDB. **Saved** lists them; open one as a working copy, rename, delete.
- Working state is autosaved as a draft; after a reload you are offered to restore it.
- A second tab is read-only while the first one is open.

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
