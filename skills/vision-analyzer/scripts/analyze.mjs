#!/usr/bin/env node
/**
 * Vision Analyzer — Phân tích ảnh (2 provider)
 *
 * Wing: code_chronicles | Topic: skill | Updated: 2026-08-17
 *
 * - mimo  (MẶC ĐỊNH): 9router trên .227:20128 + model oc/mimo-v2.5-free
 *   (proxy OpenRouter, cost $0, vision MIMO mạnh + reasoning). Route qua IP trực tiếp
 *   (domain router.truongcongdinh.org bị Cloudflare chặn non-browser UA → 403/1010).
 * - ollama: qwen3-vl:2b-thinking trên .171:11434 (fallback nhẹ, kém chính xác).
 *
 * Usage:
 *   node analyze.mjs <imagePath> [prompt] [--provider=mimo|ollama]
 *   node analyze.mjs K:/img.png "Mô tả ảnh" --provider=ollama
 *
 * Environment:
 *   VISION_PROVIDER  : mimo|ollama (override default)
 *   NINE_ROUTER_KEY  : API key 9router (default: sk-286295c6de1aed11-ckqkji-0e3cb76f)
 */

const args = process.argv.slice(2);
const providerFlag = args.find((a) => a.startsWith("--provider="));
const providerArg = providerFlag ? providerFlag.split("=")[1] : null;
const rest = args.filter((a) => !a.startsWith("--provider="));

const [imagePath, ...promptParts] = rest;
const prompt = promptParts.join(" ") || "Mô tả chi tiết nội dung bức ảnh này";
const provider =
	process.env.VISION_PROVIDER || providerArg || "mimo";

const NINE_ROUTER_URL =
	process.env.NINE_ROUTER_URL || "http://192.168.1.227:20128/v1";
const NINE_ROUTER_MODEL = process.env.NINE_ROUTER_MODEL || "oc/mimo-v2.5-free";
const NINE_ROUTER_KEY =
	process.env.NINE_ROUTER_KEY || "sk-286295c6de1aed11-ckqkji-0e3cb76f";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://192.168.1.171:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3-vl:2b-thinking";

if (!imagePath) {
	console.error("LỖI: Thiếu đường dẫn ảnh");
	console.error("Usage: node analyze.mjs <imagePath> [prompt] [--provider=mimo|ollama]");
	process.exit(1);
}

async function getMimeType(filePath) {
	if (filePath.startsWith("http")) return undefined; // auto detect
	const ext = filePath.split(".").pop().toLowerCase();
	const map = {
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		png: "image/png",
		gif: "image/gif",
		webp: "image/webp",
		bmp: "image/bmp",
	};
	return map[ext] || "image/png";
}

async function loadBase64(imagePath) {
	if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
		const resp = await fetch(imagePath);
		if (!resp.ok) throw new Error(`HTTP ${resp.status} khi tải ảnh`);
		const buf = Buffer.from(await resp.arrayBuffer());
		console.error(`📥 Tải từ URL: ${(buf.length / 1024).toFixed(1)} KB`);
		return buf.toString("base64");
	}
	const fs = await import("fs");
	const buf = fs.readFileSync(imagePath);
	console.error(`📂 File local: ${(buf.length / 1024).toFixed(1)} KB`);
	return buf.toString("base64");
}

/** Provider mimo — 9router + oc/mimo-v2.5-free (reasoning model) */
async function analyzeMimo(base64, mime, prompt) {
	const resp = await fetch(`${NINE_ROUTER_URL}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${NINE_ROUTER_KEY}`,
		},
		body: JSON.stringify({
			model: NINE_ROUTER_MODEL,
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: prompt },
						{
							type: "image_url",
							image_url: {
								url: `data:${mime};base64,${base64}`,
							},
						},
					],
				},
			],
			max_tokens: 2048,
		}),
	});
	if (!resp.ok) {
		const text = await resp.text();
		throw new Error(`MIMO HTTP ${resp.status}: ${text.slice(0, 300)}`);
	}
	let raw = await resp.text();
	raw = raw.replace(/data: \[DONE\]\s*$/, "").trim(); // strip SSE tail
	const data = JSON.parse(raw);
	const msg = data.choices?.[0]?.message || {};
	let content = msg.content;
	// MIMO là reasoning model — nếu content rỗng do reasoning chiếm hết budget,
	// in reasoning kèm thông báo (tăng max_tokens nếu cần)
	if (!content && msg.reasoning) {
		content = `(content rỗng — reasoning chiếm hết budget)\n${msg.reasoning}`;
	}
	const usage = data.usage || {};
	console.log(`\n${content}`);
	console.error(`\n---`);
	console.error(
		`⏱ ${usage.total_tokens || "?"} tokens | 💰 cost: ${data.cost || 0} | model: ${data.model || NINE_ROUTER_MODEL}`,
	);
}

/** Provider ollama — qwen3-vl:2b-thinking trên .171 */
async function analyzeOllama(base64, prompt) {
	const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model: OLLAMA_MODEL,
			prompt: prompt,
			images: [base64],
			stream: false,
			options: { temperature: 0.2, num_predict: 2048 },
		}),
	});
	if (!resp.ok) {
		const text = await resp.text();
		throw new Error(`Ollama HTTP ${resp.status}: ${text}`);
	}
	const data = await resp.json();
	console.log("\n" + data.response);
	console.error(`\n---`);
	console.error(
		`⏱ ${(data.total_duration / 1e9).toFixed(2)}s | 📊 ${data.eval_count} tokens output`,
	);
}

async function main() {
	console.error(`📷 Đọc ảnh: ${imagePath}`);
	const base64 = await loadBase64(imagePath);
	console.error(`💬 Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? "..." : ""}`);

	if (provider === "ollama") {
		console.error(`🤖 Provider: ollama (${OLLAMA_MODEL})`);
		return await analyzeOllama(base64, prompt);
	}
	const mime = (await getMimeType(imagePath)) || "image/png";
	console.error(`🤖 Provider: mimo (9router ${NINE_ROUTER_MODEL})`);
	return await analyzeMimo(base64, mime, prompt);
}

main().catch((e) => {
	console.error("❌ LỖI:", e.message);
	process.exit(1);
});
