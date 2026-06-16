#!/usr/bin/env node
/**
 * Vision Analyzer — Phân tích ảnh qua Ollama qwen3-vl:2b-thinking
 *
 * Wing: code_chronicles | Topic: skill | Updated: 2026-06-15
 *
 * Usage:
 *   node analyze.mjs <imagePath> [prompt]
 *
 * Examples:
 *   node analyze.mjs K:/Meilin/idle/idle1.png
 *   node analyze.mjs K:/Meilin/idle/idle1.png "Mô tả chi tiết bức ảnh này"
 *   node analyze.mjs https://example.com/photo.jpg "Đọc chữ trong ảnh"
 */

const [imagePath, ...promptParts] = process.argv.slice(2);
const prompt = promptParts.join(" ") || "Mô tả chi tiết nội dung bức ảnh này";

if (!imagePath) {
	console.error("LỖI: Thiếu đường dẫn ảnh");
	console.error("Usage: node analyze.mjs <imagePath> [prompt]");
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

async function main() {
	console.error(`📷 Đọc ảnh: ${imagePath}`);

	// Step 1: Đọc ảnh → base64
	let base64;
	if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
		const resp = await fetch(imagePath);
		if (!resp.ok) throw new Error(`HTTP ${resp.status} khi tải ảnh`);
		const buf = Buffer.from(await resp.arrayBuffer());
		base64 = buf.toString("base64");
		console.error(`📥 Tải từ URL: ${(buf.length / 1024).toFixed(1)} KB`);
	} else {
		const fs = await import("fs");
		const buf = fs.readFileSync(imagePath);
		base64 = buf.toString("base64");
		console.error(`📂 File local: ${(buf.length / 1024).toFixed(1)} KB`);
	}

	// Step 2: Gửi Ollama
	console.error(`🤖 Gửi lên qwen3-vl:2b-thinking...`);
	console.error(
		`💬 Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? "..." : ""}`,
	);

	const resp = await fetch("http://192.168.1.171:11434/api/generate", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model: "qwen3-vl:2b-thinking",
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

	// Step 3: Output
	console.log("\n" + data.response);
	console.error(`\n---`);
	console.error(
		`⏱ ${(data.total_duration / 1e9).toFixed(2)}s | 📊 ${data.eval_count} tokens output`,
	);
}

main().catch((e) => {
	console.error("❌ LỖI:", e.message);
	process.exit(1);
});
