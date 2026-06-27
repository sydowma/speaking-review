# Speaking Review - AI English Speaking Review Tool

[English](README.md) | [简体中文](README.zh-CN.md)

![Speaking Review AI English speaking feedback dashboard](docs/images/speaking-review-hero.png)

Speaking Review is a self-hosted AI English speaking feedback tool for reviewing recorded practice sessions, IELTS speaking drills, Cambly lessons, and mock interviews. It transcribes audio with whisper.cpp, analyzes speaking issues with Claude or Codex CLI, and gives you an interactive review UI with synchronized audio, transcript, correction suggestions, native TTS, and flashcard-style practice.

It is designed for learners who want a private, local-first workflow for improving spoken English without uploading raw review data to a hosted SaaS product.

## Features

- **AI speaking feedback**: grammar, vocabulary, fluency, coherence, filler words, and phrase-level corrections.
- **Speech-to-text transcription**: local whisper.cpp pipeline for turning practice recordings into timestamped transcript segments.
- **Interactive review UI**: waveform playback, synchronized transcript, issue navigation, and correction cards.
- **Targeted practice mode**: replay corrections with native browser text-to-speech and track review progress.
- **Experimental Cambly import**: reuse an authenticated Chrome session to fetch downloadable Cambly lesson videos, newest first, then analyze them with the same pipeline.
- **Local-first storage**: review data stays under `~/.speaking-review/reviews/<uuid>/` unless you configure a different data directory.
- **Self-hosted sharing**: optional Bun server deployment for reviewing recordings across devices.

## Use Cases

- IELTS speaking practice review
- English mock interview feedback
- Cambly or online tutor lesson review
- Spoken English fluency analysis
- Local AI language-learning workflow
- Self-hosted speech review dashboard

## Architecture

- **`shared/`** — TypeScript types shared between CLI, Server, and Web.
- **`cli/`** — Bun CLI: pipeline (ffmpeg → whisper-cpp → Claude). Stays on your Mac.
- **`server/`** — Bun HTTP server: serves API + static SPA. Runs locally in dev, deployable to a VPS for cross-device use.
- **`web/`** — Vite + React UI: waveform, transcript, issues, practice mode.

## Tech Stack

- Bun + TypeScript monorepo
- whisper.cpp for local speech recognition
- Claude via Anthropic API for speaking analysis
- React + Vite web app
- Bun HTTP server for API and static hosting
- ffmpeg for audio extraction

## Prerequisites

```bash
bash scripts/sr setup --with-model
export SPEAKING_REVIEW_ANALYZER=codex
# or: export ANTHROPIC_API_KEY="your-anthropic-api-key"
```

`setup --with-model` installs the local toolchain, runs `bun install`, installs Playwright Chromium, and downloads the default whisper.cpp model. Run `bash scripts/sr doctor` to check the machine before ingesting recordings.

## Local Usage

```bash
bash scripts/sr review /path/to/recording.mp4
bash scripts/sr ui
# open http://localhost:5173
```

Reviews are stored at `~/.speaking-review/reviews/<uuid>/` (or `$SPEAKING_REVIEW_DATA` if set).

Useful shortcuts:

```bash
bash scripts/sr list
bash scripts/sr sync <review-id> --to https://your-server.example
bun run doctor
bun run review /path/to/recording.mp4
bun run ui
```

## Cambly Import

Speaking Review can import your own Cambly lesson history through a browser-assisted workflow. The OpenCLI Browser Bridge path reuses your already logged-in Chrome session, reads Cambly's newest lesson records from the past-lessons page, saves official lesson transcripts outside the repository, and analyzes them with Codex CLI by default when no Anthropic key is configured.

```bash
opencli doctor
export SPEAKING_REVIEW_ANALYZER=codex
bash scripts/sr cambly-loop --once --date 2026-06-27
bash scripts/sr cambly-loop --interval 15m
```

`cambly-loop` enables analysis by default, checks today's lessons unless you pass `--date`, `--since`, or `--all-history`, and writes transcript-only review reports when Cambly exposes transcript data before a downloadable video. `cambly-fetch` is still available for older downloadable chat videos. Signed video URLs are kept in memory only; Cambly passwords and tokens are not stored by this project. See [`docs/cambly-import.md`](docs/cambly-import.md) for setup notes, CDP fallback, and troubleshooting.

## Cross-Device Deployment

See [`deploy/README.md`](deploy/README.md) for VPS deployment with Docker or systemd, Caddy reverse proxy, and `speaking-review sync` to push reviews from your Mac to the deployed server.

## Privacy Notes

- Raw recordings, transcripts, and analysis files are stored outside the repository by default.
- The server only protects remote access when `SPEAKING_REVIEW_TOKEN` is configured.
- Do not commit generated review data, audio files, transcripts, or local environment files.

## License

Apache-2.0. See [`LICENSE`](LICENSE).
