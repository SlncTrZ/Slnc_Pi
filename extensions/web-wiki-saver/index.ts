/**
 * web-wiki-saver — Auto-save web search results into the Qdrant omniscience_wiki wing.
 *
 * Cơ chế:
 *   - Bắt toolResult của web_search / source_check → lưu query + answer + sources
 *     vào collection meilin_omniscience_wiki (768d, Cosine)
 *   - ID deterministic theo (query + ngày) → upsert đè, không trùng lặp
 *   - Tool manual "save_web_to_wiki" để agent chủ động lưu khi cần
 *   - Quy trình search → wiki-first nằm trong skill meilin-kb + AGENTS.md
 *
 * Wing: omniscience_wiki | Topic: web_research | Updated: 2026-08-07 09:30
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ─── Config ──────────────────────────────────────────────────────────────
const SECRETS_PATH =
	process.env.QDRANT_SECRETS_PATH ||
	join(homedir(), ".pi", "agent", "secrets", "qdrant.json");
const QDRANT_URL = process.env.QDRANT_URL || "http://192.168.1.227:6333";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://192.168.1.227:11434";
const EMBED_MODEL = "nomic-embed-text";
const EMBED_CHARS = 1000;
const MIN_ANSWER_CHARS = 100; // kết quả dưới ngưỡng này không auto-lưu (tránh rác)
const WING = "omniscience_wiki";
const COLLECTION = "meilin_omniscience_wiki";

/** Tool names được auto-capture */
const SEARCH_TOOLS = new Set(["web_search", "source_check"]);

// ─── Secrets ─────────────────────────────────────────────────────────────
function getApiKey(): string {
	const envKey = process.env.QDRANT_API_KEY;
	if (envKey) return envKey;
	try {
		if (existsSync(SECRETS_PATH)) {
			const secrets = JSON.parse(readFileSync(SECRETS_PATH, "utf-8")) as {
				qdrant?: { api_key?: string };
			};
			if (secrets.qdrant?.api_key) return secrets.qdrant.api_key;
		}
	} catch (error) {
		console.error(
			`[web-wiki-saver] Không đọc được secrets: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	console.error(
		`[web-wiki-saver] ⚠️ Thiếu QDRANT_API_KEY — tạo ${SECRETS_PATH} hoặc set env QDRANT_API_KEY`,
	);
	return "";
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function extractText(msg: any): string {
	if (typeof msg?.content === "string") return msg.content;
	if (Array.isArray(msg?.content)) {
		return msg.content
			.filter((c: any) => c.type === "text")
			.map((c: any) => c.text)
			.join("\n");
	}
	return "";
}

/** Lấy danh sách URL từ text kết quả web search. */
function extractSources(text: string): string[] {
	const urls = Array.from(
		text.matchAll(/https?:\/\/[^\s)\]}>,]+/g),
		(m) => m[0],
	);
	return [...new Set(urls)].slice(0, 20);
}

function makeTopic(query: string): string {
	const t = query.replace(/\s+/g, " ").trim();
	return t.length > 80 ? t.substring(0, 77) + "..." : t || "untitled";
}

/** ID deterministic dạng UUID v5-like — Qdrant chỉ chấp nhận integer hoặc UUID. */
function wikiPointId(query: string, dateStr: string): string {
	const hash = createHash("sha256")
		.update(`wiki:web:${makeTopic(query).toLowerCase()}:${dateStr}`)
		.digest();
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
	if (!resp.ok) throw new Error(`Embedding HTTP ${resp.status}`);
	const data = (await resp.json()) as { embedding?: number[] };
	if (!data.embedding || data.embedding.length !== 768) {
		throw new Error(`Embedding failed: dims=${data.embedding?.length}`);
	}
	return data.embedding;
}

async function upsertToWiki(
	query: string,
	answer: string,
	sources: string[],
	extra?: { note?: string },
): Promise<boolean> {
	if (!answer.trim()) return false;

	const content = [
		`## Query`,
		query,
		``,
		`## Answer`,
		answer.trim(),
		...((extra?.note && [``, `## Note`, extra.note]) || []),
		...(sources.length
			? [``, `## Sources`, ...sources.map((s) => `- ${s}`)]
			: []),
	].join("\n");

	const embedText = content.substring(0, EMBED_CHARS);
	const vector = await generateEmbedding(embedText);

	const now = new Date();
	const dateStr = now.toISOString().slice(0, 10);
	const topic = makeTopic(query);

	const point = {
		id: wikiPointId(query, dateStr),
		vector,
		payload: {
			content,
			wing: WING,
			topic,
			entity_name: topic,
			entity_type: "web_research",
			version: 1,
			status: "active",
			timestamp: now.toISOString(),
			change_reason: "Web research auto-save via extension",
			summary: answer.trim().substring(0, 200),
			importance: "medium",
			query,
			queries: [query],
			sources,
			search_date: dateStr,
		},
	};

	const resp = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
		method: "PUT",
		headers: {
			"api-key": getApiKey(),
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ points: [point] }),
	});
	if (!resp.ok) {
		throw new Error(
			`Qdrant upsert HTTP ${resp.status}: ${await resp.text().catch(() => "")}`,
		);
	}
	const result = (await resp.json()) as { status?: string };
	if (result.status !== "ok" && result.status !== "acknowledged") {
		throw new Error(`Qdrant upsert failed: ${JSON.stringify(result)}`);
	}
	return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Extension entry point
// ═══════════════════════════════════════════════════════════════════════════

export default function (pi: ExtensionAPI) {
	// ── Auto-capture: toolResult của web_search / source_check ───────────────
	pi.on("message_end", async (event: any) => {
		const msg = event?.message;
		if (msg?.role !== "toolResult" || !SEARCH_TOOLS.has(msg?.toolName)) return;

		const answer = extractText(msg);
		if (!answer.trim()) return;
		if (answer.trim().length < MIN_ANSWER_CHARS) {
			console.log(
				`[web-wiki-saver] Bỏ qua kết quả ${msg.toolName} quá ngắn (${answer.trim().length} chars)`,
			);
			return;
		}

		const sources = extractSources(answer);
		const query = makeTopic(answer.split("\n")[0] || "web research");
		try {
			const saved = await upsertToWiki(query, answer, sources);
			if (saved) {
				console.log(
					`[web-wiki-saver] ✅ Wiki lưu: ${query.substring(0, 60)} (${sources.length} sources)`,
				);
			}
		} catch (err) {
			console.error(
				`[web-wiki-saver] ❌ Lưu wiki thất bại: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	});

	// ── Tool manual: agent gọi khi cần lưu 1 kết quả nghiên cứu cụ thể ───────
	pi.registerTool({
		name: "save_web_to_wiki",
		label: "Save web research to wiki",
		description:
			"Lưu kết quả nghiên cứu/web search (query + answer + sources) vào Qdrant wing omniscience_wiki. Dùng sau khi tổng hợp thông tin từ web_search để tái sử dụng lần sau.",
		promptSnippet: "Save web research result to Qdrant wiki wing",
		promptGuidelines: [
			"After completing a web research task for the user, call save_web_to_wiki with the query and synthesized answer so it can be reused later.",
		],
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description:
						"Search query / chủ đề nghiên cứu (VD: 'DeepSeek V4 architecture')",
				},
				answer: {
					type: "string",
					description: "Kết quả tổng hợp đã trả lời cho user",
				},
				note: {
					type: "string",
					description: "Ghi chú thêm (tuỳ chọn)",
				},
			},
			required: ["query", "answer"],
		},
		async execute(
			_toolCallId: string,
			params: { query: string; answer: string; note?: string },
			_signal: AbortSignal,
			_onUpdate: ((update: any) => void) | undefined,
		) {
			const sources = extractSources(params.answer);
			try {
				const saved = await upsertToWiki(params.query, params.answer, sources, {
					note: params.note,
				});
				return {
					content: [
						{
							type: "text" as const,
							text: saved
								? `✅ Đã lưu vào wiki wing (topic: ${makeTopic(params.query)})`
								: "⚠️ Answer rỗng, không lưu được",
						},
					],
					details: { saved, sources: sources.length },
				};
			} catch (err) {
				return {
					content: [
						{
							type: "text" as const,
							text: `❌ Lưu wiki thất bại: ${err instanceof Error ? err.message : String(err)}`,
						},
					],
					details: { saved: false, sources: 0 },
				};
			}
		},
	});
}
