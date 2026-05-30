import { existsSync, mkdirSync, readFileSync, unlink, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFile, spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { connect as connectTls, type TLSSocket } from "node:tls";
import { connect as connectNet, type Socket } from "node:net";
import { randomBytes } from "node:crypto";
import { getAgentDir, type ExtensionAPI, type ExtensionCommandContext, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { openMenu, type MenuItem } from "./menu";

type NotificationMode = "off" | "beep" | "tts" | "both";
type TtsEngine = "fish" | "openai-compatible" | "windows-native" | "vllm-omni";

type FishSettings = {
	apiKey?: string;
	referenceId?: string;
	model?: "s2-pro";
};

type OpenAiCompatibleSettings = {
	apiKey?: string;
	baseUrl?: string;
	model?: string;
	voice?: string;
};

type VllmOmniSettings = {
	baseUrl?: string;
	audioPath?: string;
	refTextPath?: string;
	voiceCached?: boolean;
	maxNewTokens?: number;
};

type NotificationSettings = {
	mode?: NotificationMode;
	ttsEngine?: TtsEngine;
	fish?: FishSettings;
	openAiCompatible?: OpenAiCompatibleSettings;
	vllmOmni?: VllmOmniSettings;
};

const MODES = ["off", "beep", "tts", "both"] as const;
const TTS_ENGINES = ["fish", "openai-compatible", "windows-native", "vllm-omni"] as const;
const SETTINGS_PATH = join(getAgentDir(), "notification.json");
const BEEP_PATH = join(__dirname, "beep.wav");
const STATUS_KEY = "notification";
const DEFAULT_FISH_REFERENCE_ID = "6d370109274d4c29ab83ad6b6af77978";
const DEFAULT_FISH_MODEL = "s2-pro";
const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = "http://localhost:8000/v1";
const DEFAULT_OPENAI_COMPATIBLE_MODEL = "tts-1";
const DEFAULT_OPENAI_COMPATIBLE_VOICE = "alloy";
const DEFAULT_VLLM_OMNI_BASE_URL = "http://localhost:8091";
const DEFAULT_VLLM_OMNI_MAX_NEW_TOKENS = 256;
const VLLM_OMNI_SAMPLE_RATE = 44100;
const FISH_STREAM_SAMPLE_RATE = 44100;

function isNotificationMode(value: string): value is NotificationMode {
	return (MODES as readonly string[]).includes(value);
}

function isTtsEngine(value: string): value is TtsEngine {
	return (TTS_ENGINES as readonly string[]).includes(value);
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message || error.name;
	return String(error);
}

function notifyFailure(ctx: ExtensionContext | undefined, message: string): void {
	if (ctx?.hasUI) {
		ctx.ui.notify(message, "error");
	}
	console.error(`[notification] ${message}`);
}

function defaultSettings(): Required<Pick<NotificationSettings, "mode" | "ttsEngine">> & NotificationSettings {
	return {
		mode: "off",
		ttsEngine: "fish",
		fish: {
			referenceId: DEFAULT_FISH_REFERENCE_ID,
			model: DEFAULT_FISH_MODEL,
		},
		openAiCompatible: {
			baseUrl: DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
			model: DEFAULT_OPENAI_COMPATIBLE_MODEL,
			voice: DEFAULT_OPENAI_COMPATIBLE_VOICE,
		},
		vllmOmni: {
			baseUrl: DEFAULT_VLLM_OMNI_BASE_URL,
			maxNewTokens: DEFAULT_VLLM_OMNI_MAX_NEW_TOKENS,
		},
	};
}

function normalizeSettings(settings: NotificationSettings): NotificationSettings {
	const defaults = defaultSettings();
	return {
		...defaults,
		...settings,
		mode: settings.mode && isNotificationMode(settings.mode) ? settings.mode : defaults.mode,
		ttsEngine: settings.ttsEngine && isTtsEngine(settings.ttsEngine) ? settings.ttsEngine : defaults.ttsEngine,
		fish: { ...defaults.fish, ...settings.fish },
		openAiCompatible: { ...defaults.openAiCompatible, ...settings.openAiCompatible },
		vllmOmni: { ...defaults.vllmOmni, ...settings.vllmOmni },
	};
}

function loadSettings(): NotificationSettings {
	if (!existsSync(SETTINGS_PATH)) return defaultSettings();
	try {
		const data = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8")) as NotificationSettings;
		return normalizeSettings(data);
	} catch (error) {
		console.error(`[notification] Failed to read ${SETTINGS_PATH}: ${formatError(error)}`);
		return defaultSettings();
	}
}

function saveSettings(settings: NotificationSettings): void {
	mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
	writeFileSync(SETTINGS_PATH, `${JSON.stringify(normalizeSettings(settings), null, 2)}\n`, "utf-8");
}

function escapePowerShellSingleQuoted(value: string): string {
	return value.replace(/'/g, "''");
}

function runPowerShell(script: string, env?: NodeJS.ProcessEnv, options?: { sta?: boolean }): Promise<void> {
	return new Promise((resolve, reject) => {
		const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script];
		if (options?.sta) args.unshift("-Sta");
		execFile("powershell.exe", args, { windowsHide: true, env: env ? { ...process.env, ...env } : process.env }, (error, _stdout, stderr) => {
			if (error) {
				const detail = stderr?.trim();
				reject(new Error(detail ? `${error.message}: ${detail}` : error.message));
				return;
			}
			resolve();
		});
	});
}

async function playWav(path: string): Promise<void> {
	if (process.platform === "win32") {
		const wavPath = escapePowerShellSingleQuoted(path);
		await runPowerShell(`$player = New-Object System.Media.SoundPlayer '${wavPath}'; $player.Load(); $player.PlaySync()`);
		return;
	}

	await new Promise<void>((resolve, reject) => {
		const player = process.platform === "darwin" ? "afplay" : "paplay";
		execFile(player, [path], (error) => {
			if (error) reject(error);
			else resolve();
		});
	});
}

async function playTtsWav(path: string): Promise<void> {
	if (process.platform === "win32") {
		const wavPath = escapePowerShellSingleQuoted(path);
		await runPowerShell(
			`Add-Type -AssemblyName PresentationCore;
$player = New-Object System.Windows.Media.MediaPlayer;
$player.Open([System.Uri]::new('${wavPath}'));
$opened = $false;
for ($i = 0; $i -lt 100; $i++) {
  if ($player.NaturalDuration.HasTimeSpan) { $opened = $true; break }
  Start-Sleep -Milliseconds 50;
}
if (-not $opened) { $player.Close(); throw 'Could not determine TTS audio duration.' }
$durationMs = [Math]::Max(250, [int]$player.NaturalDuration.TimeSpan.TotalMilliseconds + 300);
$player.Volume = 1.0;
$player.Play();
Start-Sleep -Milliseconds $durationMs;
$player.Close();`,
			undefined,
			{ sta: true },
		);
		return;
	}

	await playWav(path);
}

async function playBeep(): Promise<void> {
	await playWav(BEEP_PATH);
}

function getEnvValue(names: string[]): string | undefined {
	for (const name of names) {
		const value = process.env[name]?.trim();
		if (value) return value;
	}
	return undefined;
}

function getFishApiKey(settings: NotificationSettings): string | undefined {
	return getEnvValue(["PI_NOTIFICATION_FISH_API_KEY", "FISH_AUDIO_API_KEY"]) ?? settings.fish?.apiKey?.trim();
}

function getOpenAiCompatibleApiKey(settings: NotificationSettings): string | undefined {
	return getEnvValue(["PI_NOTIFICATION_OPENAI_TTS_API_KEY", "OPENAI_API_KEY"]) ?? settings.openAiCompatible?.apiKey?.trim();
}

function getVllmOmniBaseUrl(settings: NotificationSettings): string {
	return settings.vllmOmni?.baseUrl?.trim() ?? DEFAULT_VLLM_OMNI_BASE_URL;
}

/** Derive a voice name from the audio file basename (e.g. "my_voice.wav" → "my_voice"). */
function deriveVoiceName(audioPath: string): string {
	const base = audioPath.split(/[/\\]/).pop() ?? "voice";
	return base.replace(/\.[^.]+$/, "").replace(/[^\w-]/g, "_").slice(0, 64) || "voice";
}

/** Read the reference text from a file path, or return undefined. */
function readRefTextFromPath(refTextPath: string | undefined): string | undefined {
	if (!refTextPath || !existsSync(refTextPath)) return undefined;
	try {
		return readFileSync(refTextPath, "utf-8").trim();
	} catch {
		return undefined;
	}
}

async function ensureOk(response: Response): Promise<void> {
	if (response.ok) return;
	const text = await response.text().catch(() => "");
	throw new Error(`HTTP ${response.status}${text ? `: ${text.slice(0, 500)}` : ""}`);
}

function validateWav(bytes: Uint8Array): void {
	if (bytes.length < 44) {
		throw new Error(`TTS response was too small to be a WAV file (${bytes.length} bytes).`);
	}
	const riff = String.fromCharCode(...bytes.slice(0, 4));
	const wave = String.fromCharCode(...bytes.slice(8, 12));
	if (riff !== "RIFF" || wave !== "WAVE") {
		throw new Error(`TTS response was not a WAV file. First bytes: ${Array.from(bytes.slice(0, 16)).map((byte) => byte.toString(16).padStart(2, "0")).join(" ")}`);
	}
}

function writeTempWav(bytes: Uint8Array): string {
	validateWav(bytes);
	const path = join(tmpdir(), `pi-notification-tts-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`);
	writeFileSync(path, bytes);
	return path;
}

function deleteFileBestEffort(path: string): void {
	unlink(path, () => undefined);
}

async function synthesizeFishWav(text: string, settings: NotificationSettings): Promise<Uint8Array> {
	const apiKey = getFishApiKey(settings);
	if (!apiKey) {
		throw new Error("Fish Audio API key is not configured. Set PI_NOTIFICATION_FISH_API_KEY/FISH_AUDIO_API_KEY or run /notification tts-key fish <key>.");
	}

	const response = await fetch("https://api.fish.audio/v1/tts", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			model: settings.fish?.model ?? DEFAULT_FISH_MODEL,
		},
		body: JSON.stringify({
			text,
			reference_id: settings.fish?.referenceId ?? DEFAULT_FISH_REFERENCE_ID,
			format: "wav",
			sample_rate: FISH_STREAM_SAMPLE_RATE,
			temperature: 0.7,
			top_p: 0.7,
			chunk_length: 300,
			normalize: true,
			latency: "normal",
			max_new_tokens: 1024,
			repetition_penalty: 1.2,
			min_chunk_length: 50,
			condition_on_previous_chunks: true,
			early_stop_threshold: 1,
		}),
	});
	await ensureOk(response);
	return new Uint8Array(await response.arrayBuffer());
}

function encodeMsgpack(value: unknown): Uint8Array {
	const bytes: number[] = [];
	const textEncoder = new TextEncoder();
	const write = (byte: number) => bytes.push(byte & 0xff);
	const writeUint16 = (value: number) => {
		write(value >> 8);
		write(value);
	};
	const writeUint32 = (value: number) => {
		write(value >> 24);
		write(value >> 16);
		write(value >> 8);
		write(value);
	};
	const writeBytes = (data: Uint8Array) => bytes.push(...data);
	const encode = (item: unknown): void => {
		if (item === null || item === undefined) {
			write(0xc0);
			return;
		}
		if (typeof item === "boolean") {
			write(item ? 0xc3 : 0xc2);
			return;
		}
		if (typeof item === "number") {
			if (Number.isInteger(item) && item >= 0 && item <= 0x7f) write(item);
			else if (Number.isInteger(item) && item >= 0 && item <= 0xff) {
				write(0xcc);
				write(item);
			} else if (Number.isInteger(item) && item >= 0 && item <= 0xffff) {
				write(0xcd);
				writeUint16(item);
			} else {
				const buffer = new ArrayBuffer(8);
				new DataView(buffer).setFloat64(0, item, false);
				write(0xcb);
				writeBytes(new Uint8Array(buffer));
			}
			return;
		}
		if (typeof item === "string") {
			const data = textEncoder.encode(item);
			if (data.length <= 31) write(0xa0 | data.length);
			else if (data.length <= 0xff) {
				write(0xd9);
				write(data.length);
			} else if (data.length <= 0xffff) {
				write(0xda);
				writeUint16(data.length);
			} else {
				write(0xdb);
				writeUint32(data.length);
			}
			writeBytes(data);
			return;
		}
		if (item instanceof Uint8Array) {
			if (item.length <= 0xff) {
				write(0xc4);
				write(item.length);
			} else if (item.length <= 0xffff) {
				write(0xc5);
				writeUint16(item.length);
			} else {
				write(0xc6);
				writeUint32(item.length);
			}
			writeBytes(item);
			return;
		}
		if (Array.isArray(item)) {
			if (item.length <= 15) write(0x90 | item.length);
			else {
				write(0xdc);
				writeUint16(item.length);
			}
			for (const entry of item) encode(entry);
			return;
		}
		if (typeof item === "object") {
			const entries = Object.entries(item as Record<string, unknown>).filter(([, entryValue]) => entryValue !== undefined);
			if (entries.length <= 15) write(0x80 | entries.length);
			else {
				write(0xde);
				writeUint16(entries.length);
			}
			for (const [key, entryValue] of entries) {
				encode(key);
				encode(entryValue);
			}
			return;
		}
		throw new Error(`Cannot encode MessagePack value of type ${typeof item}`);
	};
	encode(value);
	return new Uint8Array(bytes);
}

function decodeMsgpack(data: Uint8Array): unknown {
	const decoder = new TextDecoder();
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	let offset = 0;
	const read = () => data[offset++];
	const readUint16 = () => {
		const value = view.getUint16(offset, false);
		offset += 2;
		return value;
	};
	const readUint32 = () => {
		const value = view.getUint32(offset, false);
		offset += 4;
		return value;
	};
	const readBytes = (length: number) => {
		const value = data.slice(offset, offset + length);
		offset += length;
		return value;
	};
	const decode = (): unknown => {
		const prefix = read();
		if (prefix <= 0x7f) return prefix;
		if (prefix >= 0x80 && prefix <= 0x8f) {
			const count = prefix & 0x0f;
			const object: Record<string, unknown> = {};
			for (let i = 0; i < count; i++) object[String(decode())] = decode();
			return object;
		}
		if (prefix >= 0x90 && prefix <= 0x9f) return Array.from({ length: prefix & 0x0f }, () => decode());
		if (prefix >= 0xa0 && prefix <= 0xbf) return decoder.decode(readBytes(prefix & 0x1f));
		switch (prefix) {
			case 0xc0:
				return null;
			case 0xc2:
				return false;
			case 0xc3:
				return true;
			case 0xc4:
				return readBytes(read());
			case 0xc5:
				return readBytes(readUint16());
			case 0xc6:
				return readBytes(readUint32());
			case 0xcc:
				return read();
			case 0xcd:
				return readUint16();
			case 0xce:
				return readUint32();
			case 0xcb: {
				const value = view.getFloat64(offset, false);
				offset += 8;
				return value;
			}
			case 0xd9:
				return decoder.decode(readBytes(read()));
			case 0xda:
				return decoder.decode(readBytes(readUint16()));
			case 0xdb:
				return decoder.decode(readBytes(readUint32()));
			case 0xdc:
				return Array.from({ length: readUint16() }, () => decode());
			case 0xdd:
				return Array.from({ length: readUint32() }, () => decode());
			case 0xde: {
				const count = readUint16();
				const object: Record<string, unknown> = {};
				for (let i = 0; i < count; i++) object[String(decode())] = decode();
				return object;
			}
			case 0xdf: {
				const count = readUint32();
				const object: Record<string, unknown> = {};
				for (let i = 0; i < count; i++) object[String(decode())] = decode();
				return object;
			}
			default:
				throw new Error(`Unsupported MessagePack prefix 0x${prefix.toString(16)}`);
		}
	};
	return decode();
}

function createWebSocketFrame(payload: Uint8Array, opcode = 0x2): Buffer {
	const mask = randomBytes(4);
	const length = payload.length;
	const headerLength = length < 126 ? 2 : length <= 0xffff ? 4 : 10;
	const frame = Buffer.alloc(headerLength + 4 + length);
	frame[0] = 0x80 | opcode;
	if (length < 126) {
		frame[1] = 0x80 | length;
	} else if (length <= 0xffff) {
		frame[1] = 0x80 | 126;
		frame.writeUInt16BE(length, 2);
	} else {
		frame[1] = 0x80 | 127;
		frame.writeBigUInt64BE(BigInt(length), 2);
	}
	const maskOffset = headerLength;
	mask.copy(frame, maskOffset);
	for (let i = 0; i < length; i++) frame[maskOffset + 4 + i] = payload[i] ^ mask[i % 4];
	return frame;
}

function createFishWebSocket(apiKey: string, model: string, onMessage: (payload: Uint8Array) => void, onClose: () => void, onError: (error: Error) => void): Promise<{ send: (value: unknown) => void; close: () => void }> {
	return new Promise((resolve, reject) => {
		const key = randomBytes(16).toString("base64");
		let buffer = Buffer.alloc(0);
		let handshakeDone = false;
		let settled = false;
		let fragmented: Buffer[] = [];
		const socket = connectTls({ host: "api.fish.audio", port: 443, servername: "api.fish.audio" });
		const fail = (error: Error) => {
			if (!settled) {
				settled = true;
				reject(error);
			} else {
				onError(error);
			}
			try {
				socket.destroy();
			} catch {}
		};
		const sendFrame = (payload: Uint8Array, opcode = 0x2) => socket.write(createWebSocketFrame(payload, opcode));
		const parseFrames = () => {
			while (buffer.length >= 2) {
				const first = buffer[0];
				const second = buffer[1];
				const fin = Boolean(first & 0x80);
				const opcode = first & 0x0f;
				const masked = Boolean(second & 0x80);
				let length = second & 0x7f;
				let offset = 2;
				if (length === 126) {
					if (buffer.length < 4) return;
					length = buffer.readUInt16BE(2);
					offset = 4;
				} else if (length === 127) {
					if (buffer.length < 10) return;
					length = Number(buffer.readBigUInt64BE(2));
					offset = 10;
				}
				const maskOffset = offset;
				if (masked) offset += 4;
				if (buffer.length < offset + length) return;
				let payload = buffer.subarray(offset, offset + length);
				if (masked) {
					const mask = buffer.subarray(maskOffset, maskOffset + 4);
					payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
				}
				buffer = buffer.subarray(offset + length);
				if (opcode === 0x8) {
					onClose();
					return;
				}
				if (opcode === 0x9) {
					sendFrame(payload, 0x0a);
					continue;
				}
				if (opcode === 0x2 || opcode === 0x0) {
					fragmented.push(Buffer.from(payload));
					if (fin) {
						onMessage(Buffer.concat(fragmented));
						fragmented = [];
					}
				}
			}
		};
		socket.once("secureConnect", () => {
			socket.write(
				[
					"GET /v1/tts/live HTTP/1.1",
					"Host: api.fish.audio",
					"Upgrade: websocket",
					"Connection: Upgrade",
					`Sec-WebSocket-Key: ${key}`,
					"Sec-WebSocket-Version: 13",
					`Authorization: Bearer ${apiKey}`,
					`model: ${model}`,
					"",
					"",
				].join("\r\n"),
			);
		});
		socket.on("data", (chunk) => {
			buffer = Buffer.concat([buffer, chunk]);
			if (!handshakeDone) {
				const headerEnd = buffer.indexOf("\r\n\r\n");
				if (headerEnd === -1) return;
				const headers = buffer.subarray(0, headerEnd).toString("utf-8");
				buffer = buffer.subarray(headerEnd + 4);
				if (!headers.startsWith("HTTP/1.1 101") && !headers.startsWith("HTTP/1.0 101")) {
					fail(new Error(`Fish Audio WebSocket handshake failed: ${headers.split("\r\n")[0]}`));
					return;
				}
				handshakeDone = true;
				settled = true;
				resolve({
					send: (value: unknown) => sendFrame(encodeMsgpack(value)),
					close: () => {
						try {
							sendFrame(new Uint8Array(), 0x8);
							socket.end();
						} catch {}
					},
				});
			}
			parseFrames();
		});
		socket.on("error", fail);
		socket.on("close", onClose);
	});
}

async function streamFishPcmToFfplay(text: string, settings: NotificationSettings): Promise<void> {
	const apiKey = getFishApiKey(settings);
	if (!apiKey) {
		throw new Error("Fish Audio API key is not configured. Set PI_NOTIFICATION_FISH_API_KEY/FISH_AUDIO_API_KEY or run /notification tts-key fish <key>.");
	}

	const player = spawn("ffplay", ["-nodisp", "-autoexit", "-loglevel", "error", "-f", "s16le", "-ar", String(FISH_STREAM_SAMPLE_RATE), "-ac", "1", "-i", "pipe:0"], {
		windowsHide: true,
		stdio: ["pipe", "ignore", "pipe"],
	});
	let playerError = "";
	player.stderr?.on("data", (chunk) => {
		playerError += String(chunk);
	});

	await new Promise<void>((resolve, reject) => {
		let settled = false;
		let finished = false;
		let ws: { send: (value: unknown) => void; close: () => void } | undefined;
		const settle = (error?: Error) => {
			if (settled) return;
			settled = true;
			try {
				ws?.close();
			} catch {}
			try {
				player.stdin?.end();
			} catch {}
			if (error) reject(error);
			else resolve();
		};
		player.once("error", (error) => settle(error));
		player.once("exit", (code) => {
			if (settled) return;
			if (code === 0 || finished) settle();
			else settle(new Error(`ffplay exited with code ${code}${playerError.trim() ? `: ${playerError.trim()}` : ""}`));
		});
		void createFishWebSocket(
			apiKey,
			settings.fish?.model ?? DEFAULT_FISH_MODEL,
			(payload) => {
				try {
					const decoded = decodeMsgpack(payload) as { event?: string; audio?: Uint8Array; reason?: string; message?: string };
					if (decoded.event === "audio" && decoded.audio) {
						player.stdin?.write(Buffer.from(decoded.audio));
					} else if (decoded.event === "finish") {
						finished = true;
						player.stdin?.end();
						if (decoded.reason === "error") settle(new Error(decoded.message || "Fish Audio streaming TTS failed."));
					}
				} catch (error) {
					settle(error instanceof Error ? error : new Error(String(error)));
				}
			},
			() => {
				if (!finished) settle(new Error("Fish Audio WebSocket closed before finish."));
			},
			(error) => settle(error),
		)
			.then((socket) => {
				ws = socket;
				ws.send({
					event: "start",
					request: {
						text: "",
						reference_id: settings.fish?.referenceId ?? DEFAULT_FISH_REFERENCE_ID,
						format: "pcm",
						sample_rate: FISH_STREAM_SAMPLE_RATE,
						temperature: 0.7,
						top_p: 0.7,
						chunk_length: 100,
						normalize: true,
						latency: "low",
						max_new_tokens: 1024,
						repetition_penalty: 1.2,
						min_chunk_length: 0,
						condition_on_previous_chunks: true,
						early_stop_threshold: 1,
					},
				});
				ws.send({ event: "text", text });
				ws.send({ event: "flush" });
				ws.send({ event: "stop" });
			})
			.catch((error) => settle(error instanceof Error ? error : new Error(String(error))));
	});
}

async function uploadVllmOmniVoice(settings: NotificationSettings): Promise<string> {
	const config = settings.vllmOmni ?? {};
	const audioPath = config.audioPath?.trim();
	if (!audioPath || !existsSync(audioPath)) {
		throw new Error(
			`vLLM-Omni: audio reference file not found at ${audioPath || "(not set)"}. Browse for it in the notification menu.`,
		);
	}

	const voiceName = deriveVoiceName(audioPath);
	const refText = readRefTextFromPath(config.refTextPath);
	const baseUrl = getVllmOmniBaseUrl(settings);

	const boundary = `----FormBoundary${randomBytes(16).toString("hex")}`;
	const CRLF = "\r\n";

	const readAudio = readFileSync(audioPath);
	const audioName = audioPath.split(/[/\\]/).pop() ?? "audio.wav";

	let body = Buffer.alloc(0);
	const appendField = (name: string, value: string) => {
		body = Buffer.concat([
			body,
			Buffer.from(`${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}`, "utf-8"),
		]);
	};

	appendField("name", voiceName);
	appendField("consent", "yes");
	if (refText) appendField("ref_text", refText);

	// Audio file part
	const fileHeader = `${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="audio_sample"; filename="${audioName}"${CRLF}Content-Type: audio/wav${CRLF}${CRLF}`;
	body = Buffer.concat([body, Buffer.from(fileHeader, "utf-8"), readAudio, Buffer.from(`${CRLF}--${boundary}--${CRLF}`, "utf-8")]);

	const response = await fetch(joinUrl(baseUrl, "v1/audio/voices"), {
		method: "POST",
		headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
		body: body,
	});
	await ensureOk(response);

	const data = (await response.json()) as { voice?: { name?: string }; name?: string; error?: string };
	if (data.error) throw new Error(`vLLM-Omni voice upload error: ${data.error}`);
	return data.voice?.name ?? data.name ?? voiceName;
}

function createVllmOmniWebSocket(
	wsUrl: string,
	onBinary: (data: Uint8Array) => void,
	onClose: () => void,
	onError: (error: Error) => void,
): Promise<{ send: (json: string) => void; close: () => void }> {
	const parsedUrl = new URL(wsUrl);
	const host = parsedUrl.hostname;
	const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 80;
	const path = parsedUrl.pathname || "/";

	return new Promise((resolve, reject) => {
		const key = randomBytes(16).toString("base64");
		let buffer = Buffer.alloc(0);
		let handshakeDone = false;
		let settled = false;
		let fragmented: Buffer[] = [];
		let timeout: NodeJS.Timeout | undefined;

		const socket = connectNet({ host, port });

		const fail = (error: Error) => {
			if (timeout) clearTimeout(timeout);
			if (!settled) { settled = true; reject(error); }
			else onError(error);
			try { socket.destroy(); } catch {}
		};

		const sendFrame = (payload: Uint8Array, opcode = 0x2) => {
			const frame = createWebSocketFrame(payload, opcode);
			socket.write(frame);
		};

		const parseFrames = () => {
			while (buffer.length >= 2) {
				const first = buffer[0];
				const second = buffer[1];
				const fin = Boolean(first & 0x80);
				const opcode = first & 0x0f;
				const masked = Boolean(second & 0x80);
				let length = second & 0x7f;
				let offset = 2;
				if (length === 126) {
					if (buffer.length < 4) return;
					length = buffer.readUInt16BE(2);
					offset = 4;
				} else if (length === 127) {
					if (buffer.length < 10) return;
					length = Number(buffer.readBigUInt64BE(2));
					offset = 10;
				}
				if (masked) offset += 4;
				if (buffer.length < offset + length) return;
				const payload = buffer.subarray(offset, offset + length);
				buffer = buffer.subarray(offset + length);
				if (opcode === 0x8) { onClose(); return; }
				if (opcode === 0x9) { sendFrame(payload, 0x0a); continue; }
				if (opcode === 0x1 || opcode === 0x2 || opcode === 0x0) {
					fragmented.push(Buffer.from(payload));
					if (fin) {
						const combined = Buffer.concat(fragmented);
						fragmented = [];
						if (opcode === 0x1) {
							// JSON text frame — pass to caller
							onBinary(combined); // reuse onBinary for dispatch
						} else {
							onBinary(combined);
						}
					}
				}
			}
		};

		timeout = setTimeout(() => fail(new Error("vLLM-Omni WebSocket connection timed out (30s)")), 30_000);

		socket.on("connect", () => {
			socket.write(
				[
					`GET ${path} HTTP/1.1`,
					`Host: ${host}:${port}`,
					"Upgrade: websocket",
					"Connection: Upgrade",
					`Sec-WebSocket-Key: ${key}`,
					"Sec-WebSocket-Version: 13",
					"",
					"",
				].join("\r\n"),
			);
		});

		socket.on("data", (chunk) => {
			buffer = Buffer.concat([buffer, chunk]);
			if (!handshakeDone) {
				const headerEnd = buffer.indexOf("\r\n\r\n");
				if (headerEnd === -1) return;
				const headers = buffer.subarray(0, headerEnd).toString("utf-8");
				buffer = buffer.subarray(headerEnd + 4);
				if (!headers.startsWith("HTTP/1.1 101") && !headers.startsWith("HTTP/1.0 101")) {
					fail(new Error(`vLLM-Omni WebSocket handshake failed: ${headers.split("\r\n")[0]}`));
					return;
				}
				handshakeDone = true;
				if (timeout) clearTimeout(timeout);
				settled = true;
				resolve({
					send: (json: string) => sendFrame(new TextEncoder().encode(json), 0x1),
					close: () => {
						try { sendFrame(new Uint8Array(), 0x8); socket.end(); } catch {}
					},
				});
			}
			parseFrames();
		});

		socket.on("error", fail);
		socket.on("close", () => { if (timeout) clearTimeout(timeout); onClose(); });
	});
}

async function streamVllmOmniPcmToFfplay(text: string, settings: NotificationSettings): Promise<void> {
	const config = settings.vllmOmni ?? {};
	const baseUrl = getVllmOmniBaseUrl(settings);
	const refText = readRefTextFromPath(config.refTextPath);
	const maxNewTokens = config.maxNewTokens ?? DEFAULT_VLLM_OMNI_MAX_NEW_TOKENS;

	const wsHost = baseUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
	const wsUrl = `ws://${wsHost}/v1/audio/speech/stream`;

	// Upload voice reference
	const resolvedVoice = await uploadVllmOmniVoice(settings);

	const player = spawn("ffplay", [
		"-nodisp", "-autoexit", "-loglevel", "error",
		"-f", "s16le",
		"-ar", String(VLLM_OMNI_SAMPLE_RATE),
		"-ac", "1",
		"-i", "pipe:0",
	], {
		windowsHide: true,
		stdio: ["pipe", "ignore", "pipe"],
	});
	let playerError = "";
	player.stderr?.on("data", (chunk) => { playerError += String(chunk); });

	await new Promise<void>((resolve, reject) => {
		let settled = false;
		let finished = false;
		let ws: { send: (json: string) => void; close: () => void } | undefined;

		const settle = (error?: Error) => {
			if (settled) return;
			settled = true;
			try { ws?.close(); } catch {}
			try { player.stdin?.end(); } catch {}
			if (error) reject(error);
			else resolve();
		};

		player.once("error", (error) => settle(error));
		player.once("exit", (code) => {
			if (settled) return;
			if (code === 0 || finished) settle();
			else settle(new Error(`ffplay exited with code ${code}${playerError.trim() ? `: ${playerError.trim()}` : ""}`));
		});

		void createVllmOmniWebSocket(
			wsUrl,
			(raw) => {
				try {
					// Try parsing as JSON to detect control messages
					let isJson = false;
					let event: Record<string, unknown> | undefined;
					try {
						const str = new TextDecoder().decode(raw);
						event = JSON.parse(str);
						isJson = true;
					} catch {}

					if (isJson && event) {
						const etype = String(event.type);
						if (etype === "session.done") {
							finished = true;
							player.stdin?.end();
						} else if (etype === "error") {
							settle(new Error(`vLLM-Omni server error: ${event.message ?? String(event)}`));
						}
					} else {
						// Binary audio frame — pipe to ffplay
						player.stdin?.write(Buffer.from(raw));
					}
				} catch (error) {
					settle(error instanceof Error ? error : new Error(String(error)));
				}
			},
			() => {
				if (!finished) settle(new Error("vLLM-Omni WebSocket closed before session.done."));
			},
			(error) => settle(error),
		).then((socket) => {
			ws = socket;
			// 1. session.config (must be first)
			ws.send(JSON.stringify({
				type: "session.config",
				voice: resolvedVoice,
				ref_text: refText,
				response_format: "pcm",
				stream_audio: true,
				max_new_tokens: maxNewTokens,
			}));
			// 2. input.text
			ws.send(JSON.stringify({ type: "input.text", text }));
			// 3. input.done
			ws.send(JSON.stringify({ type: "input.done" }));
		}).catch((error) => settle(error instanceof Error ? error : new Error(String(error))));
	});
}

function createWavHeader(sampleRate: number, numSamples: number): Uint8Array {
	const dataSize = numSamples * 2; // 16-bit mono
	const fileSize = 36 + dataSize;
	const header = new Uint8Array(44);
	const view = new DataView(header.buffer);
	// RIFF header
	header[0] = 0x52; header[1] = 0x49; header[2] = 0x46; header[3] = 0x46; // "RIFF"
	view.setUint32(4, fileSize, false); // big-endian file size
	header[8] = 0x57; header[9] = 0x41; header[10] = 0x56; header[11] = 0x45; // "WAVE"
	// fmt chunk
	header[12] = 0x66; header[13] = 0x6d; header[14] = 0x74; header[15] = 0x20; // "fmt "
	view.setUint32(16, 16, true); // chunk size
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true); // byte rate
	view.setUint16(32, 2, true); // block align
	view.setUint16(34, 16, true); // bits per sample
	// data chunk
	header[36] = 0x64; header[37] = 0x61; header[38] = 0x74; header[39] = 0x61; // "data"
	view.setUint32(40, dataSize, true);
	return header;
}

async function synthesizeVllmOmniWav(text: string, settings: NotificationSettings): Promise<Uint8Array> {
	const config = settings.vllmOmni ?? {};
	const baseUrl = getVllmOmniBaseUrl(settings);
	const refText = readRefTextFromPath(config.refTextPath);
	const maxNewTokens = config.maxNewTokens ?? DEFAULT_VLLM_OMNI_MAX_NEW_TOKENS;

	const wsHost = baseUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
	const wsUrl = `ws://${wsHost}/v1/audio/speech/stream`;

	// Upload voice reference
	const resolvedVoice = await uploadVllmOmniVoice(settings);

	const pcmChunks: Buffer[] = [];

	await new Promise<void>((resolve, reject) => {
		let settled = false;
		let ws: { send: (json: string) => void; close: () => void } | undefined;

		const settle = (error?: Error) => {
			if (settled) return;
			settled = true;
			try { ws?.close(); } catch {}
			if (error) reject(error);
			else resolve();
		};

		void createVllmOmniWebSocket(
			wsUrl,
			(raw) => {
				try {
					let isJson = false;
					let event: Record<string, unknown> | undefined;
					try {
						const str = new TextDecoder().decode(raw);
						event = JSON.parse(str);
						isJson = true;
					} catch {}

					if (isJson && event) {
						const etype = String(event.type);
						if (etype === "session.done") {
							settle();
						} else if (etype === "error") {
							settle(new Error(`vLLM-Omni server error: ${event.message ?? String(event)}`));
						}
					} else {
						pcmChunks.push(Buffer.from(raw));
					}
				} catch (error) {
					settle(error instanceof Error ? error : new Error(String(error)));
				}
			},
			() => {
				if (pcmChunks.length === 0) settle(new Error("vLLM-Omni WebSocket closed with no audio data."));
				else settle();
			},
			(error) => settle(error),
		).then((socket) => {
			ws = socket;
			ws.send(JSON.stringify({
				type: "session.config",
				voice: resolvedVoice,
				ref_text: refText,
				response_format: "pcm",
				stream_audio: true,
				max_new_tokens: maxNewTokens,
			}));
			ws.send(JSON.stringify({ type: "input.text", text }));
			ws.send(JSON.stringify({ type: "input.done" }));
		}).catch((error) => settle(error instanceof Error ? error : new Error(String(error))));
	});

	const pcmData = Buffer.concat(pcmChunks);
	const numSamples = pcmData.length / 2;
	const header = createWavHeader(VLLM_OMNI_SAMPLE_RATE, numSamples);
	return new Uint8Array(Buffer.concat([header, pcmData]));
}

function joinUrl(baseUrl: string, path: string): string {
	return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function synthesizeOpenAiCompatibleWav(text: string, settings: NotificationSettings): Promise<Uint8Array> {
	const config = settings.openAiCompatible ?? {};
	const apiKey = getOpenAiCompatibleApiKey(settings);
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

	const response = await fetch(joinUrl(config.baseUrl ?? DEFAULT_OPENAI_COMPATIBLE_BASE_URL, "audio/speech"), {
		method: "POST",
		headers,
		body: JSON.stringify({
			model: config.model ?? DEFAULT_OPENAI_COMPATIBLE_MODEL,
			voice: config.voice ?? DEFAULT_OPENAI_COMPATIBLE_VOICE,
			input: text,
			response_format: "wav",
		}),
	});
	await ensureOk(response);
	return new Uint8Array(await response.arrayBuffer());
}

async function speakText(text: string, settings: NotificationSettings): Promise<void> {
	const cleaned = text.trim();
	if (!cleaned) return;

	if (settings.ttsEngine === "windows-native") {
		if (process.platform !== "win32") {
			throw new Error("Windows Native TTS is only available on Windows.");
		}
		await runPowerShell(`Add-Type -AssemblyName System.Speech;
$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer;
$speak.Speak('${escapePowerShellSingleQuoted(cleaned)}');`);
		return;
	}

	if (settings.ttsEngine === "vllm-omni") {
		await streamVllmOmniPcmToFfplay(cleaned, settings);
		return;
	}

	if (settings.ttsEngine !== "openai-compatible") {
		await streamFishPcmToFfplay(cleaned, settings);
		return;
	}

	const bytes = await synthesizeOpenAiCompatibleWav(cleaned, settings);
	const path = writeTempWav(bytes);
	try {
		await playTtsWav(path);
	} finally {
		deleteFileBestEffort(path);
	}
}

async function synthesizeDiagnosticWav(text: string, settings: NotificationSettings): Promise<{ path: string; bytes: number }> {
	const cleaned = text.trim();
	if (!cleaned) throw new Error("No TTS text provided.");
	let audioBytes: Uint8Array;
	if (settings.ttsEngine === "openai-compatible") {
		audioBytes = await synthesizeOpenAiCompatibleWav(cleaned, settings);
	} else if (settings.ttsEngine === "vllm-omni") {
		audioBytes = await synthesizeVllmOmniWav(cleaned, settings);
	} else {
		audioBytes = await synthesizeFishWav(cleaned, settings);
	}
	const path = writeTempWav(audioBytes);
	return { path, bytes: audioBytes.length };
}

function stripMarkdownForSpeech(markdown: string): string {
	let text = markdown
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/~~~[\s\S]*?~~~/g, " ")
		.replace(/`([^`]*)`/g, "$1")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/^\s{0,3}#{1,6}\s+/gm, "")
		.replace(/^\s{0,3}>\s?/gm, "")
		.replace(/^\s*[-*+]\s+/gm, "")
		.replace(/^\s*\d+[.)]\s+/gm, "")
		.replace(/[\\*_~>#|]/g, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	// Avoid reading common code-ish leftovers as one long token.
	text = text.replace(/\b[a-zA-Z]:\\\S+/g, " ").replace(/\s+/g, " ").trim();
	return text;
}

function getAssistantText(message: unknown): string {
	const content = (message as { content?: unknown }).content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((part): part is { type: string; text: string } => {
			return Boolean(part && typeof part === "object" && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string");
		})
		.map((part) => part.text)
		.join("\n");
}

function hasToolCall(message: unknown): boolean {
	const content = (message as { content?: unknown }).content;
	return Array.isArray(content) && content.some((part) => part && typeof part === "object" && (part as { type?: unknown }).type === "toolCall");
}

function updateStatus(ctx: ExtensionContext, mode: NotificationMode): void {
	if (!ctx.hasUI) return;
	ctx.ui.setStatus(STATUS_KEY, mode === "off" ? undefined : `notify:${mode}`);
}

function maskConfigured(value: string | undefined): string {
	return value ? "configured" : "not configured";
}

function getStatus(settings: NotificationSettings): string {
	return [
		`Notification mode: ${settings.mode ?? "off"}`,
		`TTS engine: ${settings.ttsEngine ?? "fish"}`,
		`Fish API key: ${maskConfigured(getFishApiKey(settings))}`,
		`Fish reference_id: ${settings.fish?.referenceId ?? DEFAULT_FISH_REFERENCE_ID}`,
		`OpenAI-compatible API key: ${maskConfigured(getOpenAiCompatibleApiKey(settings))}`,
		`OpenAI-compatible base URL: ${settings.openAiCompatible?.baseUrl ?? DEFAULT_OPENAI_COMPATIBLE_BASE_URL}`,
		`OpenAI-compatible model: ${settings.openAiCompatible?.model ?? DEFAULT_OPENAI_COMPATIBLE_MODEL}`,
		`OpenAI-compatible voice: ${settings.openAiCompatible?.voice ?? DEFAULT_OPENAI_COMPATIBLE_VOICE}`,
		`vLLM-Omni base URL: ${settings.vllmOmni?.baseUrl ?? DEFAULT_VLLM_OMNI_BASE_URL}`,
		`vLLM-Omni audio: ${settings.vllmOmni?.audioPath ?? "not set"}`,
		`vLLM-Omni transcript: ${settings.vllmOmni?.refTextPath ?? "not set"}`,
		`vLLM-Omni voice cached: ${settings.vllmOmni?.voiceCached ? "yes" : "no"}`,
	].join("\n");
}

class TtsQueue {
	private queue: string[] = [];
	private running = false;
	private ctx: ExtensionContext | undefined;
	private getSettings: () => NotificationSettings;
	private events: any = null;

	constructor(getSettings: () => NotificationSettings) {
		this.getSettings = getSettings;
	}

	setContext(ctx: ExtensionContext): void {
		this.ctx = ctx;
	}

	setEvents(events: any): void {
		this.events = events;
	}

	enqueue(text: string): void {
		const cleaned = stripMarkdownForSpeech(text);
		if (!cleaned) return;

		// Signal emote to enter talk state synchronously, before agent_end fires.
		this.events?.emit("tts:start");

		// Send the final response as one synthesis request. Sentence-by-sentence
		// API calls caused audible gaps between sentences and made Fish output
		// sound choppy. We still keep a playback queue so multiple responses/tests
		// serialize cleanly, but each response is synthesized continuously.
		this.queue.push(cleaned);
		void this.drain();
	}

	clear(): void {
		this.queue = [];
	}

	private async drain(): Promise<void> {
		if (this.running) return;
		this.running = true;
		try {
			while (this.queue.length > 0) {
				const next = this.queue.shift();
				if (!next) continue;
				try {
					await speakText(next, this.getSettings());
				} catch (error) {
					notifyFailure(this.ctx, `TTS notification failed: ${formatError(error)}`);
				}
			}
			// All items done — signal emote to stop talking.
			this.events?.emit("tts:end");
		} finally {
			this.running = false;
			if (this.queue.length > 0) void this.drain();
		}
	}
}

export default function notificationExtension(pi: ExtensionAPI) {
	let settings = loadSettings();
	let mode = settings.mode ?? "off";
	let currentAgentIsInteractive = false;
	let nextAgentIsInteractive = false;
	const tts = new TtsQueue(() => settings);
	tts.setEvents(pi.events);

	pi.registerFlag("notification", {
		description: "Notification mode: off, beep, tts, or both",
		type: "string",
	});

	function persistSettings(ctx?: ExtensionContext): void {
		settings = normalizeSettings(settings);
		mode = settings.mode ?? "off";
		try {
			saveSettings(settings);
		} catch (error) {
			notifyFailure(ctx, `Failed to save notification setting: ${formatError(error)}`);
		}
		if (ctx) updateStatus(ctx, mode);
	}

	function setMode(nextMode: NotificationMode, ctx?: ExtensionContext): void {
		settings.mode = nextMode;
		persistSettings(ctx);
		pi.events.emit("tts:mode", { mode: nextMode });
	}

	pi.on("input", async (event) => {
		nextAgentIsInteractive = event.source === "interactive";
	});

	pi.on("agent_start", async (_event, ctx) => {
		currentAgentIsInteractive = nextAgentIsInteractive && ctx.hasUI;
		nextAgentIsInteractive = false;
		tts.setContext(ctx);
		tts.setEvents(pi.events);
	});

	pi.on("message_end", async (event, ctx) => {
		if (!currentAgentIsInteractive) return;
		if (mode === "off") return;
		if (event.message.role !== "assistant") return;
		if (hasToolCall(event.message)) return;

		const stopReason = (event.message as { stopReason?: string }).stopReason;
		if (stopReason !== "stop" && stopReason !== "length") return;

		// Beep and TTS both fire at the end of the final narrative response.
		// This avoids the beep playing mid-stream before the model is done.
		if (mode === "beep" || mode === "both") {
			try {
				await playBeep();
			} catch (error) {
				notifyFailure(ctx, `Beep notification failed: ${formatError(error)}`);
			}
		}

		if (mode === "tts" || mode === "both") {
			tts.setContext(ctx);
			tts.enqueue(getAssistantText(event.message));
		}
	});

	pi.on("agent_end", async () => {
		currentAgentIsInteractive = false;
	});

	pi.on("session_shutdown", async () => {
		tts.clear();
	});

	pi.on("session_start", async (_event, ctx) => {
		const flag = pi.getFlag("notification");
		if (typeof flag === "string" && flag.trim()) {
			const normalized = flag.trim().toLowerCase();
			if (isNotificationMode(normalized)) {
				setMode(normalized, ctx);
			} else {
				ctx.ui.notify(`Unknown notification mode "${flag}". Use: ${MODES.join(", ")}`, "warning");
			}
		}
		updateStatus(ctx, mode);
		// Broadcast TTS mode so emote can adapt.
		pi.events.emit("tts:mode", { mode });
	});

	// ── Menu tree factory ──────────────────────────────────────

	function buildMenuTree(): MenuItem[] {
		const currentMode = settings.mode ?? "off";
		const currentEngine = settings.ttsEngine ?? "fish";
		const fishRef = settings.fish?.referenceId ?? DEFAULT_FISH_REFERENCE_ID;
		const fishModel = settings.fish?.model ?? DEFAULT_FISH_MODEL;
		const oaUrl = settings.openAiCompatible?.baseUrl ?? DEFAULT_OPENAI_COMPATIBLE_BASE_URL;
		const oaModel = settings.openAiCompatible?.model ?? DEFAULT_OPENAI_COMPATIBLE_MODEL;
		const oaVoice = settings.openAiCompatible?.voice ?? DEFAULT_OPENAI_COMPATIBLE_VOICE;

		return [
			{
				type: "submenu",
				id: "mode",
				label: "Mode",
				children: () =>
					MODES.map((m) => ({
						type: "action" as const,
						id: `mode:${m}`,
						label: m === currentMode ? `▸ ${m} (current)` : m,
					})),
			},
			{
				type: "submenu",
				id: "engine",
				label: "Engine",
				children: () => [
					{
						type: "submenu",
						id: "engine:fish",
						label: currentEngine === "fish" ? "▸ fish (current)" : "fish",
						children: () => [
							{ type: "action", id: "engine-set:fish", label: "Select fish" },
							{ type: "input", id: "fish:set-key", label: "Set API key", prompt: "Fish Audio API key:", isSecret: true, currentValue: getFishApiKey(settings) ? "••••••••" : "not set" },
							{ type: "action", id: "fish:clear-key", label: "Clear API key" },
							{ type: "input", id: "fish:set-reference", label: "Set reference ID", prompt: "Fish Audio reference_id:", currentValue: fishRef },
							{ type: "input", id: "fish:set-model", label: "Set model", prompt: "Fish Audio model:", currentValue: fishModel },
						],
					},
					{
						type: "submenu",
						id: "engine:openai",
						label: currentEngine === "openai-compatible" ? "▸ openai-compatible (current)" : "openai-compatible",
						children: () => [
							{ type: "action", id: "engine-set:openai-compatible", label: "Select openai-compatible" },
							{ type: "input", id: "openai:set-key", label: "Set API key", prompt: "OpenAI-compatible API key:", isSecret: true, currentValue: getOpenAiCompatibleApiKey(settings) ? "••••••••" : "not set" },
							{ type: "action", id: "openai:clear-key", label: "Clear API key" },
							{ type: "input", id: "openai:set-url", label: "Set base URL", prompt: "OpenAI-compatible base URL:", currentValue: oaUrl },
							{ type: "input", id: "openai:set-model", label: "Set model", prompt: "OpenAI-compatible model:", currentValue: oaModel },
							{ type: "input", id: "openai:set-voice", label: "Set voice", prompt: "OpenAI-compatible voice:", currentValue: oaVoice },
						],
					},
					{
						type: "submenu",
						id: "engine:windows",
						label: currentEngine === "windows-native" ? "▸ windows-native (current)" : "windows-native",
						children: () => [
							{ type: "action", id: "engine-set:windows-native", label: "Select windows-native" },
						],
					},
					{
						type: "submenu",
						id: "engine:vllm",
						label: currentEngine === "vllm-omni" ? "▸ vllm-omni (current)" : "vllm-omni",
						children: () => {
							const vllmAudio = settings.vllmOmni?.audioPath;
							const vllmRefTextPath = settings.vllmOmni?.refTextPath;
							const vllmCached = settings.vllmOmni?.voiceCached;
							const vllmAudioLabel = vllmAudio ? vllmAudio.split(/[/\\]/).pop() : "not set";
							const vllmRefLabel = vllmRefTextPath ? vllmRefTextPath.split(/[/\\]/).pop() : "not set";
							return [
								{ type: "action", id: "engine-set:vllm-omni", label: "Select vllm-omni" },
								{ type: "action", id: "vllm:browse-audio", label: `Browse audio (.wav)  (${vllmAudioLabel})` },
								{ type: "action", id: "vllm:browse-reftext", label: `Browse transcript (.txt)  (${vllmRefLabel})` },
								{ type: "action", id: "vllm:test-connection", label: "Test server connection" },
								{ type: "action", id: "vllm:upload-voice", label: vllmCached ? "Re-upload voice to server" : "Upload & cache voice on server" },
								{ type: "action", id: "vllm:test-tts", label: "Test TTS playback" },
							];
						},
					},
				],
			},
			{
				type: "submenu",
				id: "debug",
				label: "Debug",
				children: () => [
					{ type: "action", id: "debug:test-beep", label: "Test beep" },
					{ type: "action", id: "debug:test-tts", label: "Test TTS" },
				],
			},
			{ type: "action", id: "status", label: "Status" },
		];
	}

	// ── Menu action handler ────────────────────────────────────

	async function handleMenuAction(id: string, value?: string): Promise<void> {
		const ctx = getCurrentCtx();

		// Mode
		if (id.startsWith("mode:")) {
			const m = id.slice(5) as NotificationMode;
			setMode(m, ctx);
			if (ctx) ctx.ui.notify(`Mode set to ${m}`, "info");
			return;
		}

		// Engine selection
		if (id.startsWith("engine-set:")) {
			const e = id.slice(11);
			if (isTtsEngine(e)) {
				settings.ttsEngine = e;
				persistSettings(ctx);
				if (ctx) ctx.ui.notify(`Engine set to ${e}`, "info");
			}
			return;
		}

		// Fish config
		if (id === "fish:set-key") {
			if (value && value !== "••••••••" && value !== "not set") {
				settings.fish = { ...settings.fish, apiKey: value };
				persistSettings(ctx);
				if (ctx) ctx.ui.notify("Fish Audio API key saved", "info");
			}
			return;
		}
		if (id === "fish:clear-key") {
			settings.fish = { ...settings.fish, apiKey: undefined };
			persistSettings(ctx);
			if (ctx) ctx.ui.notify("Fish Audio API key cleared", "info");
			return;
		}
		if (id === "fish:set-reference") {
			if (value) {
				settings.fish = { ...settings.fish, referenceId: value };
				persistSettings(ctx);
				if (ctx) ctx.ui.notify("Fish reference_id updated", "info");
			}
			return;
		}
		if (id === "fish:set-model") {
			if (value) {
				settings.fish = { ...settings.fish, model: value as "s2-pro" };
				persistSettings(ctx);
				if (ctx) ctx.ui.notify("Fish model updated", "info");
			}
			return;
		}

		// OpenAI-compatible config
		if (id === "openai:set-key") {
			if (value && value !== "••••••••" && value !== "not set") {
				settings.openAiCompatible = { ...settings.openAiCompatible, apiKey: value };
				persistSettings(ctx);
				if (ctx) ctx.ui.notify("OpenAI-compatible API key saved", "info");
			}
			return;
		}
		if (id === "openai:clear-key") {
			settings.openAiCompatible = { ...settings.openAiCompatible, apiKey: undefined };
			persistSettings(ctx);
			if (ctx) ctx.ui.notify("OpenAI-compatible API key cleared", "info");
			return;
		}
		if (id === "openai:set-url") {
			if (value) {
				settings.openAiCompatible = { ...settings.openAiCompatible, baseUrl: value };
				persistSettings(ctx);
				if (ctx) ctx.ui.notify("OpenAI-compatible base URL updated", "info");
			}
			return;
		}
		if (id === "openai:set-model") {
			if (value) {
				settings.openAiCompatible = { ...settings.openAiCompatible, model: value };
				persistSettings(ctx);
				if (ctx) ctx.ui.notify("OpenAI-compatible model updated", "info");
			}
			return;
		}
		if (id === "openai:set-voice") {
			if (value) {
				settings.openAiCompatible = { ...settings.openAiCompatible, voice: value };
				persistSettings(ctx);
				if (ctx) ctx.ui.notify("OpenAI-compatible voice updated", "info");
			}
			return;
		}

		// vLLM-Omni config
		if (id === "vllm:browse-audio") {
			if (process.platform !== "win32") {
				if (ctx) ctx.ui.notify("File browser requires Windows. Paste the path manually.", "warning");
				return;
			}
			const result = await new Promise<string | null>((resolve) => {
				execFile("powershell.exe", [
					"-NoProfile", "-NonInteractive", "-Command",
					`[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null;
$dlg = New-Object System.Windows.Forms.OpenFileDialog;
$dlg.Filter = 'Wave files (*.wav)|*.wav|All files (*.*)|*.*';
$dlg.Title = 'Select reference audio file';
$result = $dlg.ShowDialog();
if ($result -eq 'OK') { echo $dlg.FileName; } else { echo '' };`,
				], { windowsHide: true }, (error, stdout, stderr) => {
					if (error) {
						if (ctx) ctx.ui.notify(`File browser error: ${stderr.trim() || error.message}`, "error");
						resolve(null);
					} else {
						resolve(stdout.trim() || null);
					}
				});
			});
			if (result) {
				settings.vllmOmni = { ...settings.vllmOmni, audioPath: result };
				persistSettings(ctx);
				if (ctx) ctx.ui.notify(`Audio reference set: ${result.split(/[/\\]/).pop()}`, "info");
			}
			return;
		}
		if (id === "vllm:browse-reftext") {
			if (process.platform !== "win32") {
				if (ctx) ctx.ui.notify("File browser requires Windows. Paste the path manually.", "warning");
				return;
			}
			const result = await new Promise<string | null>((resolve) => {
				execFile("powershell.exe", [
					"-NoProfile", "-NonInteractive", "-Command",
					`[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null;
$dlg = New-Object System.Windows.Forms.OpenFileDialog;
$dlg.Filter = 'Text files (*.txt)|*.txt|All files (*.*)|*.*';
$dlg.Title = 'Select transcript file';
$result = $dlg.ShowDialog();
if ($result -eq 'OK') { echo $dlg.FileName; } else { echo '' };`,
				], { windowsHide: true }, (error, stdout, stderr) => {
					if (error) {
						if (ctx) ctx.ui.notify(`File browser error: ${stderr.trim() || error.message}`, "error");
						resolve(null);
					} else {
						resolve(stdout.trim() || null);
					}
				});
			});
			if (result) {
				settings.vllmOmni = { ...settings.vllmOmni, refTextPath: result };
				persistSettings(ctx);
				if (ctx) ctx.ui.notify(`Transcript set: ${result.split(/[/\\]/).pop()}`, "info");
			}
			return;
		}
		if (id === "vllm:test-connection") {
			const baseUrl = getVllmOmniBaseUrl(settings);
			try {
				if (ctx) ctx.ui.notify(`Pinging ${baseUrl}/health...`, "info");
				const res = await fetch(joinUrl(baseUrl, "health"), { signal: AbortSignal.timeout(5000) });
				if (res.ok) {
					if (ctx) ctx.ui.notify(`Server is reachable at ${baseUrl}`, "info");
				} else {
					if (ctx) ctx.ui.notify(`Server responded with status ${res.status}`, "warning");
				}
			} catch (error) {
				notifyFailure(ctx, `Cannot reach server at ${baseUrl}: ${formatError(error)}`);
			}
			return;
		}
		if (id === "vllm:upload-voice") {
			if (!settings.vllmOmni?.audioPath || !existsSync(settings.vllmOmni.audioPath)) {
				if (ctx) ctx.ui.notify("Browse and select an audio file first.", "warning");
				return;
			}
			try {
				if (ctx) ctx.ui.notify("Uploading voice to server…", "info");
				const voice = await uploadVllmOmniVoice(settings);
				settings.vllmOmni = { ...settings.vllmOmni, voiceCached: true };
				persistSettings(ctx);
				if (ctx) ctx.ui.notify(`Voice "${voice}" uploaded and cached on server.`, "info");
			} catch (error) {
				notifyFailure(ctx, `Upload failed: ${formatError(error)}`);
			}
			return;
		}
		if (id === "vllm:test-tts") {
			if (!settings.vllmOmni?.audioPath || !existsSync(settings.vllmOmni.audioPath)) {
				if (ctx) ctx.ui.notify("Browse and select an audio file, then upload voice first.", "warning");
				return;
			}
			const text = "This is a test of the vLLM Omni TTS engine.";
			try {
				if (ctx) ctx.ui.notify("Starting vLLM-Omni TTS test…", "info");
				await streamVllmOmniPcmToFfplay(text, settings);
				if (ctx) ctx.ui.notify("TTS test completed.", "info");
			} catch (error) {
				notifyFailure(ctx, `TTS test failed: ${formatError(error)}`);
			}
			return;
		}

		// Debug
		if (id === "debug:test-beep") {
			try {
				await playBeep();
				if (ctx) ctx.ui.notify("Beep test completed", "info");
			} catch (error) {
				notifyFailure(ctx, `Beep test failed: ${formatError(error)}`);
			}
			return;
		}
		if (id === "debug:test-tts") {
			const text = "This is a notification TTS test.";
			let diagnostic: { path: string; bytes: number } | undefined;
			try {
				if (ctx) ctx.ui.notify(`Testing ${settings.ttsEngine ?? "fish"} TTS...`, "info");
				if (settings.ttsEngine === "windows-native") {
					if (process.platform !== "win32") throw new Error("Windows Native TTS is only available on Windows.");
					await runPowerShell(`Add-Type -AssemblyName System.Speech;
$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer;
$speak.Speak('${escapePowerShellSingleQuoted(text)}');`);
				} else if (settings.ttsEngine === "openai-compatible") {
					diagnostic = await synthesizeDiagnosticWav(text, settings);
					if (ctx) ctx.ui.notify(`TTS WAV received: ${diagnostic.bytes} bytes. Playing...`, "info");
					await playTtsWav(diagnostic.path);
				} else if (settings.ttsEngine === "vllm-omni") {
					if (ctx) ctx.ui.notify("Connecting to vLLM-Omni WebSocket TTS...", "info");
					diagnostic = await synthesizeDiagnosticWav(text, settings);
					if (ctx) ctx.ui.notify(`TTS WAV received: ${diagnostic.bytes} bytes. Playing...`, "info");
					await playTtsWav(diagnostic.path);
				} else {
					if (ctx) ctx.ui.notify("Opening Fish Audio streaming TTS WebSocket...", "info");
					await streamFishPcmToFfplay(text, settings);
				}
				if (ctx) ctx.ui.notify("TTS test completed", "info");
			} catch (error) {
				notifyFailure(ctx, `TTS test failed: ${formatError(error)}`);
			} finally {
				if (diagnostic) deleteFileBestEffort(diagnostic.path);
			}
			return;
		}

		// Status
		if (id === "status") {
			if (ctx) ctx.ui.notify(getStatus(settings), "info");
			updateStatus(ctx, mode);
			return;
		}
	}

	// ── Command registration ───────────────────────────────────

	let currentCtx: ExtensionCommandContext | undefined;

	function getCurrentCtx(): ExtensionCommandContext | undefined {
		return currentCtx;
	}

	pi.registerCommand("notification", {
		description: "Configure response notifications and TTS engines (interactive menu)",
		handler: async (_args, ctx) => {
			currentCtx = ctx;
			await openMenu(ctx, "Notification", buildMenuTree, handleMenuAction);
			currentCtx = undefined;
		},
	});
}
