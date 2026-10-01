# 0002 — Local-first persistence

Status: accepted (M1)

## Decision

- **Storage:** IndexedDB via Dexie, database `creative-lab`, tables `blobs`, `resources`,
  `drafts`. Compositions are resources (no separate table). Zod validates every resource
  and draft on write and on read; invalid rows are skipped with a warning, never trusted.
- **Immutable resources:** payload and provenance never change; only metadata (name)
  does. Editing a reopened composition never touches it: saving creates a new composition
  with `parentId`.
- **Save:** validate → generate → serialize SVG → rasterize thumbnail, all *before* one
  Dexie transaction that writes both blobs and the resource. Success is reported only after
  commit; a failed transaction writes nothing.
- **Drafts:** one per experiment. Each working-state change bumps a `revision`. Writes are
  throttled (750 ms, so continuous changes such as auto mode still persist), serialized, and
  rejected if a stored draft has an equal or higher revision. After launch the revision
  continues above the stored draft. Recovery is offered, not automatic; autosave pauses until
  the user restores or dismisses.
- **Tabs:** the first tab holds a Web Lock (`creative-lab:editor`) for its lifetime and is
  the editor. Other tabs are read-only (no draft writes, no saves). No takeover in 0.1.
- **Deletion:** removes the resource only. Blobs are reclaimed later by an explicit cleanup
  action, never by cascade.
- **No storage:** if IndexedDB cannot open, the app runs in explore-and-export mode with a
  visible notice.

## Consequences

- Data belongs to one origin in one browser. Moving work needs backup/restore (M5).
- Deleted compositions leave orphan blobs until the M5 cleanup action exists.
- Requires a secure context (https or localhost) for Web Locks and `crypto.randomUUID`.
