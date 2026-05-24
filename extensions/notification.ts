import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

type NotificationMode = "off" | "beep" | "tts" | "both";

type NotificationSettings = {
	mode?: NotificationMode;
};

const MODES = ["off", "beep", "tts", "both"] as const;
const SETTINGS_PATH = join(getAgentDir(), "notification.json");
const BEEP_PATH = join(__dirname, "notification", "beep.wav");
const STATUS_KEY = "notification";

function isNotificationMode(value: string): value is NotificationMode {
	return (MODES as readonly string[]).includes(value);
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

function loadMode(): NotificationMode {
	if (!existsSync(SETTINGS_PATH)) return "off";
	try {
		const data = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8")) as NotificationSettings;
		return data.mode && isNotificationMode(data.mode) ? data.mode : "off";
	} catch (error) {
		console.error(`[notification] Failed to read ${SETTINGS_PATH}: ${formatError(error)}`);
		return "off";
	}
}

function saveMode(mode: NotificationMode): void {
	mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
	writeFileSync(SETTINGS_PATH, `${JSON.stringify({ mode }, null, 2)}\n`, "utf-8");
}

function escapePowerShellSingleQuoted(value: string): string {
	return value.replace(/'/g, "''");
}

function runPowerShell(script: string, env?: NodeJS.ProcessEnv): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile(
			"powershell.exe",
			["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
			{ windowsHide: true, env: env ? { ...process.env, ...env } : process.env },
			(error, _stdout, stderr) => {
				if (error) {
					const detail = stderr?.trim();
					reject(new Error(detail ? `${error.message}: ${detail}` : error.message));
					return;
				}
				resolve();
			},
		);
	});
}

async function playBeep(): Promise<void> {
	if (process.platform === "win32") {
		const path = escapePowerShellSingleQuoted(BEEP_PATH);
		await runPowerShell(`$player = New-Object System.Media.SoundPlayer '${path}'; $player.PlaySync()`);
		return;
	}

	await new Promise<void>((resolve, reject) => {
		const player = process.platform === "darwin" ? "afplay" : "paplay";
		execFile(player, [BEEP_PATH], (error) => {
			if (error) reject(error);
			else resolve();
		});
	});
}

async function speakText(text: string): Promise<void> {
	const cleaned = text.trim();
	if (!cleaned) return;

	if (process.platform !== "win32") {
		throw new Error("TTS notification currently uses Windows System.Speech and requires Windows.");
	}

	await runPowerShell(
		"Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.Speak($env:PI_NOTIFICATION_TTS_TEXT); $synth.Dispose()",
		{ PI_NOTIFICATION_TTS_TEXT: cleaned },
	);
}

function stripMarkdownForSpeech(markdown: string): string {
	let text = markdown
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/~~~[\s\S]*?~~~/g, " ")
		.replace(/`[^`]*`/g, " ")
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

function splitIntoSentenceChunks(text: string): string[] {
	const chunks: string[] = [];
	const pattern = /[^.!?\n]+(?:[.!?]+|\n+|$)/g;
	for (const match of text.matchAll(pattern)) {
		const chunk = match[0].trim();
		if (chunk) chunks.push(chunk);
	}
	return chunks;
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

class TtsQueue {
	private queue: string[] = [];
	private running = false;
	private ctx: ExtensionContext | undefined;

	setContext(ctx: ExtensionContext): void {
		this.ctx = ctx;
	}

	enqueue(text: string): void {
		const cleaned = stripMarkdownForSpeech(text);
		for (const chunk of splitIntoSentenceChunks(cleaned)) {
			this.queue.push(chunk);
		}
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
					await speakText(next);
				} catch (error) {
					notifyFailure(this.ctx, `TTS notification failed: ${formatError(error)}`);
				}
			}
		} finally {
			this.running = false;
			if (this.queue.length > 0) void this.drain();
		}
	}
}

export default function notificationExtension(pi: ExtensionAPI) {
	let mode = loadMode();
	let currentAgentIsInteractive = false;
	let nextAgentIsInteractive = false;
	let activeAssistantHasToolCall = false;
	let beepPlayedForAssistantMessage = false;
	const tts = new TtsQueue();

	pi.registerFlag("notification", {
		description: "Notification mode: off, beep, tts, or both",
		type: "string",
	});

	function setMode(nextMode: NotificationMode, ctx?: ExtensionContext): void {
		mode = nextMode;
		try {
			saveMode(mode);
		} catch (error) {
			notifyFailure(ctx, `Failed to save notification setting: ${formatError(error)}`);
		}
		if (ctx) updateStatus(ctx, mode);
	}

	pi.on("input", async (event) => {
		nextAgentIsInteractive = event.source === "interactive";
	});

	pi.on("agent_start", async (_event, ctx) => {
		currentAgentIsInteractive = nextAgentIsInteractive && ctx.hasUI;
		nextAgentIsInteractive = false;
		activeAssistantHasToolCall = false;
		beepPlayedForAssistantMessage = false;
		tts.setContext(ctx);
	});

	pi.on("message_start", async (event) => {
		if (event.message.role !== "assistant") return;
		activeAssistantHasToolCall = false;
		beepPlayedForAssistantMessage = false;
	});

	pi.on("message_update", async (event, ctx) => {
		if (!currentAgentIsInteractive) return;
		if (mode !== "beep" && mode !== "both") return;
		if (event.message.role !== "assistant") return;

		const streamEventType = (event.assistantMessageEvent as { type?: string } | undefined)?.type;
		if (streamEventType?.startsWith("toolcall_")) {
			activeAssistantHasToolCall = true;
			return;
		}
		if (activeAssistantHasToolCall || beepPlayedForAssistantMessage) return;
		if (streamEventType !== "text_start" && streamEventType !== "text_delta") return;

		beepPlayedForAssistantMessage = true;
		void playBeep().catch((error) => {
			notifyFailure(ctx, `Beep notification failed: ${formatError(error)}`);
		});
	});

	pi.on("message_end", async (event, ctx) => {
		if (!currentAgentIsInteractive) return;
		if (mode === "off") return;
		if (event.message.role !== "assistant") return;
		if (hasToolCall(event.message)) return;

		const stopReason = (event.message as { stopReason?: string }).stopReason;
		if (stopReason !== "stop" && stopReason !== "length") return;

		if ((mode === "beep" || mode === "both") && !beepPlayedForAssistantMessage) {
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
	});

	pi.registerCommand("notification", {
		description: "Configure response notifications: off, beep, tts, both, or status",
		getArgumentCompletions: (prefix: string) => {
			const items = ["status", ...MODES].map((value) => ({ value, label: value }));
			const filtered = items.filter((item) => item.value.startsWith(prefix.trim().toLowerCase()));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => {
			const arg = (args ?? "").trim().toLowerCase();
			if (!arg || arg === "status") {
				ctx.ui.notify(`Notification mode: ${mode}`, "info");
				updateStatus(ctx, mode);
				return;
			}

			if (!isNotificationMode(arg)) {
				ctx.ui.notify(`Unknown notification mode "${args}". Use: ${MODES.join(", ")}`, "error");
				return;
			}

			setMode(arg, ctx);
			ctx.ui.notify(`Notification mode set to ${arg}`, "info");
		},
	});
}
