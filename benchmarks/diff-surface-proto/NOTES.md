# DiffSurface prototype — verdict

**Question:** if visible diff rows are rasterized immediately into the cell buffer
each frame (no React row tree, no renderable mount/unmount), does per-scroll-tick
cost stay ~5ms regardless of scroll distance and stream size?

**Answer: yes, with an order of magnitude to spare.** Measured 2026-07-06 on the
`perf-improvements` branch, same fixtures and 240×28 viewport as
`bench:interaction-latency` / `bench:large-stream`, 60 ticks per scenario, full
`renderOnce()` per tick (includes OpenTUI's native cell-diff frame pipeline):

| Scenario | React row-tree path | DiffSurface (immediate mode) |
|---|---|---|
| small scroll (+3 rows) | ~5.5ms median | **0.29ms** |
| page scroll | — | **0.28ms** |
| far random jump (nav-press analog) | ~50ms median | **0.26ms** |
| far jump, simulated highlight spans (8/side) | — | **0.38ms** |
| far jump, 58,000-row stream (1000 files) | untested (huge tier) | **0.28ms** |

Key properties confirmed:

- **Scroll-distance invariant** — far jumps cost the same as +3 ticks. The React
  path's dominant cost (mounting sections entering the window) does not exist.
- **Stream-size invariant** — 58k rows costs the same as 10k rows. O(viewport),
  not O(content).
- **Highlight-friendly** — rows re-rasterize from spans each frame, so syntax
  highlight landing is just "new spans next frame". No cache invalidation
  machinery needed (immediate mode over a retained row *plan*, not retained pixels).

Out of prototype scope (bounded by viewport height, so none threaten the budget):
file section chrome, comment/note overlays, hover/selection, line wrapping,
unicode-width-aware clipping (fixture is ASCII), stack layout, mouse hit-testing.

**Implication:** the production integration is a custom OpenTUI Renderable that
owns the review stream and consumes the existing planning layer
(`plannedReviewRows` + `diffSectionGeometry`), with React retained for chrome
(menus, sidebar, dialogs). Scroll events set `scrollTop` imperatively. Estimated
frame budget even with all product decoration at 10× prototype cost: ~3ms —
comfortably inside 120fps.
