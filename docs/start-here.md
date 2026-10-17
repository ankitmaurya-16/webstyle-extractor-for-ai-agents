# WebStyle Extractor for AI Agents: Design Docs for Claude Code

Oct 18, 2026 · @Ankit

## What this is

This doc is the full spec Claude Code needs to build WebStyle Extractor for AI Agents: a free, open-source Chrome extension that turns a live website into a DESIGN.md and token files an AI coding agent can follow. Each tab is one file for the repo, and together they settle the decisions the agent would otherwise make for you.

Decisions locked in (full log in product-brief.md):

- Free and open source under the MIT license, with no paid tier
- React for the side panel, built with WXT and TypeScript
- Dark developer-tool look, dark theme only in v1
- Semantic token names plus numeric scales (text, primary, gray-100 to gray-900)
- Both Tailwind v4 and v3 exports, everything runs locally

## File map

| Tab | Save as | What it answers |
| --- | --- | --- |
| CLAUDE.md | /CLAUDE.md | Rules Claude Code reads at the start of every session |
| product-brief.md | /docs/product-brief.md | What, who, features, not-building list, decisions |
| user-flows.md | /docs/user-flows.md | Steps and acceptance criteria for every feature |
| architecture.md | /docs/architecture.md | Components, stack, permissions, manifest |
| data-model.md | /docs/data-model.md | Entities, types, storage schema |
| api.md | /docs/api.md | Message contracts, module APIs, error codes, export formats |
| sequences.md | /docs/sequences.md | Who sends what to whom, in order, including failures |
| ui.md | /docs/ui.md | Panel design system, screens and states |
| non-functional.md | /docs/non-functional.md | Security, privacy, performance, accessibility, edge cases |
| conventions.md | /docs/conventions.md | Folder layout, code style, commands, tests, git |
| milestones.md | /docs/milestones.md | Build order, one milestone per session |

## How to hand it to Claude Code

1. Create an empty repo folder and save each tab as Markdown at the path in the file map.
2. Open Claude Code in that folder. It reads CLAUDE.md automatically at the start of every session.
3. Press Shift+Tab twice to enter plan mode, then paste the M0 prompt from milestones.md.
4. Check the plan against these docs, correct anything that drifts, then let it build.
5. Run the milestone's tests, tick its acceptance criteria, and commit.
6. Repeat for M1 to M7, one milestone per session. When you change your mind, edit the doc first so the next session does not undo it.
