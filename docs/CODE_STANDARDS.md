# Code Standards

## Purpose

Baseline standards for this pi package repository (SlncTrZ's personal Slnc_Pi repo). All new code, docs, and edits should conform to these rules.

## Package Structure

- This repository is a single private pi package, installable as a whole with `pi install .` from the repository root.
- Keep installable pi resources organized under conventional directories: `extensions/`, `skills/`, `prompts/`, and `themes/` when needed.
- Declare package resources in the root `package.json` under the `pi` key (e.g. `pi.skills`, `pi.prompts`, `pi.extensions` pointing at the local directories).
- Treat `extensions/` as the source of installable extension packages for this repository, even when an extension began as a vendored or modified copy of an upstream extension.
- Extension documentation should point users to install this repository with `pi install .` from the repository root; upstream npm/git install commands may be linked as standalone references only, not presented as the normal install path for this repo.
- Each extension directory under `extensions/` should include its own `README.md` with extension-specific usage, setup, commands, configuration, and troubleshooting details.
- Keep the root `README.md` focused on repository-level install/orientation and link to per-extension READMEs instead of duplicating detailed extension usage.
- Keep temporary AI coordination artifacts under `docs/` and clearly mark them temporary.

## Extensions

- Write extensions in TypeScript.
- Prefer one focused extension per file unless shared helpers are justified.
- Export a default function that receives `ExtensionAPI`.
- Keep extension side effects explicit and minimal at startup.
- Use pi event hooks and APIs instead of shelling out when a first-class API exists.
- When editing a vendored upstream extension, preserve clear upstream attribution while making install, setup, and repository links accurate for this repo.
- Extensions vendored from upstream must keep their original attribution in their own README (original author/source link). Never strip it.
- Do not leave placeholder clone URLs, generic `YOUR_USERNAME` examples, or primary instructions that install the upstream package instead of this repository.

## Safety And Configuration

- Avoid destructive behavior by default.
- Prefer user-configurable constants at the top of small extensions before introducing complex config systems.
- Do not require global machine changes unless documented and explicitly requested.

## Validation

- Validate extension loading from the repository root with `pi install .` or an equivalent local path, then `/reload` after edits.
- For behavior changes, include a manual smoke-check command or flow in the feature plan or README.
