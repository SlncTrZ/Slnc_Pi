# Code Standards

## Purpose
Baseline standards for this pi package repository.

## Package Structure
- This repository is Jarod's parent pi package, installed as a whole from `JarodMica/jarods-pi-extensions`.
- Keep installable pi resources organized under conventional directories: `extensions/`, `skills/`, `prompts/`, and `themes/` when needed.
- Declare package resources in the root `package.json` under the `pi` key.
- Treat `extensions/` as the source of installable extension packages for this repository, even when an extension began as a vendored or modified copy of an upstream extension.
- Extension documentation should point users to install this parent repository with `pi install .` from the repository root; upstream npm/git install commands may be linked as standalone references only, not presented as the normal install path for this repo.
- Keep temporary AI coordination artifacts under `docs/` and clearly mark them temporary.

## Extensions
- Write extensions in TypeScript.
- Prefer one focused extension per file unless shared helpers are justified.
- Export a default function that receives `ExtensionAPI`.
- Keep extension side effects explicit and minimal at startup.
- Use pi event hooks and APIs instead of shelling out when a first-class API exists.
- When editing a vendored upstream extension, preserve clear upstream attribution while making install, setup, and repository links accurate for Jarod's parent repository.
- Do not leave placeholder clone URLs, generic `YOUR_USERNAME` examples, or primary instructions that install the upstream package instead of this repository.

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
- Validate extension loading from the repository root with `pi install .` or an equivalent local path, then `/reload` after edits.
- For behavior changes, include a manual smoke-check command or flow in the feature plan or README.
