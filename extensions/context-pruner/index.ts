/**
 * Context Pruner — Delta-based diagnostics dedup & history truncation.
 *
 * Eliminates re-injection of unchanged diagnostics and archives stale
 * conversation history to minimize token waste.
 *
 * Wing: pi-extensions | Topic: context-pruner | Updated: 2026-07-23 15:20
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/* ──────────────────────────────────────────────
 * TYPES
 * ────────────────────────────────────────────── */

interface FileDiagnostics {
  signatures: Set<string>;
  lastSeenTurn: number;
}

interface DiagnosticsFingerprint {
  files: Map<string, FileDiagnostics>;
}

/* ──────────────────────────────────────────────
 * CONSTANTS
 * ────────────────────────────────────────────── */

const STALE_TURN_THRESHOLD = 2;
const MAX_HISTORY_TURNS = 30;
const MAX_MESSAGE_CHARS = 4096;

/* ──────────────────────────────────────────────
 * FINGERPRINT HELPERS
 * ────────────────────────────────────────────── */

function createFingerprint(): DiagnosticsFingerprint {
  return { files: new Map() };
}

function isKnownDiagnostic(
  fp: DiagnosticsFingerprint,
  line: string,
  turnIndex: number,
): boolean {
  const match = line.match(/(\S+):(\d+):\d*:\s*(.+)/);
  if (!match) return false;

  const sig = `${match[1]}${match[2]}${match[3]}`;
  const fileKey = match[1].replace(/\\/g, "/");

  let fileDiag = fp.files.get(fileKey);
  if (!fileDiag) {
    fileDiag = { signatures: new Set(), lastSeenTurn: turnIndex };
    fp.files.set(fileKey, fileDiag);
  }

  if (fileDiag.signatures.has(sig)) {
    return true; // already seen → suppressed
  }

  fileDiag.signatures.add(sig);
  fileDiag.lastSeenTurn = turnIndex;
  return false; // new delta
}

function archiveStale(fp: DiagnosticsFingerprint, currentTurn: number): number {
  let count = 0;
  for (const [key, diag] of fp.files) {
    if (currentTurn - diag.lastSeenTurn > STALE_TURN_THRESHOLD) {
      fp.files.delete(key);
      count++;
    }
  }
  return count;
}

/* ──────────────────────────────────────────────
 * MESSAGE PRUNING
 * ────────────────────────────────────────────── */

interface SimpleMessage {
  role: string;
  content?: string | Array<{ type: string; text?: string }>;
  [key: string]: unknown;
}

function truncateContent(
  content: string | Array<{ type: string; text?: string }> | undefined,
  max: number,
): string | Array<{ type: string; text?: string }> | undefined {
  if (!content) return content;
  if (typeof content === "string") {
    return content.length <= max
      ? content
      : content.slice(0, max) + `\n[... truncated: ${content.length - max} chars]`;
  }
  return content.map((part) => {
    if (part.type === "text" && part.text && part.text.length > max) {
      return { ...part, text: part.text.slice(0, max) + `\n[... truncated: ${part.text.length - max} chars]` };
    }
    return part;
  });
}

function hasDiagnostics(msg: SimpleMessage): boolean {
  if (!msg.content) return false;
  const t = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
  return t.includes("blocking") || t.includes("pi-lens") || t.includes("lens_diagnostics");
}

function isLargeToolResult(msg: SimpleMessage): boolean {
  if (msg.role !== "tool") return false;
  const t = typeof msg.content === "string" ? (msg.content ?? "") : "";
  return t.length > MAX_MESSAGE_CHARS;
}

function trimHistory(msgs: SimpleMessage[], max: number): SimpleMessage[] {
  if (msgs.length <= max) return msgs;

  const sys = msgs.filter(m => m.role === "system" || m.role === "developer");
  const nonsys = msgs.filter(m => m.role !== "system" && m.role !== "developer");
  const keep = max - sys.length;

  if (nonsys.length <= keep) return msgs;

  const first = Math.floor(keep * 0.3);
  const last = keep - first;
  const note: SimpleMessage = {
    role: "system",
    content: `[Context pruned: ${nonsys.length - keep} messages removed. Earlier conversation condensed.]`,
  };

  return [...sys, note, ...nonsys.slice(0, first), ...nonsys.slice(-last)];
}

/* ──────────────────────────────────────────────
 * EXTENSION ENTRY POINT
 * ────────────────────────────────────────────── */

export default function (pi: ExtensionAPI) {
  const fingerprint = createFingerprint();
  let turnIndex = 0;
  let suppressedCount = 0;

  /* ── Pre-LLM context pruning ──
   * Use unknown casting because `context` event type may not be in overloaded signatures.
   */
  (pi as unknown as { on: (e: string, h: (event: Record<string, unknown>) => void | Promise<Record<string, unknown> | undefined>) => void }).on("context", async (event) => {
    const messages = (event.messages as unknown) as SimpleMessage[];

    let changed = false;

    // 1. Truncate oversized tool results
    const step1 = messages.map((msg) => {
      if (!isLargeToolResult(msg)) return msg;
      changed = true;
      return { ...msg, content: truncateContent(msg.content, MAX_MESSAGE_CHARS) };
    });

    // 2. Suppress redundant diagnostics
    const step2 = step1.filter((msg) => {
      if (!hasDiagnostics(msg)) return true;
      const text = typeof msg.content === "string" ? msg.content : "";
      const lines = text.split("\n");
      const allKnown = lines.every((line) => {
        if (!line.trim()) return true;
        if (!line.includes(":") || !/\d+/.test(line)) return true; // not a diagnostic line
        return isKnownDiagnostic(fingerprint, line, turnIndex);
      });

      if (allKnown) {
        suppressedCount++;
        changed = true;
        return false;
      }
      return true;
    });

    // 3. Trim history length
    const step3 = trimHistory(step2, MAX_HISTORY_TURNS);
    if (step3.length !== step2.length) changed = true;

    if (changed) {
      return { messages: step3 };
    }
  });

  /* ── Turn-end: update fingerprint, archive stale ── */
  pi.on("turn_end", async (event) => {
    turnIndex = (event as { turnIndex?: number }).turnIndex ?? turnIndex + 1;
    archiveStale(fingerprint, turnIndex);

    if (suppressedCount > 0 && turnIndex % 5 === 0) {
      suppressedCount = 0;
    }
  });

  /* ── /pruner-status command ── */
  pi.registerCommand("pruner-status", {
    description: "Show context pruner statistics",
    handler: async (_args, ctx) => {
      const fileCount = fingerprint.files.size;
      const totalSigs = [...fingerprint.files.values()].reduce(
        (s, f) => s + f.signatures.size, 0,
      );
      ctx.ui.notify(
        `Context Pruner\n  Files: ${fileCount}\n  Signatures: ${totalSigs}\n  Suppressed: ${suppressedCount}`,
        "info",
      );
    },
  });
}
