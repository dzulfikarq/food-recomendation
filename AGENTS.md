# Agent Instructions

These instructions apply to all agentic work in this repository, including FoodRec V2, the recommendation engine, UX work, tests, and documentation.

## Git Workflow & Commit Policy

- Use atomic commits with Conventional Commits. Keep each commit focused on one logical, reviewable change; do not bundle a large feature into one commit.
- Supported types: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`, and `perf`. Write short, descriptive commit messages in English, for example: `feat(engine): implement cosine similarity`.
- Before work, inspect `git status` and identify pre-existing changes. Preserve them. Never stage or commit unrelated user changes without explicit approval.
- Split substantial work into logical units. For each unit, implement the smallest complete change, run relevant checks, review its staged diff, then commit before starting the next unit. Do not split trivial changes artificially.
- Stage explicit paths only. Review the staged diff and check for secrets, credentials, `.env` files, database dumps, or sensitive data before every commit.
- Commit only code that is complete and leaves the repository consistent. Do not create empty, pointless, or knowingly broken commits.
- Do not change Git author identity or manipulate commit timestamps. Do not amend commits, squash work, or rewrite existing history unless the user explicitly instructs it.
- Never push automatically. Push only after explicit user authorization.
- At task completion, report completed work, new commit count and short SHAs/messages, checks run, remaining uncommitted changes, working-tree status, and whether changes were pushed.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
