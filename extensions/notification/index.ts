import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import type { NotificationMode } from "./settings";
import { readSettings, writeSettings } from "./settings";
import { stripMarkdown, splitSentences } from "./markdown";
import { playBeep, speakText } from "./audio";

const VALID_MODES: NotificationMode[] = ["off", "beep", "tts", "both"];
const COMPLETION_ITEMS: AutocompleteItem[] = [
  { value: "off", label: "off", description: "Disable notifications" },
  { value: "beep", label: "beep", description: "Play beep on response" },
  { value: "tts", label: "tts", description: "Read response aloud" },
  { value: "both", label: "both", description: "Beep then read response aloud" },
  { value: "status", label: "status", description: "Show current mode" },
  { value: "help", label: "help", description: "Show usage information" },
  { value: "test-beep", label: "test-beep", description: "Test beep playback" },
  { value: "test-tts", label: "test-tts", description: "Test TTS speech" },
];

const HELP_TEXT = [
  "Notification modes:",
  "  /notification off      — Disable notifications (default)",
  "  /notification beep     — Play beep on response",
  "  /notification tts      — Read response aloud",
  "  /notification both     — Beep then read response aloud",
  "",
  "Commands:",
  "  /notification status   — Show current mode",
  "  /notification help     — Show this help text",
  "  /notification test-beep — Test beep playback",
  "  /notification test-tts  — Test TTS speech",
].join("\n");

/**
 * Current notification mode, loaded from persistent settings at startup.
 */
let currentMode: NotificationMode = "off";

/**
 * Extract the final narrative assistant message from the session branch.
 * Walks backward to find the last assistant message that:
 * - Has text content blocks
 * - Has no toolCall content blocks
 */
function findFinalNarrative(ctx: ExtensionContext): string | null {
  const branch = ctx.sessionManager.getBranch();

  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry.type !== "message") continue;
    if (entry.message?.role !== "assistant") continue;
    if (!Array.isArray(entry.message.content)) continue;

    const content = entry.message.content;
    const hasToolCall = content.some(
      (block: Record<string, unknown>) => block.type === "toolCall"
    );
    if (hasToolCall) continue;

    const textBlocks = content.filter(
      (block: Record<string, unknown>) => block.type === "text"
    );
    if (textBlocks.length === 0) continue;

    const text = textBlocks
      .map((block: Record<string, unknown>) => block.text)
      .join("\n");

    return text || null;
  }

  return null;
}

/**
 * Execute the notification behavior for the final narrative response.
 */
async function executeNotification(
  ctx: ExtensionContext,
  narrativeText: string
): Promise<void> {
  const mode = currentMode;

  if (mode === "off") return;

  // Beep (beep or both)
  if (mode === "beep" || mode === "both") {
    const beepResult = await playBeep();
    if (!beepResult.ok) {
      ctx.ui.notify(beepResult.error, "error");
    }
  }

  // TTS (tts or both)
  if (mode === "tts" || mode === "both") {
    const cleanText = stripMarkdown(narrativeText);
    const sentences = splitSentences(cleanText);

    for (const sentence of sentences) {
      const ttsResult = await speakText(sentence);
      if (!ttsResult.ok) {
        ctx.ui.notify(ttsResult.error, "error");
        // Continue processing remaining sentences even if one fails
      }
    }
  }
}

/**
 * Command handler for /notification
 */
async function handleNotification(args: string, ctx: ExtensionContext): Promise<void> {
  const trimmed = args.trim().toLowerCase();

  if (!trimmed || trimmed === "help" || trimmed === "status") {
    if (trimmed === "status" || !trimmed) {
      ctx.ui.notify(`Notification mode: ${currentMode}`, "info");
    }
    if (trimmed === "help" || !trimmed) {
      ctx.ui.notify(HELP_TEXT, "info");
    }
    return;
  }

  // Test commands
  if (trimmed === "test-beep") {
    const result = await playBeep();
    if (result.ok) {
      ctx.ui.notify("Beep played successfully", "info");
    } else {
      ctx.ui.notify(result.error, "error");
    }
    return;
  }

  if (trimmed === "test-tts") {
    const result = await speakText("This is a test of the notification system.");
    if (result.ok) {
      ctx.ui.notify("TTS test completed successfully", "info");
    } else {
      ctx.ui.notify(result.error, "error");
    }
    return;
  }

  // Mode setting
  if (VALID_MODES.includes(trimmed as NotificationMode)) {
    currentMode = trimmed as NotificationMode;
    writeSettings(currentMode);
    ctx.ui.notify(`Notification mode set to: ${currentMode}`, "info");
    return;
  }

  ctx.ui.notify(
    `Invalid mode "${trimmed}". Valid modes: ${VALID_MODES.join(", ")}`,
    "error"
  );
}

/**
 * Extension entrypoint.
 */
export default function (pi: ExtensionAPI): void {
  // Load persistent settings
  currentMode = readSettings();

  // Register the /notification command
  pi.registerCommand("notification", {
    description: "Configure response notifications (off, beep, tts, both)",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const lower = prefix.toLowerCase();
      const filtered = COMPLETION_ITEMS.filter((item) =>
        item.value.startsWith(lower)
      );
      return filtered.length > 0 ? filtered : null;
    },
    handler: handleNotification,
  });

  // Hook agent_end to trigger notifications after responses
  pi.on("agent_end", async (_event, ctx) => {
    // Only run in interactive mode
    if (!ctx.hasUI) return;

    // Skip if mode is off
    if (currentMode === "off") return;

    // Find the final narrative assistant message
    const narrativeText = findFinalNarrative(ctx);

    if (!narrativeText) {
      ctx.ui.notify(
        "Notification skipped: no final narrative assistant message found.",
        "error"
      );
      return;
    }

    // Execute the notification
    await executeNotification(ctx, narrativeText);
  });
}
