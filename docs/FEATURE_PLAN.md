# FEATURE_PLAN.md — System Prompt Profile Extension

> **TEMPORARY WORKING ARTIFACT** — for AI-to-AI coordination only while this feature is in progress.
> It is not durable project documentation, must not be cited as canonical reference, and must not be used as a source for other docs.
> Only the user may decide when this file can be retired or removed.

## Feature Summary

Add a standalone Pi extension that can append a selectable system-prompt profile to Pi's default prompt. The first profile is `validation-prompt`, focused on trust-but-verify behavior: inspect docs/source before assuming APIs, validate implemented changes with command output or test results, and clearly report unverified work.

## Confirmed Requirements

1. The behavior applies only when this extension is installed/enabled.
2. The extension's selected mode/profile persists across Pi restarts.
3. The extension uses append-only prompt text; it does not replace Pi's default prompt.
4. Prompt content lives in Markdown files and should not break the TypeScript/JavaScript extension code.
5. `/system-prompt` opens a tree-style menu with only:
   - `Default` — no prompt profile appended.
   - `Custom` — choose from built-in profiles in this extension's own `prompts/` folder.
6. Only one built-in custom profile is needed initially: `validation-prompt`.
7. Profile discovery is limited to this extension's `prompts/` folder.
8. The validation prompt should instruct the model to:
   - run tests/validation after code changes when possible;
   - use the repository `local/` folder for temporary test scripts when it needs scripts for validation;
   - prefer repository documentation/source evidence over assumed function names, parameters, config keys, or CLI flags;
   - summarize command output/test results as evidence;
   - retry validation/fixes a few times when reasonable;
   - report what remains untested/unverified when validation is blocked or incomplete.
9. One validation behavior mode is enough; no strictness levels yet.
10. Implement as its own extension directory under `extensions/system-prompt/`.

## Relevant Existing Files And Patterns

| File | Role |
|---|---|
| `package.json` | Root pi package manifest discovers `./extensions`, `./skills`, and `./prompts`. |
| `README.md` | Root repository overview and extension list. Should link the new extension once implemented. |
| `docs/CODE_STANDARDS.md` | Requires TypeScript extensions, per-extension README, minimal startup side effects, and validation notes. |
| `extensions/notification/package.json` | Simple extension package pattern with `pi.extensions: ["./index.ts"]`. |
| `extensions/notification/menu.ts` | Reusable tree-menu implementation pattern for extension commands. |
| Pi docs `docs/extensions.md` | Confirms `before_agent_start` can modify the system prompt and `event.systemPromptOptions` exposes prompt build inputs. |

## Existing Behavior Relevant To This Feature

Pi builds its default system prompt dynamically. Extensions can hook `before_agent_start` after a user prompt is submitted and return a replacement `systemPrompt`. For append-only behavior, this extension should return `event.systemPrompt + "\n\n" + selectedProfileContent` when custom mode is active.

## Proposed Code Trace

1. Pi loads this repository as a pi package via root `package.json`.
2. Pi discovers `extensions/system-prompt/package.json` under `./extensions`.
3. That package registers `./index.ts` as an extension.
4. `index.ts` startup:
   - loads persisted settings from `join(getAgentDir(), "system-prompt.json")`;
   - discovers Markdown profiles from `extensions/system-prompt/prompts/*.md`;
   - registers `/system-prompt` command;
   - registers `before_agent_start` hook.
5. User runs `/system-prompt`:
   - extension opens a tree menu;
   - user selects `Default` or `Custom > validation-prompt`;
   - selection is saved to `system-prompt.json`.
6. On each agent turn:
   - if mode is `default`, return `undefined` and leave Pi's prompt unchanged;
   - if mode is `custom` and a valid profile is selected, read/use the Markdown content and return an appended `systemPrompt`.

## Proposed Files

```text
extensions/system-prompt/
├── README.md
├── index.ts
├── menu.ts                # optional copy/adaptation of existing tree menu, unless shared utility is introduced
├── package.json
└── prompts/
    └── validation-prompt.md
```

## Validation Strategy

- Static/compile validation from repository root, likely `npx tsc --noEmit` if the repo TypeScript config covers the new extension.
  - Result: full root `npx tsc --noEmit` is currently blocked by pre-existing `pi-mcp-adapter` TypeScript/test dependency issues and missing local Pi peer dependency declarations.
  - Result: targeted validation for `extensions/system-prompt/**/*.ts` passed using a temporary local tsconfig with paths to the globally installed Pi type declarations.
- Smoke validation with Pi:
  - install/load from repository root via `pi install .` or equivalent local path;
  - run `/reload`;
  - run `/system-prompt`;
  - select `Custom > validation-prompt`;
  - ask a small code-change task and verify the prompt is appended by observing behavior or using exported/system-prompt display if available.
- If runtime Pi validation cannot be completed by the agent, report it explicitly as unverified and provide the manual flow.

## Resolved Questions

1. Tree menu code should be copied/adapted into the new extension for now.
2. Profile Markdown should be loaded once at startup/reload; users should run `/reload` after editing prompt files during a session.
3. Settings should store `mode` plus `profileId` using the filename stem, leaving room for future profile metadata.
4. Command name is exactly `/system-prompt`.

## Checklist

- [x] Resolve open questions.
- [x] Add `extensions/system-prompt/package.json`.
- [x] Add `extensions/system-prompt/index.ts`.
- [x] Add tree menu support.
- [x] Add `extensions/system-prompt/prompts/validation-prompt.md`.
- [x] Add `extensions/system-prompt/README.md`.
- [x] Update root `README.md` extension table and structure.
- [x] Validate TypeScript for the new extension with a targeted temporary `local/tsconfig.system-prompt.json` that maps Pi's globally installed type declarations: `npx tsc --noEmit -p local/tsconfig.system-prompt.json` passed.
- [x] Record changes in `AI_CHANGELOG.md`.
