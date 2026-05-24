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

## Validation
- Validate extension loading with `pi install ./pi-extensions` or an equivalent local path, then `/reload` after edits.
- For behavior changes, include a manual smoke-check command or flow in the feature plan or README.
