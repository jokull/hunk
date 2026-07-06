/**
 * Frame-rate policy for the interactive renderer.
 *
 * OpenTUI defaults to 30fps, which reads as visibly choppy scrolling on modern
 * terminals that redraw at 60Hz+. Hunk targets 60fps by default and lets
 * immediate re-renders (wheel bursts, drag scrolling) burst up to 120fps.
 */

export const DEFAULT_TARGET_FPS = 60;
export const DEFAULT_MAX_FPS = 120;

const MIN_FPS = 15;
const MAX_FPS = 240;

/** Parse one positive-integer fps override, rejecting values outside sane terminal bounds. */
function parseFpsOverride(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < MIN_FPS || parsed > MAX_FPS) {
    return undefined;
  }

  return parsed;
}

export interface FrameRateOptions {
  targetFps: number;
  maxFps: number;
}

/**
 * Resolve renderer frame pacing, honoring an optional `HUNK_TARGET_FPS`
 * environment override for slow terminals or remote sessions.
 */
export function resolveFrameRateOptions(
  env: NodeJS.ProcessEnv = process.env,
): FrameRateOptions {
  const override = parseFpsOverride(env.HUNK_TARGET_FPS);
  const targetFps = override ?? DEFAULT_TARGET_FPS;

  // Keep burst rendering at least as fast as steady-state rendering.
  return { targetFps, maxFps: Math.max(targetFps, DEFAULT_MAX_FPS) };
}
