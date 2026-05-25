import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";

/**
 * Resolve the path to the bundled beep.wav asset relative to this file.
 */
function getBeepPath(): string {
  return path.join(__dirname, "beep.wav");
}

/**
 * Spawn a child process and wait for it to complete. Resolves with
 * `{ exitCode }` or rejects with `{ exitCode, stderr }` on failure.
 */
function runProcess(
  command: string,
  args: string[],
  options?: { timeout?: number },
): Promise<{ exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const timeout = options?.timeout ?? 30_000;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Process timed out after ${timeout}ms: ${command} ${args.join(" ")}`));
    }, timeout);

    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      if (exitCode === 0) {
        resolve({ exitCode });
      } else {
        reject(new Error(
          `Process exited with code ${exitCode}: ${command} ${args.join(" ")}${stderr ? `\n${stderr.trim()}` : ""}`,
        ));
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Process failed to start: ${err.message}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Beep playback
// ---------------------------------------------------------------------------

/** Play the bundled beep.wav using platform-appropriate backend */
export async function playBeep(): Promise<void> {
  const beepPath = getBeepPath();

  if (!fs.existsSync(beepPath)) {
    throw new Error(`Bundled beep asset not found at: ${beepPath}`);
  }

  const platform = os.platform();

  if (platform === "win32") {
    await playBeepWindows(beepPath);
  } else if (platform === "darwin") {
    await playBeepMac(beepPath);
  } else {
    await playBeepLinux(beepPath);
  }
}

/**
 * Windows: use PowerShell + System.Media.SoundPlayer for reliable WAV playback.
 * Writes a temp .ps1 script to avoid quoting issues.
 */
async function playBeepWindows(beepPath: string): Promise<void> {
  const scriptPath = path.join(os.tmpdir(), `pi-notification-beep-${Date.now()}.ps1`);
  const escapedPath = beepPath.replace(/'/g, "''");
  const script = `[System.Media.SoundPlayer]::new('${escapedPath}').PlaySync();`;
  fs.writeFileSync(scriptPath, script, "utf-8");

  try {
    await runProcess("powershell.exe", [
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
      // Best-effort cleanup
    }
  }
}

/** macOS: use afplay */
async function playBeepMac(beepPath: string): Promise<void> {
  await runProcess("afplay", [beepPath]);
}

/** Linux: try ffplay, fall back to aplay */
async function playBeepLinux(beepPath: string): Promise<void> {
  try {
    await runProcess("ffplay", ["-nodisp", "-autoexit", beepPath]);
    return;
  } catch {
    // ffplay not available, try aplay
  }
  try {
    await runProcess("aplay", [beepPath]);
    return;
  } catch {
    throw new Error(
      "No suitable audio player found on Linux. Install ffplay or aplay for beep playback.",
    );
  }
}

// ---------------------------------------------------------------------------
// TTS playback
// ---------------------------------------------------------------------------

/** Speak text using platform-appropriate local TTS backend */
export async function speakText(text: string): Promise<void> {
  const platform = os.platform();

  if (platform === "win32") {
    await speakWindows(text);
  } else if (platform === "darwin") {
    await speakMac(text);
  } else {
    await speakLinux(text);
  }
}

/**
 * Windows: use PowerShell + System.Speech.Synthesis.SpeechSynthesizer.
 * Writes a temp .ps1 script to handle long text safely. Uses the
 * .NET Speech API instead of SAPI COM for better reliability inside
 * pi's extension runtime.
 */
async function speakWindows(text: string): Promise<void> {
  const scriptPath = path.join(os.tmpdir(), `pi-notification-tts-${Date.now()}.ps1`);
  // Use UTF-8 BOM so PowerShell handles special characters
  const bom = "\uFEFF";
  // Escape single quotes for PowerShell
  const escapedText = text.replace(/'/g, "''");
  const script = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Speak('${escapedText}')
$synth.Dispose()
`;
  fs.writeFileSync(scriptPath, bom + script, "utf-8");

  try {
    await runProcess("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
    ], { timeout: 120_000 });
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      // Best-effort cleanup
    }
  }
}

/** macOS: use the say command */
async function speakMac(text: string): Promise<void> {
  // Write to temp file to avoid shell escaping issues with long text
  const textPath = path.join(os.tmpdir(), `pi-notification-tts-${Date.now()}.txt`);
  fs.writeFileSync(textPath, text, "utf-8");

  try {
    await runProcess("say", ["-f", textPath], { timeout: 120_000 });
  } finally {
    try {
      fs.unlinkSync(textPath);
    } catch {
      // Best-effort cleanup
    }
  }
}

/**
 * Linux: try espeak first, then fall back to edge-tts + ffplay.
 */
async function speakLinux(text: string): Promise<void> {
  // Try espeak
  try {
    const textPath = path.join(os.tmpdir(), `pi-notification-tts-${Date.now()}.txt`);
    fs.writeFileSync(textPath, text, "utf-8");
    try {
      await runProcess("espeak", ["-s", "150", "-f", textPath], { timeout: 120_000 });
      return;
    } finally {
      try {
        fs.unlinkSync(textPath);
      } catch {
        // Best-effort
      }
    }
  } catch {
    // espeak not available
  }

  // Try edge-tts piped to ffplay
  try {
    const textPath = path.join(os.tmpdir(), `pi-notification-tts-${Date.now()}.txt`);
    const audioPath = path.join(os.tmpdir(), `pi-notification-tts-${Date.now()}.mp3`);
    fs.writeFileSync(textPath, text, "utf-8");
    try {
      await runProcess("edge-tts", ["--textfile", textPath, "--write-media", audioPath], { timeout: 60_000 });
      await runProcess("ffplay", ["-nodisp", "-autoexit", audioPath], { timeout: 120_000 });
      return;
    } finally {
      try {
        fs.unlinkSync(textPath);
      } catch { /* best-effort */ }
      try {
        fs.unlinkSync(audioPath);
      } catch { /* best-effort */ }
    }
  } catch {
    // edge-tts not available
  }

  throw new Error(
    "No suitable TTS engine found on Linux. Install espeak or edge-tts + ffplay for TTS playback.",
  );
}
