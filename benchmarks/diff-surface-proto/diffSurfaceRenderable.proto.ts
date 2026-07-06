// PROTOTYPE — THROWAWAY. Do not ship.
//
// Question under test: if visible diff rows are rasterized immediately into the
// cell buffer each frame (no React row tree, no renderable mount/unmount), does
// per-scroll-tick cost stay ~5ms regardless of scroll distance and stream size?
//
// This renders the same DiffRow model the production React path consumes
// (buildSplitRows output), in a simplified split layout: line number, sign,
// code spans per side. Chrome, selection, comments, and mouse are out of scope.
import {
  Renderable,
  RGBA,
  type OptimizedBuffer,
  type RenderableOptions,
  type RenderContext,
} from "@opentui/core";
import type { DiffRow, RenderSpan, SplitLineCell } from "../../src/ui/diff/pierre";

const LINE_NO_WIDTH = 5;
const SIGN_WIDTH = 2;

/** Hex colors parsed once — span styles repeat heavily across rows. */
const rgbaCache = new Map<string, RGBA>();
function rgba(hex: string): RGBA {
  let parsed = rgbaCache.get(hex);
  if (!parsed) {
    parsed = RGBA.fromHex(hex);
    rgbaCache.set(hex, parsed);
  }
  return parsed;
}

const PALETTE = {
  text: rgba("#c9d1d9"),
  dim: rgba("#8b949e"),
  bg: rgba("#0d1117"),
  additionBg: rgba("#12261e"),
  deletionBg: rgba("#25171c"),
  emptyBg: rgba("#10161d"),
  hunkHeaderFg: rgba("#79c0ff"),
  hunkHeaderBg: rgba("#161b22"),
  collapsedFg: rgba("#8b949e"),
};

function cellBg(kind: SplitLineCell["kind"]): RGBA {
  if (kind === "addition") return PALETTE.additionBg;
  if (kind === "deletion") return PALETTE.deletionBg;
  if (kind === "empty") return PALETTE.emptyBg;
  return PALETTE.bg;
}

export interface DiffSurfaceProtoOptions extends RenderableOptions {
  rows?: DiffRow[];
}

/**
 * Immediate-mode diff surface: every frame draws rows[scrollTop .. scrollTop+height)
 * straight into the frame buffer. Scrolling mutates one integer and requests a render.
 */
export class DiffSurfaceProtoRenderable extends Renderable {
  rows: DiffRow[];
  private _scrollTop = 0;

  constructor(ctx: RenderContext, options: DiffSurfaceProtoOptions) {
    super(ctx, options);
    this.rows = options.rows ?? [];
  }

  get scrollTop(): number {
    return this._scrollTop;
  }

  set scrollTop(value: number) {
    const clamped = Math.max(0, Math.min(value, Math.max(0, this.rows.length - this._heightValue)));
    if (clamped !== this._scrollTop) {
      this._scrollTop = clamped;
      this.requestRender();
    }
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    const width = this._widthValue;
    const height = this._heightValue;
    const x0 = this._x;
    const y0 = this._y;
    const halfWidth = Math.floor((width - 1) / 2);

    for (let vy = 0; vy < height; vy += 1) {
      const row = this.rows[this._scrollTop + vy];
      const y = y0 + vy;

      if (!row) {
        buffer.fillRect(x0, y, width, 1, PALETTE.bg);
        continue;
      }

      if (row.type === "hunk-header" || row.type === "collapsed") {
        const fg = row.type === "hunk-header" ? PALETTE.hunkHeaderFg : PALETTE.collapsedFg;
        buffer.fillRect(x0, y, width, 1, PALETTE.hunkHeaderBg);
        buffer.drawText(clip(row.text, width - 2), x0 + 1, y, fg, PALETTE.hunkHeaderBg);
        continue;
      }

      if (row.type === "split-line") {
        this.drawSplitCell(buffer, row.left, x0, y, halfWidth);
        buffer.drawText("│", x0 + halfWidth, y, PALETTE.dim, PALETTE.bg);
        this.drawSplitCell(buffer, row.right, x0 + halfWidth + 1, y, width - halfWidth - 1);
        continue;
      }

      // Stack rows and anything else are out of prototype scope; render as plain text.
      buffer.fillRect(x0, y, width, 1, PALETTE.bg);
    }
  }

  /** Draw one side of a split row: line number, sign, then code spans, clipped to columnWidth. */
  private drawSplitCell(
    buffer: OptimizedBuffer,
    cell: SplitLineCell,
    x: number,
    y: number,
    columnWidth: number,
  ): void {
    const bg = cellBg(cell.kind);
    buffer.fillRect(x, y, columnWidth, 1, bg);

    if (cell.kind === "empty") {
      return;
    }

    const lineNo = cell.lineNumber === undefined ? "" : String(cell.lineNumber);
    buffer.drawText(lineNo.padStart(LINE_NO_WIDTH - 1), x, y, PALETTE.dim, bg);
    buffer.drawText(cell.sign, x + LINE_NO_WIDTH, y, PALETTE.dim, bg);

    let cx = x + LINE_NO_WIDTH + SIGN_WIDTH;
    const maxX = x + columnWidth;
    for (const span of cell.spans) {
      if (cx >= maxX) break;
      const text = clip(span.text, maxX - cx);
      buffer.drawText(text, cx, y, span.fg ? rgba(span.fg) : PALETTE.text, span.bg ? rgba(span.bg) : bg);
      cx += text.length;
    }
  }
}

/** ASCII-fixture clip — the fixtures are single-width chars, so length === columns. */
function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/** Split a plain span into N alternating-color spans to simulate syntax-highlighted rows. */
export function simulateHighlightSpans(rows: DiffRow[], spansPerLine = 8): DiffRow[] {
  const colors = ["#ff7b72", "#79c0ff", "#a5d6ff", "#d2a8ff", "#7ee787", "#ffa657", "#c9d1d9", "#e6edf3"];

  const splitCell = (cell: SplitLineCell): SplitLineCell => {
    const text = cell.spans.map((span: RenderSpan) => span.text).join("");
    if (text.length === 0) return cell;
    const chunk = Math.max(1, Math.ceil(text.length / spansPerLine));
    const spans: RenderSpan[] = [];
    for (let i = 0; i < text.length; i += chunk) {
      spans.push({ text: text.slice(i, i + chunk), fg: colors[(i / chunk) % colors.length] });
    }
    return { ...cell, spans };
  };

  return rows.map((row) =>
    row.type === "split-line" ? { ...row, left: splitCell(row.left), right: splitCell(row.right) } : row,
  );
}
