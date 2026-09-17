/**
 * conversation-saver — Auto-save Pi conversation to Cyber Brain qua MCP (memory_store).
 *
 * Cơ chế:
 *   - Mỗi message_end: ghi user + assistant messages vào buffer (bỏ tool calls)
 *   - Auto-save mỗi SAVE_THRESHOLD turn + session_shutdown + manual "lưu lại"
 *   - Mỗi session = 1 record, session_id riêng (pi_<date>_<epoch>)
 *   - GHI QUA MCP `memory_store` của CyberBrain (meilin-brain), KHÔNG tự upsert Qdrant và
 *     KHÔNG tự tạo embedding → server sở hữu collection/embedding/lifecycle/dream queue.
 *
 * Lịch sử: bản cũ ghi thẳng REST vào Qdrant collection hardcode `cyberbrain_episodic`, đã
 * chết im lặng sau khi CyberBrain migration đổi tên collection sang `*_v2_stage`, và tool vẫn
 * báo ✅ dù saved=0. Bản này fail loud: lỗi được ghi log + tool trả về lỗi rõ ràng.
 *
 * Wing: episodic | Topic: chat_history | Updated: 2026-09-17
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ─── Config ──────────────────────────────────────────────────────────────
const MCP_URL =
	process.env.CYBERBRAIN_MCP_URL || "https://meilin-mcp.truongcongdinh.org/mcp";
const MCP_JSON = join(homedir(), ".pi", "agent", "mcp.json");
const LOG_DIR = join(homedir(), ".pi", "agent", "logs");
const LOG_FILE = join(LOG_DIR, "conversation-saver.log");

const CHANNEL = "pi";
const TOOL_NAME = "memory_store";
const SAVE_THRESHOLD = 10; // auto-save mỗi 10 turn + shutdown + manual
// nomic-embed-text trên .227 chạy n_ctx = 2048 token. Tiếng Việt ~2.4 ký tự/token ⇒ 2048 token
// ≈ 4900 ký tự, nhưng ollama trả 500 thay vì cắt bớt khi vượt ngưỡng, nên giữ biên an toàn.
// 3600 ký tự ≈ 1500 token tiếng Việt / ~900 token tiếng Anh.
const MAX_EMBED_CHARS = 3600;
const MCP_TIMEOUT_MS = 60_000;
const PROTOCOL_VERSION = "2025-11-25";

// ─── Logging (fail loud: lỗi phải để lại dấu vết trên đĩa) ───────────────
function logFile(level: "info" | "error", message: string): void {
	try {
		mkdirSync(LOG_DIR, { recursive: true });
		appendFileSync(
			LOG_FILE,
			`${new Date().toISOString()} [${level}] ${message}\n`,
			"utf-8",
		);
	} catch {
		// không để việc ghi log làm hỏng luồng lưu
	}
	console[level === "error" ? "error" : "log"](
		`[conversation-saver] ${level === "error" ? "❌" : "ℹ️"} ${message}`,
	);
}

// ─── Credential: env trước, fallback đọc mcp.json của Pi (không hardcode) ─
let cachedToken: string | null = null;

function getMcpToken(): string {
	if (cachedToken) return cachedToken;
	const fromEnv = (process.env.CYBERBRAIN_MCP_AUTH_TOKEN || "").trim();
	if (fromEnv) {
		cachedToken = fromEnv;
		return cachedToken;
	}
	try {
		if (existsSync(MCP_JSON)) {
			const cfg = JSON.parse(readFileSync(MCP_JSON, "utf-8")) as {
				mcpServers?: Record<string, { headers?: Record<string, string> }>;
			};
			for (const server of Object.values(cfg.mcpServers ?? {})) {
				const auth = server.headers?.Authorization ?? "";
				if (auth.toLowerCase().startsWith("bearer ")) {
					cachedToken = auth.slice(7).trim();
					return cachedToken;
				}
			}
		}
	} catch (error) {
		logFile("error", `Không đọc được ${MCP_JSON}: ${String(error)}`);
	}
	return "";
}

// ─── Minimal MCP streamable-HTTP client ──────────────────────────────────
let sessionId: string | null = null;

function parseSsePayload(raw: string): any {
	for (const line of raw.split(/\r?\n/)) {
		if (!line.startsWith("data:")) continue;
		const data = line.slice(5).trim();
		if (!data) continue;
		try {
			return JSON.parse(data);
		} catch {
			/* thử dòng data tiếp theo */
		}
	}
	throw new Error(`Không parse được SSE payload: ${raw.slice(0, 200)}`);
}

async function mcpPost(body: unknown): Promise<{ json: any; sessionId: string | null }> {
	const token = getMcpToken();
	if (!token) {
		throw new Error(
			"Thiếu credential CyberBrain (env CYBERBRAIN_MCP_AUTH_TOKEN hoặc mcp.json)",
		);
	}
	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
		Accept: "application/json, text/event-stream",
	};
	if (sessionId) headers["mcp-session-id"] = sessionId;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), MCP_TIMEOUT_MS);
	try {
		const response = await fetch(MCP_URL, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
			signal: controller.signal,
		});
		const newSession = response.headers.get("mcp-session-id");
		const text = await response.text();
		if (!response.ok) {
			throw new Error(`MCP HTTP ${response.status}: ${text.slice(0, 300)}`);
		}
		return {
			json: text.trim() ? parseSsePayload(text) : null,
			sessionId: newSession,
		};
	} finally {
		clearTimeout(timer);
	}
}

async function mcpEnsureSession(): Promise<void> {
	if (sessionId) return;
	const { json, sessionId: sid } = await mcpPost({
		jsonrpc: "2.0",
		id: 1,
		method: "initialize",
		params: {
			protocolVersion: PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: { name: "pi-conversation-saver", version: "2.0" },
		},
	});
	if (json?.error) throw new Error(`MCP initialize lỗi: ${JSON.stringify(json.error)}`);
	if (!sid) throw new Error("MCP initialize không trả về mcp-session-id");
	sessionId = sid;
	// notification: server trả 202, không cần đọc body
	await mcpPost({ jsonrpc: "2.0", method: "notifications/initialized" });
}

async function mcpCallTool(name: string, args: Record<string, unknown>): Promise<any> {
	await mcpEnsureSession();
	const { json } = await mcpPost({
		jsonrpc: "2.0",
		id: 2,
		method: "tools/call",
		params: { name, arguments: args },
	});
	if (json?.error) {
		throw new Error(`MCP ${name} lỗi: ${JSON.stringify(json.error)}`);
	}
	const result = json?.result;
	if (result?.isError) {
		const detail =
			result?.content?.[0]?.text ?? JSON.stringify(result).slice(0, 300);
		throw new Error(`MCP ${name} trả isError: ${detail}`);
	}
	return result;
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

function buildConversationText(
	entries: ConvEntry[],
	partIndex = 1,
	partTotal = 1,
): string {
	const lines: string[] = [];
	const date = new Date().toISOString().slice(0, 10);
	const part = partTotal > 1 ? ` (phần ${partIndex}/${partTotal})` : "";
	lines.push(`# Conversation Pi — ${date}${part}\n`);
	for (const e of entries) {
		const name = e.role === "user" ? "DinhTruong" : "MeiLin";
		lines.push(`[${formatTimestamp(e.ts)}] ${name}: ${e.text}\n`);
	}
	return lines.join("");
}

/** Chi phí ký tự thật của một dòng khi render: "[HH:MM] Name: text\n". */
function entryCost(entry: ConvEntry): number {
	const nameLen = entry.role === "user" ? "DinhTruong".length : "MeiLin".length;
	return 5 + 1 + nameLen + 2 + entry.text.length + 1; // timestamp + space + name + ": " + newline
}

/**
 * Chia conversation thành nhiều phần ≤ maxChars (tính cả header + overhead format) để embedding
 * không vượt n_ctx của nomic-embed-text. Chia theo ranh giới message; message đơn lẻ quá lớn bị
 * cắt cứng nhưng KHÔNG bỏ nội dung.
 */
function chunkEntries(
	entries: ConvEntry[],
	maxChars: number = MAX_EMBED_CHARS,
): ConvEntry[][] {
	const headerBudget = 64; // "# Conversation Pi — YYYY-MM-DD (phần n/m)\n"
	const bodyBudget = Math.max(200, maxChars - headerBudget);
	const chunks: ConvEntry[][] = [];
	let current: ConvEntry[] = [];
	let size = 0;

	for (const entry of entries) {
		const cost = entryCost(entry);
		if (cost > bodyBudget) {
			if (current.length) {
				chunks.push(current);
				current = [];
				size = 0;
			}
			// cắt cứng phần text sao cho cả dòng vẫn nằm trong ngân sách
			const overhead = cost - entry.text.length;
			const sliceSize = Math.max(100, bodyBudget - overhead);
			for (let i = 0; i < entry.text.length; i += sliceSize) {
				chunks.push([{ ...entry, text: entry.text.slice(i, i + sliceSize) }]);
			}
			continue;
		}
		if (current.length && size + cost > bodyBudget) {
			chunks.push(current);
			current = [];
			size = 0;
		}
		current.push(entry);
		size += cost;
	}
	if (current.length) chunks.push(current);
	return chunks.length ? chunks : [[]];
}

// Dùng cho test tự động (test chunking mà không cần boot Pi).
export const __internals = { chunkEntries, buildConversationText, MAX_EMBED_CHARS };

function buildSummary(entries: ConvEntry[]): string {
	if (entries.length === 0) return "Empty session";
	const first = entries[0];
	const topic =
		first.text.length > 80 ? first.text.substring(0, 77) + "..." : first.text;
	return `Pi session: ${entries.length} messages | ${topic}`;
}

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

// ─── Save current buffer (chia phần theo ngân sách embedding, qua MCP) ─
interface SaveResult {
	saved: number;
	parts: number;
	failedParts: number[];
	error?: string;
}

async function saveBuffer(): Promise<SaveResult> {
	if (buffer.length === 0) return { saved: 0, parts: 0, failedParts: [] };

	const chunks = chunkEntries(buffer);
	const total = chunks.length;
	let saved = 0;
	const failedParts: number[] = [];
	let lastError: string | undefined;

	for (let i = 0; i < total; i++) {
		const part = chunks[i];
		const content = buildConversationText(part, i + 1, total);
		const sessionForPart = i === 0 ? currentSessionId : `${currentSessionId}-p${i + 1}`;
		const summary = buildSummary(part);
		try {
			await mcpCallTool(TOOL_NAME, {
				content,
				session_id: sessionForPart,
				event_time: new Date().toISOString(),
				channel: CHANNEL,
				role: "summary",
				agent: "pi",
				project: "Slnc_Pi",
				topic: "chat_history",
				importance: "medium",
				source: "pi_conversation",
				// Schema memory_store KHÔNG có field `summary` → đặt trong extensions
				extensions: {
				summary: total > 1 ? `${summary} [phần ${i + 1}/${total}]` : summary,
				part_index: i + 1,
				part_total: total,
				message_count: part.length,
				},
			});
			saved += part.length;
			logFile(
				"info",
				`Đã lưu phần ${i + 1}/${total} (${part.length} messages, ${content.length} ký tự) session=${sessionForPart}`,
			);
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			failedParts.push(i + 1);
			lastError = detail;
			logFile("error", `Phần ${i + 1}/${total} lưu thất bại: ${detail}`);
			sessionId = null; // buộc bắt tay lại session MCP ở lần sau
		}
	}

	return { saved, parts: total, failedParts, error: lastError };
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
		sessionId = null;
		logFile("info", `Session started: ${currentSessionId}, buffer reset`);
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
		const result = await saveBuffer();
		logFile(
			result.failedParts.length ? "error" : "info",
			`Session ended — saved=${result.saved} messages trong ${result.parts} phần` +
				(result.failedParts.length
					? ` failed_parts=${result.failedParts.join(",")} error=${result.error}`
					: ""),
		);
	});

	// ── Register tool "save_conversation" (manual save command) ────────────
	pi.registerTool({
		name: "save_conversation",
		label: "Save conversation",
		description:
			"Lưu conversation hiện tại vào Cyber Brain qua MCP memory_store (schema V2). Dùng khi user nói 'lưu lại'.",
		promptSnippet: "Save current conversation to Cyber Brain via MCP (V2)",
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

			// FAIL LOUD: không bao giờ báo ✅ khi thực tế không lưu được.
			if (result.saved === 0) {
				return {
					content: [
						{
							type: "text" as const,
							text: `❌ KHÔNG lưu được conversation (0/${result.parts} phần).\n\nLỗi: ${result.error ?? "buffer rỗng — không có gì để lưu"}\n\nLog: ${LOG_FILE}`,
						},
					],
					details: { saved: false, messageCount: 0, error: result.error },
					isError: true,
				};
			}

			if (result.failedParts.length > 0) {
				return {
					content: [
						{
							type: "text" as const,
							text: `⚠️ Lưu MỘT PHẦN (${result.parts - result.failedParts.length}/${result.parts} phần, ${result.saved} messages). Phần lỗi: ${result.failedParts.join(", ")}.\n\nLỗi cuối: ${result.error}\n\nLog: ${LOG_FILE}`,
						},
					],
					details: { saved: true, partial: true, failedParts: result.failedParts, messageCount: result.saved },
					isError: true,
				};
			}

			return {
				content: [
					{
						type: "text" as const,
						text: `✅ Đã lưu conversation (${result.saved} messages, ${result.parts} phần) vào Cyber Brain qua MCP memory_store (V2).\n\nSummary: ${summary}`,
					},
				],
				details: { saved: true, messageCount: result.saved, parts: result.parts },
			};
		},
	});
}
