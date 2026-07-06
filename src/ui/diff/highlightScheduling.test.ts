import { afterEach, describe, expect, test } from "bun:test";
import {
  HIGHLIGHT_INTERACTION_QUIET_WINDOW_MS,
  HIGHLIGHT_MAX_INTERACTION_DEFER_MS,
  noteHighlightSchedulerInteraction,
  resetHighlightSchedulerForTests,
  scheduleHighlightWork,
} from "./highlightScheduling";

/** Resolve when `check` returns true, polling on short real timers. */
async function waitFor(check: () => boolean, timeoutMs: number) {
  const deadline = performance.now() + timeoutMs;
  while (!check()) {
    if (performance.now() > deadline) {
      throw new Error("waitFor timed out");
    }
    await Bun.sleep(2);
  }
}

describe("scheduleHighlightWork", () => {
  afterEach(() => {
    resetHighlightSchedulerForTests();
  });

  test("runs on a macrotask (never synchronously) when input is idle", async () => {
    let ran = false;
    const start = performance.now();
    scheduleHighlightWork(() => {
      ran = true;
    });

    expect(ran).toBe(false); // never synchronous
    await waitFor(() => ran, 500);
    // Idle scheduling must not wait for the max-deferral deadline; allow generous slack for
    // timer jitter under parallel test load.
    expect(performance.now() - start).toBeLessThan(HIGHLIGHT_MAX_INTERACTION_DEFER_MS);
  });

  test("defers past the quiet window while interaction is hot", async () => {
    noteHighlightSchedulerInteraction();
    let ranAt = 0;
    const start = performance.now();
    scheduleHighlightWork(() => {
      ranAt = performance.now();
    });

    await waitFor(() => ranAt !== 0, HIGHLIGHT_MAX_INTERACTION_DEFER_MS + 200);
    expect(ranAt - start).toBeGreaterThanOrEqual(HIGHLIGHT_INTERACTION_QUIET_WINDOW_MS - 5);
  });

  test("still makes forward progress under continuous interaction", async () => {
    let ran = false;
    scheduleHighlightWork(() => {
      ran = true;
    });

    const start = performance.now();
    const interactionInterval = setInterval(() => {
      noteHighlightSchedulerInteraction();
    }, 8);
    noteHighlightSchedulerInteraction();

    try {
      await waitFor(() => ran, HIGHLIGHT_MAX_INTERACTION_DEFER_MS + 500);
    } finally {
      clearInterval(interactionInterval);
    }

    // Bounded deferral: the chunk ran despite interaction never going quiet.
    expect(performance.now() - start).toBeLessThanOrEqual(HIGHLIGHT_MAX_INTERACTION_DEFER_MS + 200);
  });
});
