import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** Allowed notification modes */
export type NotificationMode = "off" | "beep" | "tts" | "both";

const VALID_MODES: readonly NotificationMode[] = ["off", "beep", "tts", "both"];

/** Settings shape persisted to disk */
interface NotificationSettings {
  mode: NotificationMode;
}

/** Resolve the settings file path under ~/.pi/agent/ */
function getSettingsPath(): string {
  const home = os.homedir();
  const agentDir = path.join(home, ".pi", "agent");
  return path.join(agentDir, "notification-settings.json");
}

/**
 * Read the persisted notification settings. Returns `{ mode: "off" }` on
 * any read / parse failure so callers never crash.
 */
export function readSettings(): NotificationSettings {
  const settingsPath = getSettingsPath();

  try {
    if (!fs.existsSync(settingsPath)) {
      return { mode: "off" };
    }

    const raw = fs.readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "mode" in parsed &&
      VALID_MODES.includes((parsed as NotificationSettings).mode as NotificationMode)
    ) {
      return parsed as NotificationSettings;
    }

    // Invalid content — fall through to default
    return { mode: "off" };
  } catch {
    return { mode: "off" };
  }
}

/**
 * Persist the notification mode to disk. Creates the `~/.pi/agent/`
 * directory if it doesn't already exist.
 */
export function writeSettings(mode: NotificationMode): void {
  const settingsPath = getSettingsPath();
  const agentDir = path.dirname(settingsPath);

  if (!fs.existsSync(agentDir)) {
    fs.mkdirSync(agentDir, { recursive: true });
  }

  const data: NotificationSettings = { mode };
  fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}
