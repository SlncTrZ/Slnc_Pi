/**
 * ollama-provider — Register Ollama provider for PC .171
 *
 * Đăng ký Ollama server tại 192.168.1.171 với các model:
 *   - gemma4:e4B (reasoning, 128K context)
 *   - nomic-embed-text (embedding)
 *   - qwen3-vl:2b-thinking (vision)
 *
 * Wing: openclaw | Topic: pi_config | Updated: 2026-06-16
 */

export default function (pi) {
  pi.registerProvider("ollama", {
    name: "Ollama (.171)",
    baseUrl: "http://192.168.1.171:11434/v1",
    apiKey: "ollama",
    api: "openai-completions",
    models: [{
      id: "gemma4:e4B",
      name: "Gemma 4 7.5B",
      reasoning: true,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 131072,
      maxTokens: 32768,
      compat: {
        supportsReasoningEffort: true,
        maxTokensField: "max_tokens",
        thinkingFormat: "together"
      }
    }]
  });
}
