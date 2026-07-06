// PROTOTYPE — THROWAWAY. Do not ship.
//
// Benchmarks the immediate-mode DiffSurface prototype against the numbers the
// React row-tree path produces on the same fixtures (bench:interaction-latency,
// bench:large-stream). Run with: bun run benchmarks/diff-surface-proto/run.proto.ts
//
// React-path reference on this machine (perf-improvements branch):
//   scroll tick (in-window)   ~5.5ms median
//   windowed far scroll        ~35ms/tick
//   nav press (far jump)       ~50ms median
import { performance } from "node:perf_hooks";
import { createTestRenderer } from "@opentui/core/testing";
import { resolveTheme } from "../../src/ui/themes";
import { buildSplitRows, type DiffRow } from "../../src/ui/diff/pierre";
import {
  createLargeSplitStreamFiles,
  HUGE_FILE_COUNT,
  HUGE_LINES_PER_FILE,
} from "../large-stream-fixture";
import {
  DiffSurfaceProtoRenderable,
  simulateHighlightSpans,
} from "./diffSurfaceRenderable.proto";

const VIEWPORT = { width: 240, height: 28 }; // matches INTERACTION_VIEWPORT
const TICKS = 60;

const theme = resolveTheme("github-dark-default");

/** Flatten a fixture stream into one absolute-row-indexed DiffRow array. */
function buildRows(fileCount: number, linesPerFile: number): DiffRow[] {
  const files = createLargeSplitStreamFiles({ fileCount, linesPerFile });
  return files.flatMap((file) => [
    // Stand-in for the file header row the product renders between sections.
    {
      type: "hunk-header",
      key: `${file.id}:file-header`,
      fileId: file.id,
      hunkIndex: -1,
      text: `▎ ${file.newPath ?? file.oldPath ?? file.id}`,
    } as DiffRow,
    ...buildSplitRows(file, null, theme),
  ]);
}

function stats(latencies: number[]) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
  const max = sorted[sorted.length - 1]!;
  return { median, p95, max };
}

function printMetric(name: string, latencies: number[]) {
  const { median, p95, max } = stats(latencies);
  console.log(`METRIC ${name}_median_ms=${median.toFixed(2)}`);
  console.log(`METRIC ${name}_p95_ms=${p95.toFixed(2)}`);
  console.log(`METRIC ${name}_max_ms=${max.toFixed(2)}`);
}

/** Measure one full scroll-to-frame cycle per tick for a given scroll-step strategy. */
async function measure(
  label: string,
  rows: DiffRow[],
  nextTop: (tick: number, current: number, maxTop: number) => number,
) {
  const { renderer, renderOnce, destroy } = await withSurface(rows);
  const surface = renderer.root.getRenderable("proto-surface") as DiffSurfaceProtoRenderable;
  const maxTop = Math.max(0, rows.length - VIEWPORT.height);

  // Warm-up frame so first-render costs don't pollute tick latencies.
  await renderOnce();

  const latencies: number[] = [];
  for (let tick = 0; tick < TICKS; tick += 1) {
    const start = performance.now();
    surface.scrollTop = nextTop(tick, surface.scrollTop, maxTop);
    await renderOnce();
    latencies.push(performance.now() - start);
  }

  printMetric(label, latencies);
  await destroy();
}

async function withSurface(rows: DiffRow[]) {
  const setup = await createTestRenderer({ width: VIEWPORT.width, height: VIEWPORT.height });
  const surface = new DiffSurfaceProtoRenderable(setup.renderer, {
    id: "proto-surface",
    rows,
    width: VIEWPORT.width,
    height: VIEWPORT.height,
  });
  setup.renderer.root.add(surface);
  return {
    renderer: setup.renderer,
    renderOnce: setup.renderOnce,
    destroy: async () => {
      setup.renderer.root.remove("proto-surface");
      setup.renderer.destroy();
    },
  };
}

// ---- default fixture: 180 files x 120 lines (same as bench:interaction-latency) ----
const rows = buildRows(180, 120);
console.log(`METRIC rows_total=${rows.length}`);

await measure("proto_scroll_small", rows, (_tick, current) => current + 3);
await measure("proto_scroll_page", rows, (_tick, current) => current + VIEWPORT.height);
await measure("proto_jump_far", rows, (tick, _current, maxTop) =>
  Math.floor(((tick * 7919) % 104729) / 104729 * maxTop),
);

// ---- span-heavy rows: simulated syntax highlighting (~8 spans per line side) ----
const highlightedRows = simulateHighlightSpans(rows);
await measure("proto_hl_scroll_small", highlightedRows, (_tick, current) => current + 3);
await measure("proto_hl_jump_far", highlightedRows, (tick, _current, maxTop) =>
  Math.floor(((tick * 7919) % 104729) / 104729 * maxTop),
);

// ---- huge fixture: 1000 files x 300 lines ----
const hugeRows = buildRows(HUGE_FILE_COUNT, HUGE_LINES_PER_FILE);
console.log(`METRIC huge_rows_total=${hugeRows.length}`);
await measure("proto_huge_jump_far", hugeRows, (tick, _current, maxTop) =>
  Math.floor(((tick * 7919) % 104729) / 104729 * maxTop),
);

console.log(`METRIC ticks_per_scenario=${TICKS}`);
