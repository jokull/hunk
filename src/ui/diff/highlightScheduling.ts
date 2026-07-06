/**
 * Interaction-aware scheduling for background syntax-highlight work.
 *
 * Highlighting one file with Pierre is a single synchronous chunk that can take tens of
 * milliseconds. When those chunks run on a bare `setTimeout(0)`, they race the input and
 * frame timers that keypresses and scroll ticks depend on, which shows up directly as
 * hunk-navigation and scroll latency. This module keeps the same "yield to the event loop
 * between files" contract but holds each chunk back while user input is actively streaming
 * in, with a bounded deferral so highlight results still make forward progress during long
 * interaction bursts.
 */

/** How long input must stay quiet before a deferred highlight chunk may run. */
export const HIGHLIGHT_INTERACTION_QUIET_WINDOW_MS = 48;

/** Upper bound on how long one highlight chunk may be deferred by ongoing interaction. */
export const HIGHLIGHT_MAX_INTERACTION_DEFER_MS = 300;

let lastInteractionAt = Number.NEGATIVE_INFINITY;

/**
 * Record user interaction (keypress, scroll) so pending highlight chunks yield to it.
 * Call sites should be cheap chokepoints: the global keyboard handler and scroll listeners.
 */
export function noteHighlightSchedulerInteraction(now: number = performance.now()) {
  lastInteractionAt = now;
}

/** Test-only reset so unit tests do not leak interaction recency across cases. */
export function resetHighlightSchedulerForTests() {
  lastInteractionAt = Number.NEGATIVE_INFINITY;
}

/**
 * Run one synchronous highlight chunk on a macrotask, deferring while interaction is hot.
 *
 * The chunk always runs on a timer (never synchronously), preserving the previous
 * `setTimeout(0)` yielding behaviour when the app is idle. While interactions keep
 * arriving, the chunk is pushed back in small steps until either the quiet window is
 * reached or the max-deferral deadline expires.
 */
export function scheduleHighlightWork(run: () => void) {
  const deadline = performance.now() + HIGHLIGHT_MAX_INTERACTION_DEFER_MS;

  const attempt = () => {
    const now = performance.now();
    const quietFor = now - lastInteractionAt;

    if (quietFor >= HIGHLIGHT_INTERACTION_QUIET_WINDOW_MS || now >= deadline) {
      run();
      return;
    }

    const remainingQuiet = HIGHLIGHT_INTERACTION_QUIET_WINDOW_MS - quietFor;
    const remainingDeadline = deadline - now;
    setTimeout(attempt, Math.max(1, Math.min(remainingQuiet, remainingDeadline)));
  };

  setTimeout(attempt, 0);
}
