/**
 * System-agnostic audio playback and TTS.
 *
 * Uses platform-native tools with no external dependencies:
 *   - Windows: PowerShell SoundPlayer (beep), SAPI SpeechSynthesizer (TTS)
 *   - macOS:   afplay (beep), say (TTS)
 *   - Linux:   paplay/aplay/ffplay (beep), espeak (TTS)
 *
 * All functions return a promise that resolves on success
 * or rejects with a descriptive error on failure.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const PLATFORM = process.platform;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function escapePs(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function run(cmd: string, args: string[]): Promise<void> {
  return execFileAsync(cmd, args, { timeout: 60_000, windowsHide: true })
    .then(() => {})
    .catch((err: unknown) => {
      throw new Error(`${cmd} ${args.join(' ')}: ${err instanceof Error ? err.message : String(err)}`);
    });
}

/* ------------------------------------------------------------------ */
/*  Beep                                                               */
/* ------------------------------------------------------------------ */

export async function playBeep(wavPath: string): Promise<void> {
  if (PLATFORM === 'win32') {
    const ps = [
      '$sp = New-Object System.Media.SoundPlayer',
      `$sp.SoundLocation = ${escapePs(wavPath)}`,
      '$sp.PlaySync()',
      '$sp.Dispose()',
    ].join('; ');
    return run('powershell.exe', ['-NoProfile', '-Command', ps]);
  }
  if (PLATFORM === 'darwin') {
    return run('afplay', [wavPath]);
  }
  if (PLATFORM === 'linux') {
    for (const player of ['paplay', 'aplay']) {
      try { return run(player, [wavPath]); } catch { /* try next */ }
    }
    return run('ffplay', ['-nodisp', '-autoexit', wavPath]);
  }
  // Fallback chain for unknown platforms
  for (const [cmd, args] of [
    ['afplay', [wavPath]],
    ['paplay', [wavPath]],
    ['ffplay', ['-nodisp', '-autoexit', wavPath]],
  ]) {
    try { return run(cmd, args); } catch { /* try next */ }
  }
  throw new Error(`No audio player found on ${PLATFORM}`);
}

/* ------------------------------------------------------------------ */
/*  TTS                                                                */
/* ------------------------------------------------------------------ */

export async function speak(text: string): Promise<void> {
  if (!text.trim()) return;

  if (PLATFORM === 'win32') {
    const ps = [
      'Add-Type -AssemblyName System.Speech',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      `$s.Speak(${escapePs(text)})`,
      '$s.Dispose()',
    ].join('; ');
    return run('powershell.exe', ['-NoProfile', '-Command', ps]);
  }
  if (PLATFORM === 'darwin') {
    return run('say', [text]);
  }
  if (PLATFORM === 'linux') {
    // Try espeak first, then fallback to festival
    try { return run('espeak', [text]); } catch { /* fall through */ }
    try {
      return run('festival', ['--tts', '--pipe', text]);
    } catch { /* fall through */ }
    throw new Error(`No TTS engine found on Linux (tried espeak, festival)`);
  }
  // Fallback chain
  try { return run('say', [text]); } catch { /* try next */ }
  try { return run('espeak', [text]); } catch { /* try next */ }
  throw new Error(`No TTS engine found on ${PLATFORM}`);
}
