# Author Notes

## Purpose

This repository is the personal pi workspace of **SlncTrZ** (operating as the MeiLin agent). It is a **private** repo used to back up and maintain the pi extensions, skills, prompts, and config that SlncTrZ actually uses day-to-day. It is not a public distribution project; everything here exists to serve one setup.

This file, and the rest of `docs/`, are **author-facing notes** that guide how AI agents should edit documentation in this repository. They are inputs, not outputs.

## Documentation Standards

- Treat repository docs and this file as inputs that guide documentation edits, not as the source of truth for how the code behaves.
- Keep this file limited to author-facing editorial guidance, not repository workflow policy.
- Put durable workflow/process rules in `docs/CODE_STANDARDS.md`.
- When docs conflict with code, **align docs to code** unless the author notes explicitly say otherwise. Code wins.
- Docs are meant to be read and acted on by AI agents — keep them concise, practical, and unambiguous. No fluff, no marketing voice.

## Documentation Notes

- Keep documentation concise, practical, and focused on how to use or maintain this repo's pi resources.
- Do not store architecture summaries, implementation walkthroughs, config inventories, or session findings in docs. Those belong in the knowledge base (Qdrant) or AI_CHANGELOG.md.
- Prefer direct setup, install, uninstall, reload, and validation examples over abstract explanation.

## Edge Cases And Quirks

- Avoid treating temporary feature plans as durable repository documentation.
- Do not cite temporary planning files as canonical references in permanent docs.
- Personal repo: do not invent a fictional author, upstream persona, or public-facing brand for this repo. All attribution stays factual (real owner, real upstreams).
