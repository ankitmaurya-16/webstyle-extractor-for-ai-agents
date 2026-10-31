# WebStyle Extractor for AI Agents: Design Docs for Claude Code

Oct 18, 2026 · @Ankit · updated for v2 Oct 31, 2026

## What this is

These docs are the full spec Claude Code needs to build and change WebStyle Extractor for AI Agents: a free, open-source Chrome extension (with a Firefox build and a headless CLI) that turns a live website into a DESIGN.md and token files an AI coding agent can follow. Each file settles the decisions the agent would otherwise make for you.

Decisions locked in (full log in product-brief.md):

- Free and open source under the MIT license, with no paid tier
- React for the side panel, built with WXT, in JavaScript (not TypeScript)
- Developer-tool look in dark and light themes, following the system by default
- Semantic token names plus numeric scales (text, primary, gray-100 to gray-900), with the site's own variable names when they match
- Tailwind v4 and v3 among 13 export formats; the extension runs entirely locally, and only the separate CLI loads pages

## File map

| File | Path | What it answers |
| --- | --- | --- |
| CLAUDE.md | /CLAUDE.md | Rules Claude Code reads at the start of every session |
| product-brief.md | /docs/product-brief.md | What, who, features, not-building list, decisions |
| v2-spec.md | /docs/v2-spec.md | Every v2 feature (F9 to F44) with acceptance criteria, and milestones M8 to M21 |
| user-flows.md | /docs/user-flows.md | Steps and acceptance criteria for every feature |
| architecture.md | /docs/architecture.md | Components, stack, permissions, manifest, deviations from the v2 spec |
| data-model.md | /docs/data-model.md | Entities, types, storage schema, migration |
| api.md | /docs/api.md | Message contracts, module APIs, error codes, export formats and the file map |
| sequences.md | /docs/sequences.md | Who sends what to whom, in order, including failures and cleanup |
| ui.md | /docs/ui.md | Panel design system, screens and states |
| non-functional.md | /docs/non-functional.md | Security, privacy, performance, accessibility, edge cases |
| conventions.md | /docs/conventions.md | Folder layout, code style, commands, tests, git |
| milestones.md | /docs/milestones.md | Build order, one milestone per session |
| store-listing.md | /docs/store-listing.md | Store text and permission justifications |

## How to hand it to Claude Code

1. Open Claude Code in the repo. It reads CLAUDE.md automatically at the start of every session.
2. Press Shift+Tab twice to enter plan mode, then paste the prompt for the next milestone (milestones.md for M0 to M7, v2-spec.md section 12.1 for M8 to M21).
3. Check the plan against these docs, correct anything that drifts, then let it build.
4. Run the milestone's tests, tick its acceptance criteria, and commit.
5. Repeat, one milestone per session. When you change your mind, edit the doc first so the next session does not undo it.
