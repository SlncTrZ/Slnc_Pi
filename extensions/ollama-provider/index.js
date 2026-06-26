/**
 * ollama-provider — Register Ollama provider for PC .171
 *
 * Đăng ký Ollama server tại 192.168.1.171 với các model:
 *   - gemma4:e4B (7.5B, reasoning, 128K context)
 *   - Qwythos:latest (9.2B, qwen35, 1M context)
 *   - qwen3-vl:2b-thinking (2.1B, vision + thinking, 262K context)
 *   - nomic-embed-text:latest (137M, embedding only — không register text)
 *
 * Wing: openclaw | Topic: pi_config | Updated: 2026-06-25
 */

export default function (pi) {
	pi.registerProvider("ollama", {
		name: "Ollama (.171)",
		baseUrl: "http://192.168.1.171:11434/v1",
		apiKey: "ollama",
		api: "openai-completions",
		models: [
			{
				id: "gemma4:e4B",
				name: "Gemma 4 7.5B (reasoning)",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 131072,
				maxTokens: 32768,
				compat: {
					supportsReasoningEffort: true,
					maxTokensField: "max_tokens",
					thinkingFormat: "together",
				},
			},
			{
				id: "Qwythos:latest",
				name: "Qwythos 9.2B (qwen35, 1M ctx)",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 1048576,
				maxTokens: 8192,
				compat: {
					supportsReasoningEffort: false,
					maxTokensField: "max_tokens",
				},
			},
			{
				id: "qwen3-vl:2b-thinking",
				name: "Qwen 3 VL 2.1B (vision + thinking)",
				reasoning: true,
				input: ["text", "image"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 262144,
				maxTokens: 8192,
				compat: {
					supportsReasoningEffort: true,
					maxTokensField: "max_tokens",
					thinkingFormat: "together",
				},
			},
		],
	});
}
