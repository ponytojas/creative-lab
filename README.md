# Creative Lab

Local-first creative coding laboratory. See [PLAN.md](PLAN.md) for the product plan.

Current state: **M0 — first playable instrument.** Atelier Infinito with the Radial Fields
engine, editable seed, primary + advanced controls, SVG download. No persistence yet:
reloading the page loses your settings — download the SVG (the seed is in the filename).

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
server fails instead of silently picking another one. Once saving exists (M1), always open
the app at the same URL — **`http://localhost:4173`** for real use — or your saved work
will appear to be missing.

## Checks

```sh
pnpm typecheck
pnpm lint         # oxlint
pnpm test         # vitest
pnpm check        # all three
```

Golden SVG files live in `src/experiments/atelier-infinito/engines/__golden__/`. A failing
golden test means the output changed. If the change is intentional, bump the relevant
version (engine, `RANDOM_VERSION` or `SERIALIZER_VERSION`) and regenerate with
`pnpm test -u`. See [docs/decisions/0001-determinism.md](docs/decisions/0001-determinism.md).
