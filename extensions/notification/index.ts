import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { readSettings, writeSettings, type NotificationMode } from "./settings";
import { playBeep, speakText } from "./audio";
import { stripMarkdown, splitIntoSentences } from "./markdown";

// ---------------------------------------------------------------------------
// In-memory mode state (reloaded from settings on each extension load)
// ---------------------------------------------------------------------------

let currentMode: NotificationMode = readSettings().mode;

// ---------------------------------------------------------------------------
// Argument completions
// ---------------------------------------------------------------------------

const COMPLETION_VALUES: readonly string[] = [
  "off",
  "beep",
  "tts",
  "both",
  "status",
  "help",
  "test-beep",
  "test-tts",
];

function getArgumentCompletions(prefix: string): AutocompleteItem[] | null {
  const items = COMPLETION_VALUES.map((v) => ({ value: v, label: v }));
  if (prefix) {
    const filtered = items.filter((i) => i.value.startsWith(prefix));
    return filtered.length > 0 ? filtered : null;
  }
  return items;
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

const HELP_TEXT = [
  "/notification <mode|command>",
  "",
  "Modes:",
  "  off       No audio notification (default)",
  "  beep      Play a beep when the assistant responds",
  "  tts       Read the assistant response aloud",
  "  both      Play a beep, then read the response aloud",
  "",
  "Commands:",
  "  status    Show current notification mode",
  "  test-beep Play the bundled beep immediately",
  "  test-tts  Speak a test phrase immediately",
  "  help      Show this help text",
].join("\n");

async function handleCommand(args: string, _ctx: any): Promise<void> {
  const trimmed = args.trim().toLowerCase();

  // Handle subcommands that include hyphens first
  if (trimmed === "test-beep") {
    try {
      await playBeep();
      _ctx.ui.notify("Beep played successfully.", "info");
    } catch (err: any) {
      _ctx.ui.notify(`Beep failed: ${err.message}`, "error");
    }
    return;
  }

  if (trimmed === "test-tts") {
    try {
      await speakText("Hello. This is a test of the notification extension.");
      _ctx.ui.notify("TTS test phrase spoken successfully.", "info");
    } catch (err: any) {
      _ctx.ui.notify(`TTS failed: ${err.message}`, "error");
    }
    return;
  }

  if (trimmed === "status") {
    _ctx.ui.notify(`Notification mode: ${currentMode}`, "info");
    return;
  }

  if (trimmed === "help") {
    _ctx.ui.notify(HELP_TEXT, "info");
    return;
  }

  // Handle mode switches
  const validModes: readonly NotificationMode[] = ["off", "beep", "tts", "both"];

  if (validModes.includes(trimmed as NotificationMode)) {
    currentMode = trimmed as NotificationMode;
    writeSettings(currentMode);
    _ctx.ui.notify(`Notification mode set to: ${currentMode}`, "info");
  } else if (trimmed) {
    _ctx.ui.notify(
      `Unknown mode "${trimmed}". Valid modes: off, beep, tts, both. Use /notification help for details.`,
      "error",
    );
  } else {
    _ctx.ui.notify(
      `Notification mode: ${currentMode}. Use /notification help for details.`,
      "info",
    );
  }
}

// ---------------------------------------------------------------------------
// Final narrative detection
// ---------------------------------------------------------------------------

/**
 * Walk the session branch backward to find the last assistant message that
 * is pure narrative text (contains text blocks, no toolCall blocks).
 *
 * Returns the joined narrative text or null if no such message exists.
 */
function findFinalNarrativeText(branch: any[]): string | null {
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];

    if (entry.type !== "message") continue;
    if (entry.message?.role !== "assistant") continue;

    const content = entry.message.content;
    if (!Array.isArray(content)) continue;

    const hasToolCall = content.some((block: any) => block.type === "toolCall");
    if (hasToolCall) continue;

    const textBlocks = content.filter((block: any) => block.type === "text");
    if (textBlocks.length === 0) continue;

    // Found the final narrative message
    return textBlocks.map((block: any) => block.text).join("\n");
  }

  return null;
}

// ---------------------------------------------------------------------------
// agent_end handler
// ---------------------------------------------------------------------------

async function handleAgentEnd(_event: any, ctx: any): Promise<void> {
  // Only run in interactive mode
  if (!ctx.hasUI) return;

  // Skip if mode is off
  if (currentMode === "off") return;

  // Find the final narrative assistant message
  const branch = ctx.sessionManager.getBranch();
  const narrativeText = findFinalNarrativeText(branch);

  if (!narrativeText) {
    ctx.ui.notify("Notification skipped: no final narrative assistant message found.", "error");
    return;
  }

  // --- Beep ---
  if (currentMode === "beep" || currentMode === "both") {
    try {
      await playBeep();
    } catch (err: any) {
      ctx.ui.notify(`Notification beep failed: ${err.message}`, "error");
    }
  }

  // --- TTS ---
  if (currentMode === "tts" || currentMode === "both") {
    try {
      const cleaned = stripMarkdown(narrativeText);
      const sentences = splitIntoSentences(cleaned);

      for (const sentence of sentences) {
        await speakText(sentence);
      }
    } catch (err: any) {
      ctx.ui.notify(`Notification TTS failed: ${err.message}`, "error");
    }
  }
}

// ---------------------------------------------------------------------------
// Extension entrypoint
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI): void {
  // Register the /notification command
  pi.registerCommand("notification", {
    description: "Configure response audio notifications (off/beep/tts/both)",
    getArgumentCompletions,
    handler: handleCommand,
  });

  // Hook agent_end for response-driven notifications
  pi.on("agent_end", handleAgentEnd);
}
