# FEATURE_PLAN.md — TTS Output Summarization

> **TEMPORARY WORKING ARTIFACT** — for AI-to-AI coordination only while this feature is in progress.
> Not durable documentation. Only the user decides when this file is retired.

## Feature Summary

Add a "TTS Output" configuration option to the notification extension with two modes:
- **Verbose** (default) — TTS reads the full assistant output as-is (current behavior).
- **Shortened** — Before TTS, send the output to a user-selected LLM model (chosen from the `/model` list) in a summarization call. TTS reads only the summary.

## Requirements (Confirmed)

1. **Model selection**: User selects a summarizer model from models available via `/model`. Stored as `provider` + `modelId`.
2. **Summarization prompt**: "Summarize the following assistant response as a concise spoken summary, focusing on what was accomplished and key outcomes. Omit code, file paths, tables, and technical details that don't read well aloud. Keep it to 3-5 sentences maximum."
3. **Skip threshold**: If the response is shorter than N sentences (configurable, default 4), pass through as-is even in Shortened mode.
4. **Error handling**: If the summarizer API call fails, show an error notification and skip TTS entirely for that message.
5. **Menu placement**: New top-level "TTS Output" section alongside Mode/Engine/Debug/Status.
6. **Validation**: Manual smoke test only (user will test).

## Relevant Files

| File | Role |
|---|---|
| `extensions/notification/index.ts` | Main extension — TTS queue, `message_end` handler, menu, settings |
| `extensions/notification/menu.ts` | Generic TUI menu component |
| `docs/CONFIG.md` | Configuration reference (must update) |
| `README.md` | Root usage docs (must update) |

## Existing Behavior (TTS path)

1. `message_end` event fires with assistant message
2. `getAssistantText(message)` extracts text from content array
3. `tts.enqueue(text)` → `stripMarkdownForSpeech(text)` → queue
4. `TtsQueue.drain()` → `speakText(text, settings)` → TTS engine playback
5. `tts:start` / `tts:end` events emitted around playback

## Proposed Code Trace

### Settings

Add to `NotificationSettings`:
```ts
type TtsOutputMode = "verbose" | "shortened";

type SummarizerSettings = {
  provider?: string;
  modelId?: string;
  skipThreshold?: number; // sentence count, default 4
};

type NotificationSettings = {
  // ... existing fields
  ttsOutputMode?: TtsOutputMode;
  summarizer?: SummarizerSettings;
};
```

### New function: `summarizeText(text, settings, ctx): Promise<string | null>`

- Resolves the model from `ctx.modelRegistry.find(settings.summarizer.provider, settings.summarizer.modelId)`
- Constructs the appropriate API request based on `model.api`:
  - `anthropic-messages`: POST to `{baseUrl}/v1/messages` with `system` prompt
  - `openai-chat` / `openai-compatible`: POST to `{baseUrl}/v1/chat/completions`
  - Other: fallback to generic openai-chat format
- Resolves API key + headers via `ctx.modelRegistry.getApiKeyAndHeaders(model)`
- Returns the summary text on success, `null` on error (error shown via `ctx.ui.notify`)

### Modified flow in `message_end` handler

```
message_end → getAssistantText → stripMarkdownForSpeech →
  if (settings.ttsOutputMode === "shortened") {
    if (countSentences(text) >= settings.summarizer.skipThreshold) {
      summary = await summarizeText(text, settings, ctx);
      if (summary === null) return; // error already shown, skip TTS
      text = summary;
    }
  }
  → tts.enqueue(text)
```

### Menu tree additions

New top-level item:
```
TTS Output ▸
  ▸ verbose (current)
  shortened
    Select summarizer model … ▸
      [list of available models]
    Set skip threshold … ▸
      [input: number, default 4]
```

### Menu action handlers

- `output:verbose` / `output:shortened` — set mode
- `summarizer:set-model` — open `ctx.ui.select()` with available models
- `summarizer:set-threshold` — inline input for sentence count

## Open Questions / Decisions

- [x] Model selection approach → user-selected from `/model` list
- [x] Summarization prompt → confirmed
- [x] Skip threshold → configurable, default 4 sentences
- [x] Error behavior → error + skip TTS
- [x] Menu placement → "TTS Output" top-level
- [ ] Sentence counting heuristic — simple split on `.!?` + whitespace? Or use a regex?

## Validation Strategy

Manual: Enable Shortened, send prompt that generates table/code output, verify TTS reads a concise summary instead of full output. Also test: short response (<4 sentences) passes through unchanged, error case (no API key for summarizer) shows error and skips.

## Checklist

- [x] Add types + settings fields (`ttsOutputMode`, `summarizer`)
- [x] Add `summarizeText()` function with multi-API support (anthropic-messages, openai-chat)
- [x] Add sentence count helper (`countSentences()`)
- [x] Modify `message_end` handler to call summarizer when Shortened
- [x] Add "TTS Output" to menu tree + action handlers
- [x] Update `docs/CONFIG.md`
- [x] Update `README.md`
- [x] Update `AI_CHANGELOG.md`
- [ ] Manual smoke test (user)
