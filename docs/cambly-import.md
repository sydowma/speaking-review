# Cambly Lesson Import

This document describes the experimental workflow for importing Cambly lesson recordings into Speaking Review.

## Goal

Reduce the current manual flow:

```bash
bun run ingest /path/to/recording.mp4
```

into a browser-assisted import flow:

```bash
speaking-review cambly login
speaking-review cambly fetch --limit 10 --analyze
```

The importer should download the user's own Cambly lesson recordings, save them outside the repository, and pass each video into the existing `ingest()` pipeline.

## Current Status

Implemented:

- `speaking-review cambly login`
- `speaking-review cambly list --limit 20`
- `speaking-review cambly fetch --limit 10 --no-analyze`
- `speaking-review cambly fetch --limit 10 --analyze`
- `speaking-review cambly analyze-missing`
- Persistent browser profile under `~/.speaking-review/browser/cambly/`
- Optional Chrome DevTools Protocol attachment via `--cdp-url` / `CAMBLY_CDP_URL`
- Optional OpenCLI Browser Bridge backend via `--opencli-session` / `CAMBLY_OPENCLI_SESSION`
- Download state under `~/.speaking-review/imports/cambly/state.json`
- Optional Cambly provider metadata on `ReviewMeta`

Still intentionally browser-assisted:

- `login` requires the user to log in normally in the opened browser.
- `fetch` without `--url` first asks the logged-in browser session for Cambly's downloadable chat-video list, newest first, then resolves the official video endpoint and saves the video locally.
- `fetch --url <lesson-url>` tries to open the lesson page and click the first visible Download button, but Cambly DOM changes may require selector tuning.

## Constraints

- Do not ask for, store, or commit a Cambly password.
- Do not bypass access controls, DRM, paywalls, or rate limits.
- Use only the user's normal authenticated Cambly session and the official lesson-history download path.
- Store downloaded videos, browser profiles, cookies, and state under `~/.speaking-review/`, never inside the repository.
- Keep the pipeline resumable: a failed transcription or Claude analysis should not require downloading the same video again.

Cambly's public help docs describe the normal manual path as opening the Progress tab, selecting a lesson in Lesson History, and using the Download button for the lesson video. The automation should mirror that user-visible flow instead of relying on private credentials or hard-coded tokens.

## Browser Session Options

By default, Cambly commands use a dedicated Playwright profile:

```bash
speaking-review cambly login
speaking-review cambly fetch --limit 10 --no-analyze
```

That profile is stored at `~/.speaking-review/browser/cambly/`. It does not reuse the user's daily Chrome profile, but it also does not require closing Chrome.

To reuse the user's normal logged-in Chrome without quitting it, use OpenCLI's Browser Bridge extension:

```bash
opencli doctor

speaking-review cambly login --opencli-session cambly
speaking-review cambly list --opencli-session cambly --limit 20
speaking-review cambly fetch --opencli-session cambly --limit 10 --no-analyze
```

In this mode, `speaking-review` delegates browser actions to `opencli browser <session> ...`. The OpenCLI extension runs inside the existing Chrome profile, so Cambly sees the same logged-in session. `fetch` runs an authenticated browser-side request against Cambly's chat-video API, keeps only entries with `hasVideoUrl`, sorts them by lesson time descending, opens the official `/api/chats/<id>/video` endpoint, resolves the playable video source, and saves it into `~/.speaking-review/imports/cambly/videos/`. If the API does not return downloadable candidates, the command falls back to the browser-assisted download capture flow. Signed video URLs are used only in memory and are not printed.

Useful OpenCLI options:

```bash
speaking-review cambly fetch \
  --opencli-session cambly \
  --download-pattern .mp4 \
  --download-timeout 180000 \
  --limit 5 \
  --analyze
```

To attach through Chrome DevTools Protocol, start a separate Chrome instance with remote debugging enabled:

```bash
open -na "Google Chrome" --args \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.speaking-review/browser/cambly-cdp"

speaking-review cambly login --cdp-url http://127.0.0.1:9222
speaking-review cambly fetch --cdp-url http://127.0.0.1:9222 --limit 10 --no-analyze
```

This does not require quitting the user's normal Chrome. It does require logging in once inside the debugging Chrome window, because it uses a separate profile directory.

Reusing the normal Chrome profile is possible only when that profile is not already locked by a running Chrome process:

```bash
speaking-review cambly fetch \
  --channel chrome \
  --profile-dir "$HOME/Library/Application Support/Google/Chrome" \
  --limit 10 \
  --no-analyze
```

On macOS, this usually means Chrome must be fully quit first. A normal already-running Chrome cannot be attached to unless it was originally launched with `--remote-debugging-port`.

## Proposed CLI

```bash
# Opens a persistent local browser profile for Cambly.
# The user logs in manually once.
speaking-review cambly login

# Connects to a remote-debugging Chrome instance.
speaking-review cambly login --cdp-url http://127.0.0.1:9222

# Uses OpenCLI Browser Bridge to reuse a normal logged-in Chrome profile.
speaking-review cambly login --opencli-session cambly

# Lists discoverable lesson recordings without downloading.
speaking-review cambly list --limit 20

# Downloads new videos and runs ingest on each one.
speaking-review cambly fetch --limit 10 --analyze

# Downloads only, useful for debugging.
speaking-review cambly fetch --limit 10 --no-analyze

# Re-runs analysis for already downloaded Cambly videos.
speaking-review cambly analyze-missing
```

## Local Data Layout

```text
~/.speaking-review/
├── browser/
│   └── cambly/                  # Playwright persistent profile; cookies/session only
├── imports/
│   └── cambly/
│       ├── state.json            # lesson ids, download status, review ids
│       └── videos/
│           └── <lesson-id>.mp4
└── reviews/
    └── <uuid>/                   # existing review storage
```

`state.json` should contain operational metadata, not secrets:

```json
{
  "lessons": {
    "cambly-lesson-id": {
      "provider": "cambly",
      "lessonId": "cambly-lesson-id",
      "lessonUrl": "https://www.cambly.com/...",
      "recordedAt": "2026-01-01T12:00:00.000Z",
      "downloadedVideo": "videos/cambly-lesson-id.mp4",
      "reviewId": "review-uuid",
      "status": "analyzed"
    }
  }
}
```

## Metadata Changes

`ReviewMeta` can stay backward-compatible by adding optional provider fields:

```ts
export interface ReviewMeta {
  // existing fields...
  sourceProvider?: "local" | "cambly";
  sourceUrl?: string;
  externalId?: string;
  lessonAt?: string;
  tutorName?: string;
}
```

The existing UI can ignore these fields until it needs provider badges or filters.

## Implementation Shape

Add a provider-specific command module:

```text
cli/src/commands/cambly.ts
cli/src/importers/cambly/browser.ts
cli/src/importers/cambly/state.ts
cli/src/importers/cambly/types.ts
```

Use Playwright with a persistent browser context:

```ts
const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  acceptDownloads: true,
});
```

The first version should be browser-assisted:

1. `login` opens Cambly with a persistent profile.
2. The user logs in normally.
3. `list` opens the Progress / Lesson History page and extracts visible lesson cards.
4. `fetch` opens each lesson, clicks the visible Download button, saves the video, and calls `ingest(videoPath)`.

The implementation should prefer accessible locators and visible UI labels over fragile CSS selectors:

```ts
page.getByRole("link", { name: /progress/i });
page.getByText(/lesson history/i);
page.getByRole("button", { name: /download/i });
```

Because Cambly is a third-party SPA and the DOM can change, the importer should log each navigation step and fail with a clear message when it cannot find the expected UI. It should never silently skip lessons.

## Idempotency

Before downloading or analyzing a lesson:

1. Check `state.json` for `lessonId`.
2. If a video exists and `--force-download` is not set, reuse it.
3. If a `reviewId` exists and `analysis.json` exists, skip analysis unless `--force-analyze` is set.
4. If download succeeds but analysis fails, keep the video and mark the lesson as `downloaded`.

## Error Handling

- If Cambly shows a login screen, print: `Run speaking-review cambly login first`.
- If the Download button is missing, mark the lesson as `not-downloadable` and keep going unless `--strict` is set.
- If ffmpeg, whisper.cpp, or Claude analysis fails, keep state and allow `analyze-missing`.
- Rate-limit downloads with a small delay between lessons.

## Security Notes

- Never support `CAMBLY_PASSWORD` or password CLI flags.
- Do not print cookies, request headers, signed URLs, or download URLs.
- Keep Playwright profile and downloaded videos outside the Git repository.
- Add `~/.speaking-review/` paths to docs only; do not add generated data fixtures from real accounts.

## Testing Strategy

Without a real Cambly account, test the importer in layers:

- Unit-test state transitions using fake lesson metadata.
- Unit-test idempotency around downloaded videos and review ids.
- Add a local HTML fixture that mimics lesson-history cards and download buttons.
- Manually test the real Cambly flow with a throwaway/local browser profile before enabling fully automatic fetching by default.

## Recommended Milestones

1. Add provider metadata fields to `ReviewMeta`.
2. Refactor `ingest()` to accept optional source metadata.
3. Add Cambly state management and tests.
4. Add `cambly login` persistent browser command.
5. Add browser-assisted `cambly fetch --no-analyze`.
6. Wire `cambly fetch --analyze` into the existing ingest pipeline.
7. Add UI provider badges and filtering if useful.
