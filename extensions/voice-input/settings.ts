import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export type VoiceMode = "push-to-talk" | "toggle" | "always";
export type WorkerState = "stopped" | "starting" | "ready" | "listening" | "transcribing" | "error";

export type VoiceSettings = {
  mode?: VoiceMode;
  autoLaunchWorker?: boolean;
  wakePhrases?: string[];
  sampleRate?: number;
  ffmpegPath?: string;
  audioDevice?: string;
  captureArgs?: string[];
  workerCommand?: string[];
  workerHost?: string;
  workerPort?: number;
  appendSeparator?: string;
  logPath?: string;
};

export const SETTINGS_PATH = join(getAgentDir(), "voice-input.json");
export const DEFAULT_WAKE_PHRASES = ["hey emi", "hey emy", "hey emilia", "hey emmy", "emi", "emy", "emilia", "emmy"];

export function defaultSettings(): Required<VoiceSettings> {
  return {
    mode: "toggle",
    autoLaunchWorker: false,
    wakePhrases: DEFAULT_WAKE_PHRASES,
    sampleRate: 16000,
    ffmpegPath: "",
    audioDevice: "",
    captureArgs: [],
    workerCommand: [],
    workerHost: "127.0.0.1",
    workerPort: 8765,
    appendSeparator: " ",
    logPath: join(getAgentDir(), "voice-input", "voice-worker.log"),
  };
}

export function normalizeSettings(settings: VoiceSettings): Required<VoiceSettings> {
  const defaults = defaultSettings();
  const mode = settings.mode === "push-to-talk" || settings.mode === "toggle" || settings.mode === "always" ? settings.mode : defaults.mode;
  return {
    mode,
    autoLaunchWorker: typeof settings.autoLaunchWorker === "boolean" ? settings.autoLaunchWorker : defaults.autoLaunchWorker,
    wakePhrases: Array.isArray(settings.wakePhrases) && settings.wakePhrases.length ? settings.wakePhrases.map(String) : defaults.wakePhrases,
    sampleRate: typeof settings.sampleRate === "number" && settings.sampleRate > 0 ? settings.sampleRate : defaults.sampleRate,
    ffmpegPath: typeof settings.ffmpegPath === "string" ? settings.ffmpegPath : defaults.ffmpegPath,
    audioDevice: typeof settings.audioDevice === "string" ? settings.audioDevice : defaults.audioDevice,
    captureArgs: Array.isArray(settings.captureArgs) ? settings.captureArgs.map(String) : defaults.captureArgs,
    workerCommand: Array.isArray(settings.workerCommand) ? settings.workerCommand.map(String) : defaults.workerCommand,
    workerHost: typeof settings.workerHost === "string" && settings.workerHost ? settings.workerHost : defaults.workerHost,
    workerPort: typeof settings.workerPort === "number" && settings.workerPort > 0 ? settings.workerPort : defaults.workerPort,
    appendSeparator: typeof settings.appendSeparator === "string" ? settings.appendSeparator : defaults.appendSeparator,
    logPath: typeof settings.logPath === "string" && settings.logPath ? settings.logPath : defaults.logPath,
  };
}

export function loadSettings(): Required<VoiceSettings> {
  if (!existsSync(SETTINGS_PATH)) return defaultSettings();
  try {
    return normalizeSettings(JSON.parse(readFileSync(SETTINGS_PATH, "utf-8")) as VoiceSettings);
  } catch (error) {
    console.error(`[voice-input] Failed to read ${SETTINGS_PATH}: ${error instanceof Error ? error.message : String(error)}`);
    return defaultSettings();
  }
}

export function saveSettings(settings: VoiceSettings): Required<VoiceSettings> {
  const normalized = normalizeSettings(settings);
  mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
  writeFileSync(SETTINGS_PATH, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  return normalized;
}
