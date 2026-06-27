---
name: local-workflow
description: Use Speaking Review's helper script for local setup, ingestion, Cambly import, UI startup, and routine verification. Use when a user asks how to run the project, import Cambly lessons, review a recording, or reduce manual steps.
---

# Speaking Review local workflow

Prefer the root helper script over spelling out long Bun commands:

```bash
bash scripts/sr help
```

## First-time setup

Use:

```bash
bash scripts/sr setup --with-model
```

This installs missing Homebrew tools when Homebrew is available, runs `bun install`, installs Playwright Chromium, and downloads the default whisper.cpp model. If the user already has a model, `bash scripts/sr setup` is enough.

Then check the machine:

```bash
bash scripts/sr doctor
```

`ANTHROPIC_API_KEY` is required for `review`, `cambly-fetch --analyze`, and `cambly-analyze`.

## Review one recording

```bash
bash scripts/sr review /path/to/recording.mp4
bash scripts/sr ui
```

The review artifacts stay outside the repo under `~/.speaking-review/reviews/` unless `SPEAKING_REVIEW_DATA` is set.

## Cambly import

Default to OpenCLI Browser Bridge so users do not have to quit Chrome:

```bash
bash scripts/sr cambly-login
bash scripts/sr cambly-fetch --limit 1
bash scripts/sr cambly-fetch --limit 5 --analyze
```

The wrapper defaults to:

- `--opencli-session cambly`
- `--history-url https://www.cambly.com/en/student/progress/past-lessons`
- `--limit 1`
- `--no-analyze`

Never print Cambly signed video URLs, JWTs, cookies, or account identifiers. The importer should use the logged-in browser session and keep signed URLs in memory only.

## Verification

For shell/documentation changes:

```bash
bash scripts/sr doctor
git diff --check
```

For TypeScript changes:

```bash
bunx tsc -p tsconfig.json --noEmit
bun run build:web
```
