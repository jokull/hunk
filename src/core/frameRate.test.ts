import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MAX_FPS,
  DEFAULT_TARGET_FPS,
  resolveFrameRateOptions,
} from "./frameRate";

describe("resolveFrameRateOptions", () => {
  test("defaults to 60fps target with 120fps burst ceiling", () => {
    expect(resolveFrameRateOptions({})).toEqual({
      targetFps: DEFAULT_TARGET_FPS,
      maxFps: DEFAULT_MAX_FPS,
    });
  });

  test("honors HUNK_TARGET_FPS within bounds", () => {
    expect(resolveFrameRateOptions({ HUNK_TARGET_FPS: "30" })).toEqual({
      targetFps: 30,
      maxFps: DEFAULT_MAX_FPS,
    });
  });

  test("raises maxFps to match a target above the default ceiling", () => {
    expect(resolveFrameRateOptions({ HUNK_TARGET_FPS: "240" })).toEqual({
      targetFps: 240,
      maxFps: 240,
    });
  });

  test.each(["0", "-5", "abc", "9999", ""])(
    "ignores invalid override %p",
    (raw) => {
      expect(resolveFrameRateOptions({ HUNK_TARGET_FPS: raw })).toEqual({
        targetFps: DEFAULT_TARGET_FPS,
        maxFps: DEFAULT_MAX_FPS,
      });
    },
  );
});
