# speaking-review

Local tool for reviewing English speaking practice recordings (Cambly, mock interviews, etc.). Transcribes via whisper.cpp, analyzes with Claude, presents an interactive review UI with synchronized audio + transcript + issue feedback + native TTS for corrections + a flashcard-style practice mode.

## Architecture

- **`shared/`** — TypeScript types shared between CLI, Server, and Web.
- **`cli/`** — Bun CLI: pipeline (ffmpeg → whisper-cpp → Claude). Stays on your Mac.
- **`server/`** — Bun HTTP server: serves API + static SPA. Runs locally in dev, deployable to a VPS for cross-device use.
- **`web/`** — Vite + React UI: waveform, transcript, issues, practice mode.

Reviews are stored at `~/.speaking-review/reviews/<uuid>/` (or `$SPEAKING_REVIEW_DATA` if set).

## Prerequisites

```bash
brew install ffmpeg whisper-cpp bun
# whisper model (one-time, ~3GB)
mkdir -p ~/whisper-models
curl -L -o ~/whisper-models/ggml-large-v3.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
export ANTHROPIC_API_KEY="your-anthropic-api-key"
```

## Local usage

```bash
bun install
bun run ingest /path/to/recording.mp4   # ~3 min: ffmpeg + whisper + Claude
bun run dev                              # starts server + web in parallel
# open http://localhost:5173
```

## Cross-device / deployment

See [`deploy/README.md`](deploy/README.md) for VPS deployment with Docker or systemd, Caddy reverse proxy, and `speaking-review sync` to push reviews from your Mac to the deployed server.

## License

Apache-2.0
