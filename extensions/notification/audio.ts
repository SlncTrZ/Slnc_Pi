import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface AudioError {
  ok: false;
  error: string;
}

interface AudioSuccess {
  ok: true;
}

type AudioResult = AudioSuccess | AudioError;

const EXTENSION_DIR = __dirname;

/**
 * Resolve the bundled beep.wav asset path.
 */
function getBeepPath(): string {
  return path.join(EXTENSION_DIR, "beep.wav");
}

/**
 * Play the bundled beep.wav using OS-specific commands.
 */
export async function playBeep(): Promise<AudioResult> {
  const beepPath = getBeepPath();
  if (!fs.existsSync(beepPath)) {
    return { ok: false, error: `Bundled beep.wav not found at ${beepPath}` };
  }

  const platform = os.platform();

  try {
    if (platform === "win32") {
      await playBeepWindows(beepPath);
    } else if (platform === "darwin") {
      await playBeepMac(beepPath);
    } else {
      await playBeepLinux(beepPath);
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `Beep playback failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Windows: use PowerShell with System.Media.SoundPlayer.
 */
async function playBeepWindows(wavPath: string): Promise<void> {
  const scriptPath = path.join(os.tmpdir(), `pi-beep-${Date.now()}.ps1`);
  const escapedPath = wavPath.replace(/'/g, "''");
  const script = `
[System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms") | Out-Null
$player = New-Object System.Media.SoundPlayer
$player.SoundLocation = '${escapedPath}'
$player.PlaySync()
`;
  try {
    fs.writeFileSync(scriptPath, script, "utf-8");
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
    ]);
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * macOS: use afplay.
 */
async function playBeepMac(wavPath: string): Promise<void> {
  await execFileAsync("afplay", [wavPath]);
}

/**
 * Linux: use ffplay with -nodisp -autoexit.
 */
async function playBeepLinux(wavPath: string): Promise<void> {
  await execFileAsync("ffplay", ["-nodisp", "-autoexit", wavPath]);
}

/**
 * Speak text using OS-specific TTS.
 */
export async function speakText(text: string): Promise<AudioResult> {
  if (!text || !text.trim()) {
    return { ok: false, error: "Empty text provided to TTS" };
  }

  const platform = os.platform();

  try {
    if (platform === "win32") {
      await speakWindows(text);
    } else if (platform === "darwin") {
      await speakMac(text);
    } else {
      await speakLinux(text);
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `TTS failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Windows: use PowerShell with SAPI.SPVoice.
 */
async function speakWindows(text: string): Promise<void> {
  const scriptPath = path.join(os.tmpdir(), `pi-tts-${Date.now()}.ps1`);
  // Escape single quotes for PowerShell
  const escapedText = text.replace(/'/g, "''");
  const script = `
$voice = New-Object -ComObject SAPI.SPVoice
$voice.Speak('${escapedText}', 0)
$voice = $null
`;
  try {
    fs.writeFileSync(scriptPath, script, "utf-8");
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
    ]);
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * macOS: use say command.
 */
async function speakMac(text: string): Promise<void> {
  await execFileAsync("say", [text]);
}

/**
 * Linux: use edge-tts piped to ffplay if available,
 * otherwise fall back to espeak.
 */
async function speakLinux(text: string): Promise<void> {
  // Try edge-tts + ffplay first
  try {
    const tmpFile = path.join(os.tmpdir(), `pi-tts-${Date.now()}.mp3`);
    await execFileAsync("edge-tts", [
      "-t", text,
      "-f", tmpFile,
    ]);
    await execFileAsync("ffplay", ["-nodisp", "-autoexit", tmpFile]);
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // Ignore cleanup
    }
    return;
  } catch {
    // edge-tts not available, try espeak
  }

  try {
    await execFileAsync("espeak", [text]);
    return;
  } catch {
    // espeak not available either
  }

  throw new Error(
    "No TTS engine available on Linux. Install edge-tts ('pip install edge-tts') + ffplay, or install espeak."
  );
}
