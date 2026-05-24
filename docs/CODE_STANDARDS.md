# Code Standards

## Purpose
Baseline standards for this pi package repository.

## Package Structure
- Keep installable pi resources organized under conventional directories: `extensions/`, `skills/`, `prompts/`, and `themes/` when needed.
- Declare package resources in `package.json` under the `pi` key.
- Keep temporary AI coordination artifacts under `docs/` and clearly mark them temporary.

## Extensions
- Write extensions in TypeScript.
- Prefer one focused extension per file unless shared helpers are justified.
- Export a default function that receives `ExtensionAPI`.
- Keep extension side effects explicit and minimal at startup.
- Use pi event hooks and APIs instead of shelling out when a first-class API exists.

## Safety And Configuration
- Avoid destructive behavior by default.
- Prefer user-configurable constants at the top of small extensions before introducing complex config systems.
- Do not require global machine changes unless documented and explicitly requested.

## Multi-Agent Checkpoint Workflow
- After committing a shared starting state, create and push a named base tag for all agents to start from.
- Create one branch per agent from the base tag.
- Commit each agent's work on its own branch and push that branch for review.
- Use git worktrees when multiple agent attempts need separate local folders at the same time.
- Keep checkpoint names descriptive, for example `notification-plan-base` and `agent-1-notification`.

Example:

```bash
git tag notification-plan-base
git push origin notification-plan-base
git checkout -B agent-1-notification notification-plan-base
```

## Validation
- Validate extension loading with `pi install ./pi-extensions` or an equivalent local path, then `/reload` after edits.
- For behavior changes, include a manual smoke-check command or flow in the feature plan or README.
