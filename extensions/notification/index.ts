/**
 * Notification Extension
 *
 * Provides a `/notification` slash command with four modes:
 *   off   — no audio (default)
 *   beep  — play a bundled beep before the final narrative response
 *   tts   — read the final narrative response aloud
 *   both  — beep, then TTS
 *
 * Only active in interactive mode. Persists mode as an extension-owned
 * JSON file under the pi config directory.
 *
 * Detection strategy: the "final narrative response" is the last assistant
 * message in the agent turn that contains no tool calls. This is the message
 * where the model decides it no longer needs tools.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { AutocompleteItem } from '@earendil-works/pi-tui';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { playBeep, speak } from './audio';
import { stripForSpeech } from './markdown';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

const MODES = ['off', 'beep', 'tts', 'both'] as const;
type Mode = (typeof MODES)[number];

interface Settings { mode: Mode }

/* ------------------------------------------------------------------ */
/*  Persistent settings (extension-owned JSON file)                    */
/* ------------------------------------------------------------------ */

function getConfigDir(): string {
  const override = process.env.PI_CODING_AGENT_DIR;
  if (override) return override;
  return join(homedir(), '.pi', 'agent');
}

const SETTINGS_FILE = 'notification-settings.json';

function loadSettings(): Settings {
  try {
    const raw = readFileSync(join(getConfigDir(), SETTINGS_FILE), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { mode: MODES.includes(parsed.mode as Mode) ? parsed.mode : 'off' };
  } catch {
    return { mode: 'off' };
  }
}

function saveSettings(settings: Settings): void {
  try {
    writeFileSync(
      join(getConfigDir(), SETTINGS_FILE),
      JSON.stringify(settings, null, 2) + '\n',
      'utf-8',
    );
  } catch (err) {
    console.error('[notification] Failed to save settings:', err);
  }
}

/* ------------------------------------------------------------------ */
/*  Content-block helpers                                              */
/* ------------------------------------------------------------------ */

type ContentBlock = { type?: string; text?: string };

function getTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(
      (b): b is ContentBlock =>
        b && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string',
    )
    .map((b) => b.text)
    .join('\n');
}

function hasToolCalls(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  return content.some((b) => b && typeof b === 'object' && b.type === 'toolCall');
}

/* ------------------------------------------------------------------ */
/*  Extension                                                          */
/* ------------------------------------------------------------------ */

export default function (pi: ExtensionAPI) {
  // --- Persistent state ---
  let settings: Settings = loadSettings();

  // --- Per-agent-run state ---
  let sawToolResults = false;   // true once any tool execution completed
  let notified = false;         // guard against double-notification
  let lastAssistantText = '';   // text of the last assistant message seen
  let lastAssistantHadTools = false;
  let ttsStop = false;          // set on shutdown to halt TTS

  // Resolve the bundled beep path
  const beepPath = join(__dirname, 'beep.wav');

  // --- /notification command ---
  pi.registerCommand('notification', {
    description: 'Control notification mode (off, beep, tts, both)',
    getArgumentCompletions(prefix): AutocompleteItem[] | null {
      const options = ['status', ...MODES];
      const filtered = options.filter((o) => o.startsWith(prefix));
      return filtered.length > 0
        ? filtered.map((o) => ({ value: o, label: o }))
        : null;
    },
    handler: async (_args, ctx) => {
      const arg = _args.trim().toLowerCase();
      const mode = arg === 'status' ? settings.mode : arg;

      if (MODES.includes(mode as Mode)) {
        settings = { mode };
        saveSettings(settings);
        ctx.ui.notify(`Notification mode: ${mode}`, 'info');
      } else {
        ctx.ui.notify(`Current notification mode: ${settings.mode}`, 'info');
      }
    },
  });

  // --- Notification helpers ---
  async function tryBeep(): Promise<void> {
    if (!existsSync(beepPath)) {
      console.error('[notification] beep.wav not found at', beepPath);
      return;
    }
    try {
      await playBeep(beepPath);
    } catch (err) {
      console.error('[notification] Beep playback failed:', err);
    }
  }

  async function speakText(text: string): Promise<void> {
    if (!text.trim() || ttsStop) return;
    const clean = stripForSpeech(text);
    if (!clean.trim()) return;

    try {
      await speak(clean);
    } catch (err) {
      console.error('[notification] TTS failed:', err);
    }
  }

  /**
   * Trigger notification for the final narrative response.
   * Uses `notified` guard to prevent double-firing.
   */
  async function notifyFinal(text: string): Promise<void> {
    if (notified || settings.mode === 'off' || !text.trim()) return;
    notified = true;

    const mode = settings.mode;
    if (mode === 'beep' || mode === 'both') {
      await tryBeep();
    }
    if (mode === 'tts' || mode === 'both') {
      await speakText(text);
    }
  }

  // --- Event hooks ---

  pi.on('agent_start', async (_event, ctx) => {
    if (!ctx.hasUI) return; // interactive mode only
    sawToolResults = false;
    notified = false;
    lastAssistantText = '';
    lastAssistantHadTools = false;
    ttsStop = false;
  });

  pi.on('message_end', async (event, ctx) => {
    if (!ctx.hasUI) return; // interactive mode only
    if (settings.mode === 'off') return;
    if (event.message.role !== 'assistant') return;

    const text = getTextContent(event.message.content);
    const hasTools = hasToolCalls(event.message.content);

    // Always track the latest assistant message
    lastAssistantText = text;
    lastAssistantHadTools = hasTools;

    if (!hasTools && sawToolResults) {
      // Final narrative: no tool calls, and we've already seen tool use
      await notifyFinal(text);
    }
    // If !hasTools && !sawToolResults: might be the only message (no tools
    // at all) or there may be tool turns after. We'll handle the only-message
    // case at agent_end as a safety net.
  });

  pi.on('tool_execution_end', async (_event, ctx) => {
    if (!ctx.hasUI) return; // interactive mode only
    sawToolResults = true;
  });

  pi.on('agent_end', async (_event, ctx) => {
    if (!ctx.hasUI) return; // interactive mode only
    // Safety net for the "only message, no tools" case
    if (!notified && lastAssistantText && !lastAssistantHadTools) {
      await notifyFinal(lastAssistantText);
    }
  });

  pi.on('session_shutdown', async () => {
    ttsStop = true;
  });
}
