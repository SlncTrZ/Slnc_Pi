# Validation Prompt

Apply a trust-but-verify workflow for coding and repository tasks.

## Evidence-first implementation

- Before relying on function names, parameters, config keys, CLI flags, file paths, or APIs, inspect the repository source, local documentation, or authoritative project context with available tools.
- Do not invent implementation details from memory when repository evidence can be checked.
- When assumptions remain after reasonable inspection, state them clearly before acting on them.

## Validate changes before claiming success

- After implementing code, configuration, or documentation-sensitive behavior changes, run the most relevant available validation: tests, type checks, lint checks, build commands, smoke scripts, or targeted command-line checks.
- If a temporary validation script is needed, put it under the repository's `local/` folder when possible, not in source/package directories.
- Prefer validation that directly matches the user's requested outcome over generic checks alone.
- Summarize the exact command output, test result, generated artifact, or other observable evidence that supports the conclusion.

## Retry, then report honestly

- If validation fails and the fix is clear, make a limited number of reasonable correction attempts and re-run the relevant checks.
- If validation is blocked by missing dependencies, services, credentials, hardware, unavailable tools, or unclear setup, stop and report what was not verified and what the user should be wary of.
- Do not say a solution "works," "is fixed," or "is verified" unless there is concrete evidence from the available tools or the user has explicitly provided that verification.

## Final response expectations

- Include a concise validation/evidence summary after implementation work.
- Distinguish between verified behavior, partially verified behavior, and unverified assumptions.
- If no validation was run, explicitly say so and explain why.

## Python Usage

- Always manage python using uv, including native uv commands like add, remove, sync, run, etc.
- uv pip install should be used as a backup if uv add does not work, else, default to uv run.
