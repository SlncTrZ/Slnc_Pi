/**
 * conversation-saver — Auto-save Pi conversation to Qdrant MeiLin Knowledge Base.
 *
 * Cơ chế:
 *   - Mỗi turn_end: ghi user + assistant messages vào buffer (bỏ tool calls)
 *   - Auto-save mỗi SAVE_THRESHOLD turn + session_shutdown + manual "lưu lại"
 *   - Mỗi session = 1 point (ID deterministic từ session_id) → upsert đè,
 *     KHÔNG trùng lặp dữ liệu như version cũ (1031 points → ~1/session)
 *
 * Wing: conversation | Topic: chat_history | Updated: 2026-08-07 09:20
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

// ─── Config ──────────────────────────────────────────────────────────────
const SECRETS_PATH =
	process.env.QDRANT_SECRETS_PATH ||
	require("node:path").join(require("node:os").homedir(), ".pi", "agent", "secrets", "qdrant.json");

const QDRANT_URL = process.env.QDRANT_URL || "http://192.168.1.227:6333";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://192.168.1.227:11434";
const EMBED_MODEL = "nomic-embed-text";
const CHANNEL = "pi";
const SAVE_THRESHOLD = 10; // auto-save mỗi 10 turn + shutdown + manual
const EMBED_CHARS = 1000; // độ dài text dùng để tạo vector

// ─── Secrets (KHÔNG hardcode key trong source) ───────────────────────────
let cachedApiKey: string | null = null;

function loadSecrets(): { qdrant: { api_key?: string }; ollama?: { url?: string } } {
	try {
		if (existsSync(SECRETS_PATH)) {
			return JSON.parse(readFileSync(SECRETS_PATH, "utf-8")) as {
				qdrant: { api_key?: string };
				ollama?: { url?: string };
			};
		}
	} catch (error) {
		console.error(
			`[conversation-saver] Không đọc được secrets ${SECRETS_PATH}: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
	return { qdrant: {} };
}

function getApiKey(): string {
	if (cachedApiKey) return cachedApiKey;
	cachedApiKey =
		process.env.QDRANT_API_KEY ||
		loadSecrets().qdrant.api_key ||
		"";
	if (!cachedApiKey) {
		console.error(
			`[conversation-saver] ⚠️ Thiếu QDRANT_API_KEY — tạo ${SECRETS_PATH} hoặc set env QDRANT_API_KEY`,
		);
	}
	return cachedApiKey;
}

// ─── In-memory buffer ────────────────────────────────────────────────────
interface ConvEntry {
	role: "user" | "assistant";
	text: string;
	ts: number;
}

const buffer: ConvEntry[] = [];
let turnCount = 0;
let sessionStartTime = 0;
let currentSessionId = "";

// ─── Helpers ─────────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
	const d = new Date(ts);
	return d.toLocaleTimeString("vi-VN", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

function buildConversationText(entries: ConvEntry[]): string {
	const lines: string[] = [];
	const date = new Date().toISOString().slice(0, 10);
	lines.push(`# Conversation Pi — ${date}\n`);

	for (const e of entries) {
		const name = e.role === "user" ? "DinhTruong" : "MeiLin";
		lines.push(`[${formatTimestamp(e.ts)}] ${name}: ${e.text}\n`);
	}
	return lines.join("");
}

function buildSummary(entries: ConvEntry[]): string {
	if (entries.length === 0) return "Empty session";
	const first = entries[0];
	const topic =
		first.text.length > 80 ? first.text.substring(0, 77) + "..." : first.text;
	return `Pi session: ${entries.length} messages | ${topic}`;
}

/** ID deterministic dạng UUID v5-like — Qdrant chỉ chấp nhận integer hoặc UUID. */
function sessionPointId(sessionId: string): string {
	const hash = createHash("sha256").update(`conversation:${sessionId}`).digest();
	hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
	hash[8] = (hash[8] & 0x3f) | 0x80; // variant RFC 4122
	const hex = hash.subarray(0, 16).toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// ─── Qdrant + Embedding ─────────────────────────────────────────────────

async function generateEmbedding(text: string): Promise<number[]> {
	const resp = await fetch(`${OLLAMA_URL}/api/embeddings`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
	});
	if (!resp.ok) {
		throw new Error(`Embedding HTTP ${resp.status}: ${await resp.text().catch(() => "")}`);
	}
	const data = (await resp.json()) as { embedding?: number[] };
	if (!data.embedding || data.embedding.length !== 768) {
		throw new Error(`Embedding failed: dims=${data.embedding?.length}`);
	}
	return data.embedding;
}

async function upsertToQdrant(
	content: string,
	summary: string,
	messageCount: number,
	sessionId: string,
	startTs: number,
): Promise<void> {
	const embedText = content.substring(0, EMBED_CHARS) || summary;
	const vector = await generateEmbedding(embedText);
	const now = new Date();
	const dateStr = now.toISOString().slice(0, 10);

	const point = {
		id: sessionPointId(sessionId),
		vector,
		payload: {
			content,
			wing: "conversation",
			topic: "chat_history",
			date: dateStr,
			entity_name: `pi_session_${dateStr}`,
			entity_type: "daily_log",
			summary,
			importance: "medium",
			status: "active",
			version: 1,
			channel: CHANNEL,
			session_id: sessionId,
			session_start: startTs,
			timestamp: now.getTime(),
			change_reason: "Pi conversation auto-save via extension",
			message_count: messageCount,
		},
	};

	const resp = await fetch(
		`${QDRANT_URL}/collections/meilin_conversation/points`,
		{
			method: "PUT",
			headers: {
				"api-key": getApiKey(),
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ points: [point] }),
		},
	);
	if (!resp.ok) {
		throw new Error(`Qdrant upsert HTTP ${resp.status}: ${await resp.text().catch(() => "")}`);
	}
	const result = (await resp.json()) as { status?: string };
	if (result.status !== "ok" && result.status !== "acknowledged") {
		throw new Error(`Qdrant upsert failed: ${JSON.stringify(result)}`);
	}
}

// ─── Extract text from message ──────────────────────────────────────────

function extractTextFromMessage(msg: any): string {
	if (typeof msg.content === "string") return msg.content;
	if (Array.isArray(msg.content)) {
		return msg.content
			.filter((c: any) => c.type === "text")
			.map((c: any) => c.text)
			.join("\n");
	}
	return "";
}

// ─── Save current buffer ────────────────────────────────────────────────

async function saveBuffer(): Promise<{ saved: number }> {
	if (buffer.length === 0) return { saved: 0 };

	const content = buildConversationText(buffer);
	const summary = buildSummary(buffer);

	try {
		await upsertToQdrant(content, summary, buffer.length, currentSessionId, sessionStartTime);
		console.log(
			`[conversation-saver] ✅ Saved ${buffer.length} messages: ${summary.substring(0, 80)}`,
		);
		return { saved: buffer.length };
	} catch (err) {
		console.error("[conversation-saver] ❌ Save failed:", err);
		return { saved: 0 };
	}
}

// ─── Clear duplicate entries (same text in a row) ───────────────────────

function dedupeBuffer() {
	for (let i = buffer.length - 1; i > 0; i--) {
		if (
			buffer[i].text === buffer[i - 1].text &&
			buffer[i].role === buffer[i - 1].role
		) {
			buffer.splice(i, 1);
		}
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// Extension entry point
// ═══════════════════════════════════════════════════════════════════════════

export default function (pi: ExtensionAPI) {
	// ── Session start: reset buffer + tạo session id mới ─────────────────────
	pi.on("session_start", async (_event: any) => {
		buffer.length = 0;
		turnCount = 0;
		sessionStartTime = Date.now();
		const dateStr = new Date(sessionStartTime).toISOString().slice(0, 10);
		currentSessionId = `pi_${dateStr}_${sessionStartTime}`;
		console.log(`[conversation-saver] Session started: ${currentSessionId}, buffer reset`);
	});

	// ── Message end: capture user & assistant messages only (skip tool) ─────
	pi.on("message_end", async (event: any) => {
		if (event.message.role === "user") {
			const text = extractTextFromMessage(event.message);
			if (text.trim()) {
				buffer.push({ role: "user", text: text.trim(), ts: Date.now() });
			}
		} else if (event.message.role === "assistant") {
			const text = extractTextFromMessage(event.message);
			if (text.trim()) {
				buffer.push({ role: "assistant", text: text.trim(), ts: Date.now() });
			}
		}
		// Skip tool messages entirely
	});

	// ── Turn end: optional auto-save after N turns ──────────────────────────
	pi.on("turn_end", async () => {
		turnCount++;
		dedupeBuffer();

		if (SAVE_THRESHOLD > 0 && turnCount % SAVE_THRESHOLD === 0) {
			await saveBuffer();
		}
	});

	// ── Session shutdown: save final buffer ─────────────────────────────────
	pi.on("session_shutdown", async () => {
		await saveBuffer();
		console.log("[conversation-saver] Session ended, buffer saved");
	});

	// ── Register tool "save_conversation" (manual save command) ────────────
	pi.registerTool({
		name: "save_conversation",
		label: "Save conversation",
		description:
			"Lưu conversation hiện tại vào Qdrant wing conversation. Dùng khi user nói 'lưu lại'.",
		promptSnippet: "Save current conversation to Qdrant knowledge base",
		promptGuidelines: [
			'When the user says "lưu lại" or "save conversation", call save_conversation tool immediately.',
		],
		parameters: {
			type: "object",
			properties: {
				note: {
					type: "string",
					description:
						"Optional note to add to summary (e.g. reason for saving)",
				},
			},
		},
		async execute(
			_toolCallId: string,
			params: { note?: string },
			_signal: AbortSignal,
			_onUpdate: ((update: any) => void) | undefined,
		) {
			if (params.note) {
				buffer.push({
					role: "user",
					text: `📝 Note: ${params.note}`,
					ts: Date.now(),
				});
			}
			dedupeBuffer();

			const summary = buildSummary(buffer);
			const result = await saveBuffer();

			return {
				content: [
					{
						type: "text" as const,
						text: `✅ Đã lưu conversation (${result.saved} messages) vào Qdrant.\n\nSummary: ${summary}`,
					},
				],
				details: { saved: result.saved > 0, messageCount: result.saved },
			};
		},
	});
}
