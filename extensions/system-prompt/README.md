# System Prompt Extension

Append selectable Markdown prompt profiles to Pi's default dynamic system prompt.

This extension is intentionally append-only: it keeps Pi's built-in tool, docs, context-file, and skills instructions intact, then adds the selected profile text at runtime.

## Install

Install this parent repository from the repository root:

```bash
pi install .
```

Then start pi, or run `/reload` if pi is already running.

## Command

```text
/system-prompt
```

Opens an interactive tree menu:

```text
Default
Custom
  Validation Prompt
```

- **Default**: leaves Pi's system prompt unchanged.
- **Custom > Validation Prompt**: appends `prompts/validation-prompt.md` to Pi's default prompt.

Selections are persisted globally in:

```text
~/.pi/agent/system-prompt.json
```

## Profiles

Profiles are Markdown files loaded from this extension's own `prompts/` directory at extension startup/reload.

Current profile:

| Profile | File | Purpose |
|---|---|---|
| Validation Prompt | `prompts/validation-prompt.md` | Encourages trust-but-verify behavior: inspect source/docs before assuming APIs, run validation after changes when possible, use `local/` for temporary validation scripts, and clearly report evidence or unverified work. |

If you edit or add files under `prompts/` while pi is running, run:

```text
/reload
```

## Behavior Notes

The validation profile asks the model to:

- verify function names, parameters, config keys, CLI flags, and APIs against local source/docs when possible;
- run relevant tests, builds, type checks, lint checks, or smoke checks after implementation work;
- place temporary validation scripts under `local/` when scripts are needed;
- summarize command output or test results as evidence;
- retry a few reasonable fixes when validation fails;
- explicitly state what was not tested or could not be verified.

This extension cannot guarantee model compliance. It only adds instructions to the prompt. The model's ability to validate still depends on available tools, dependencies, services, credentials, and the local environment.
