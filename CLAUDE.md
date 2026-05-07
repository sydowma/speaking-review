# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

@AGENTS.md — repo structure, scripts, style conventions, commit style, and security tips. Treat it as the primary reference; everything below adds Claude-specific rules.

## Runtime: Bun only

- Never run `npm`, `yarn`, `pnpm`, `npx`. Use `bun` and `bun run` (and `bunx` if needed).
- Never edit `bun.lock` by hand. Mutate dependencies via `bun add` / `bun remove` only.
- Prefer Bun APIs (`Bun.serve`, `Bun.file`, `Bun.$`, etc.) over Node polyfills in `server/` and `cli/`.

## Tests

When adding features, write tests using Bun's built-in runner. Place them next to the code as `*.test.ts` / `*.test.tsx` and run with `bun test`. The repo currently has no test suite — start the practice when you touch a file.

## Imports

- ES modules with explicit `.ts` / `.tsx` extensions (TypeScript strict mode, `noUncheckedIndexedAccess` is on).
- Path alias `@shared/*` resolves to `./shared/*`. Use it instead of relative paths into `shared/`.

## Pipeline gotchas (cli/)

The `bun run ingest` flow shells out to external tools — these are not npm deps:

- `ffmpeg` must be on `PATH` (install via `brew install ffmpeg`).
- `whisper.cpp` binary must be on `PATH` and the model file at `~/whisper-models/ggml-large-v3.bin` (~3 GB).
- `ANTHROPIC_API_KEY` must be set in the environment for Claude analysis.

Review data is written to `~/.speaking-review/reviews/<uuid>/` unless `$SPEAKING_REVIEW_DATA` overrides it. Don't commit anything from that directory.

## Server auth

The server gates requests with `SPEAKING_REVIEW_TOKEN` (a random hex string set in the deploy environment). The web app captures it from `?token=...` on first visit and stores it in `localStorage`. When changing auth code in `server/src/auth.ts`, keep both the URL-token bootstrap and the bearer-token API path working.

## Cross-workspace changes

A new feature often spans all four workspaces: define the contract in `shared/`, add the handler in `server/src/handlers/`, expose a client in `web/src/lib/`, and wire the UI in `web/src/routes/` or `web/src/components/`. Keep types in `shared/` so the CLI, server, and web stay in sync. The `/new-endpoint` skill walks through this flow.

## Subdirectory CLAUDE.md

For workspace-specific rules (e.g., `web/CLAUDE.md` with React 19 / Tailwind 4 conventions), add a CLAUDE.md inside that workspace and it will load automatically when Claude works there.
