/**
 * conversation-saver — Auto-save Pi conversation to Qdrant MeiLin Knowledge Base.
 *
 * Cơ chế:
 *   - Mỗi turn_end: ghi user + assistant messages vào buffer (bỏ tool calls)
 *   - session_shutdown / "lưu lại": upsert toàn bộ buffer vào meilin_conversation
 *
 * Wing: conversation | Topic: chat_history | Updated: 2026-06-15 15:15
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";

// ─── Config ──────────────────────────────────────────────────────────────
const QDRANT_URL = process.env.QDRANT_URL || "http://192.168.1.227:6333";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://192.168.1.227:11434";
const API_KEY =
	process.env.QDRANT_API_KEY || "wQ72uGxOv1kpX5ETBo1FEuKeYWf8ytac11cJIcOg";
const EMBED_MODEL = "nomic-embed-text";
const CHANNEL = "pi";
const SAVE_THRESHOLD = 10; // auto-save mỗi 10 turn + shutdown + manual

// ─── In-memory buffer ────────────────────────────────────────────────────
interface ConvEntry {
	role: "user" | "assistant";
	text: string;
	ts: number;
}

const buffer: ConvEntry[] = [];
let turnCount = 0;

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

// ─── Qdrant + Embedding ─────────────────────────────────────────────────

async function generateEmbedding(text: string): Promise<number[]> {
	const resp = await fetch(`${OLLAMA_URL}/api/embeddings`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
	});
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
): Promise<void> {
	const vector = await generateEmbedding(summary || content.substring(0, 500));
	const now = new Date();
	const dateStr = now.toISOString().slice(0, 10);

	const point = {
		id: randomUUID(),
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
			session_id: `pi_${dateStr}`,
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
				"api-key": API_KEY,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ points: [point] }),
		},
	);
	const result = (await resp.json()) as { status: string };
	if (result.status !== "ok") {
		console.error("[conversation-saver] Qdrant upsert failed:", result);
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

async function saveBuffer() {
	if (buffer.length === 0) return;

	const content = buildConversationText(buffer);
	const summary = buildSummary(buffer);

	try {
		await upsertToQdrant(content, summary, buffer.length);
		console.log(
			`[conversation-saver] ✅ Saved ${buffer.length} messages: ${summary.substring(0, 80)}`,
		);
	} catch (err) {
		console.error("[conversation-saver] ❌ Save failed:", err);
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
	// ── Session start: reset buffer ─────────────────────────────────────────
	pi.on("session_start", async (_event: any) => {
		buffer.length = 0;
		turnCount = 0;
		console.log("[conversation-saver] Session started, buffer reset");
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

		if (
			SAVE_THRESHOLD > 0 &&
			turnCount > 0 &&
			turnCount % SAVE_THRESHOLD === 0
		) {
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
			const summary = buildSummary(buffer);

			if (params.note) {
				buffer.push({
					role: "user",
					text: `📝 Note: ${params.note}`,
					ts: Date.now(),
				});
			}

			await saveBuffer();

			return {
				content: [
					{
						type: "text" as const,
						text: `✅ Đã lưu conversation (${buffer.length} messages) vào Qdrant.\n\nSummary: ${summary}`,
					},
				],
				details: { saved: true, messageCount: buffer.length },
			};
		},
	});
}
