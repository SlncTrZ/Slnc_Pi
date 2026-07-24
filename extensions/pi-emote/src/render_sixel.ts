import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BaseImageRenderer } from "./render_image.js";
import type { ImageDims } from "./render_image.js";
import { log } from "./log.js";

/**
 * Windows Terminal Sixel renderer backed by Chafa.
 *
 * Chafa emits a few terminal-control wrappers around the Sixel payload
 * (hide/show cursor and a final IND/newline-style movement). The pi widget
 * already owns cursor/layout behavior, so those wrappers are stripped and only
 * the Sixel DCS payload is rendered inline.
 *
 * ## Cursor save/restore
 *
 * DECSC/DECRC (\x1b7/\x1b8) were replaced with ANSI SCO save/restore
 * (\x1b[s/\x1b[u) because on Windows Terminal, DECRC can scroll the viewport
 * to make the saved cursor position visible — causing the "jump to top" bug.
 * ANSI SCO restore only affects cursor position, not the viewport.
 */
export class SixelRenderer extends BaseImageRenderer {
  protected cursorAdvances = true;
  private chafaPath: string | null;

  constructor(size: number) {
    super(size);
    this.chafaPath = findChafaPath();
    log(`SixelRenderer: chafa=${this.chafaPath ?? "not found"}`);
  }

  protected encode(base64: string, _dims: ImageDims, rows: number, _yOffset: number): string | null {
    if (!this.chafaPath) {
      log("SixelRenderer.encode: Chafa not found");
      return null;
    }

    try {
      const png = Buffer.from(base64, "base64");
      const out = execFileSync(this.chafaPath, [
        "--format=sixels",
        `--size=${this.size}x${rows}`,
        `--view-size=${this.size}x${rows}`,
        "--align=top,left",
        "--margin-bottom=0",
        "--margin-right=0",
        "--animate=off",
        "--probe=off",
        "--relative=on",
        "-",
      ], {
        input: png,
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 5000,
      });

      const sixel = sanitizeChafaOutput(out);

      // Prefix with a dummy Kitty graphics sequence (\x1b_G;) so pi-tui's
      // isImageLine() recognizes it as an image line. This prevents the TUI
      // from running normalizeTerminalOutput() on it or crashing on width checks.
      // Since there's no 'i=' param, Kitty image cleanup safely ignores it.
      //
      // ANSI SCO save (\x1b[s) at start of image area; restore (\x1b[u) after
      // Sixel to return cursor to saved position, then move to expected location.
      // ANSI SCO is used instead of DECSC/DECRC (\x1b7/\x1b8) because on Windows
      // Terminal, DECRC scrolls the viewport — SCO restore does not.
      const downToLastImageRow = rows > 1 ? `\x1b[${rows - 1}B` : "";
      const rightPastImage = `\x1b[${this.size}C`;
      return `\x1b_G;\x1b[s${sixel}\x1b[u${downToLastImageRow}${rightPastImage}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`SixelRenderer.encode: chafa failed: ${message}`);
      return null;
    }
  }

  dispose() {
    this.currentFrame = null;
  }
}

/**
 * Strip terminal-control wrappers Chafa adds around Sixel payload,
 * AND aggressively remove any dangerous escape sequences that could
 * mess with the TUI layout or scroll position:
 *
 * - Hide/show cursor (Chafa envelope)
 * - IND (\x1bD) — scrolls display if at bottom
 * - CUP (\x1b[H, \x1b[f) — cursor home (jumps to top of terminal)
 * - ED (\x1b[J, \x1b[0J, \x1b[1J, \x1b[2J, \x1b[3J) — erase display
 * - Newlines
 * - DECSC/DECRC (\x1b7/\x1b8) — in case Chafa or a future version emits them
 */
function sanitizeChafaOutput(sequence: string): string {
  return sequence
    .replace(/^\x1b\[\?25l/, "")
    .replace(/\x1b\[\?25h$/, "")
    // Strip ALL IND (not just trailing) — any \x1bD can scroll
    .replace(/\x1bD/g, "")
    // Strip CUP cursor-home sequences that jump viewport
    .replace(/\x1b\[\d*;?\d*[Hf]/g, "")
    // Strip ED erase-display sequences
    .replace(/\x1b\[\d*[J]/g, "")
    // Strip DECSC/DECRC that might appear in Chafa output
    .replace(/\x1b[78]/g, "")
    // Strip newlines that break line-counting
    .replace(/\r?\n/g, "");
}

function findChafaPath(): string | null {
  const configured = process.env.PI_EMOTE_CHAFA_PATH;
  if (configured && existsSync(configured)) return configured;

  for (const command of process.platform === "win32" ? ["chafa", "Chafa.exe"] : ["chafa"]) {
    const resolved = findOnPath(command);
    if (resolved) return resolved;
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const wingetPackages = join(localAppData, "Microsoft", "WinGet", "Packages");
      const wingetChafa = findFileRecursive(wingetPackages, "Chafa.exe", 4);
      if (wingetChafa) return wingetChafa;
    }
  }

  return null;
}

function findOnPath(command: string): string | null {
  try {
    const finder = process.platform === "win32" ? "where.exe" : "which";
    const out = execFileSync(finder, [command], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 2000,
    });
    const first = out.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    return first && existsSync(first) ? first : null;
  } catch {
    return null;
  }
}

function findFileRecursive(dir: string, fileName: string, depth: number): string | null {
  if (depth < 0 || !existsSync(dir)) return null;

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
      return fullPath;
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = findFileRecursive(join(dir, entry.name), fileName, depth - 1);
    if (found) return found;
  }

  return null;
}
