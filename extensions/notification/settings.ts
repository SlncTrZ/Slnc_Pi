import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type NotificationMode = "off" | "beep" | "tts" | "both";

const VALID_MODES: NotificationMode[] = ["off", "beep", "tts", "both"];

function getSettingsPath(): string {
  const piDir = path.join(os.homedir(), ".pi", "agent");
  return path.join(piDir, "notification-settings.json");
}

export function readSettings(): NotificationMode {
  const settingsPath = getSettingsPath();
  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.mode === "string" &&
      VALID_MODES.includes(parsed.mode as NotificationMode)
    ) {
      return parsed.mode as NotificationMode;
    }
  } catch {
    // File missing, unreadable, or malformed — default to off
  }
  return "off";
}

export function writeSettings(mode: NotificationMode): void {
  const settingsPath = getSettingsPath();
  const piDir = path.dirname(settingsPath);
  fs.mkdirSync(piDir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify({ mode }, null, 2) + "\n", "utf-8");
}
