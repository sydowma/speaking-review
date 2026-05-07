# Repository Guidelines

## Project Structure & Module Organization

This Bun/TypeScript monorepo has four workspaces:

- `shared/`: TypeScript types used by CLI, server, and web.
- `cli/`: ingestion/sync CLI; commands are in `cli/src/commands/`, pipeline code in `cli/src/pipeline/`.
- `server/`: Bun HTTP API and static server; handlers are in `server/src/handlers/`.
- `web/`: Vite + React UI; routes, components, and utilities live under `web/src/`.

Deployment assets are in `deploy/`; container setup is in `Dockerfile`. Review data stays outside the repo at `~/.speaking-review/reviews/<uuid>/` unless `SPEAKING_REVIEW_DATA` is set.

## Build, Test, and Development Commands

- `bun install`: install all workspace dependencies from `bun.lock`.
- `bun run dev`: start the server and Vite app together.
- `bun run dev:server`: run the server in watch mode.
- `bun run dev:web`: run only Vite.
- `bun run ingest /path/to/recording.mp4`: run ffmpeg, whisper.cpp, and Claude analysis.
- `bun run list`: list stored reviews.
- `bun run sync <id> --to <url>`: upload a review to a remote server.
- `bun run build:web`: type-check and build the web app.
- `bun run start`: start the server without watch mode.

## Coding Style & Naming Conventions

Use strict TypeScript and ES modules. Keep explicit `.ts`/`.tsx` import extensions. Use two-space indentation, double quotes, semicolons, and trailing commas in multiline blocks. Keep commands in `cli/src/commands/`, route handlers in `server/src/handlers/`, and shared contracts in `shared/`.

React components and route files use `PascalCase` filenames, for example `ReviewDetailPage.tsx` and `VoicePicker.tsx`. Utility modules use `camelCase`, such as `reviewApi.ts`.

## Testing Guidelines

There is no dedicated test suite or coverage threshold yet. Before submitting changes, run `bun run build:web` and manually exercise affected flows with `bun run dev`. For CLI or server changes, validate the relevant command or endpoint. If adding tests, place them near the code as `*.test.ts` or `*.test.tsx` and prefer Bun-compatible tests.

## Commit & Pull Request Guidelines

Git history uses Conventional Commits style, for example `feat: initial speaking-review monorepo (CLI + server + web)`. Continue with concise prefixes such as `feat:`, `fix:`, `docs:`, and `refactor:`.

Pull requests should include a description, affected workspace(s), verification commands, and screenshots for visible web UI changes. Link related issues and call out environment or deployment impact.

## Security & Configuration Tips

Do not commit secrets. Keep API keys and tokens in local environment files or shell exports, including `ANTHROPIC_API_KEY` and `SPEAKING_REVIEW_TOKEN`. Treat review audio and transcripts as personal data; avoid committing generated review files.
