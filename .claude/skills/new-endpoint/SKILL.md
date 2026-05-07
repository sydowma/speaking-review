---
name: new-endpoint
description: Add a new server endpoint that crosses the shared/server/web workspaces. Use when adding a feature that needs a new HTTP route plus a typed web client call. Walks through the type contract, handler, auth gate, client function, and route wiring in the right order.
---

# Adding a new endpoint

This monorepo has four workspaces: `shared/` (types), `cli/`, `server/`, `web/`. A new endpoint usually touches three of them. Follow this order so types stay aligned and you don't have to circle back.

## 1. Define the contract in `shared/`

Add the request/response types to `shared/types.ts` (or a topic-specific file imported from there). Export them as named types so server handlers and web clients can both import via the `@shared/*` alias.

Decide upfront:
- HTTP method and path (`/api/<resource>` or `/api/<resource>/<action>`).
- Whether the route is auth-gated (almost always yes — see step 3).
- What lives in `meta.json` vs the response payload, if it relates to a review.

## 2. Add the handler in `server/src/handlers/`

Existing handlers: `audio.ts`, `practice.ts`, `reviews.ts`, `shared.ts`, `sync.ts`. Either extend one or add a new file and register the route in `server/src/index.ts`.

Use `Bun.serve` patterns. Read with `Bun.file`, write with `Bun.write`. Validate request bodies before touching disk. Return typed JSON that matches the `shared/` contract.

Persist review-shaped data under `~/.speaking-review/reviews/<uuid>/` (or `$SPEAKING_REVIEW_DATA` override). Mirror the layout used by existing handlers — `meta.json`, `analysis.json`, `audio.wav`, `practice.json`.

## 3. Wire auth in `server/src/auth.ts`

Most endpoints require the bearer-token check (`SPEAKING_REVIEW_TOKEN`). The web app sends it as `Authorization: Bearer <token>` after bootstrapping from `?token=...`. Add the new route to whatever auth gate the existing handlers use — don't invent a parallel mechanism.

If the endpoint is intentionally public (rare), document why in a code comment.

## 4. Add the web client function in `web/src/lib/`

Look at `web/src/lib/reviewApi.ts` for the pattern. Use `fetch`, attach the bearer token from `localStorage`, parse the typed response, and surface errors as thrown values rather than swallowed.

Import the request/response types from `@shared/...` so a type drift in step 1 fails the build here.

## 5. Wire the UI in `web/src/routes/` or `web/src/components/`

Call the new client function from the relevant route or component. React 19 + Tailwind 4 — keep components small and composable.

## 6. Verify

- `bun run build:web` — type-checks `shared/` + `web/` end-to-end.
- `bun run dev` — server + Vite together; exercise the new flow in the browser.
- For server-only changes, hit the endpoint with `curl` using the bearer token.
- Add a `*.test.ts` next to the handler if behavior is non-trivial; run with `bun test`.

## 7. Commit

Conventional Commits: `feat: add <endpoint> for <reason>`. PR body should list affected workspace(s) and the verification commands you ran. Include screenshots if web UI changed.
