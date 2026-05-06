#!/usr/bin/env bun
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AUTH_ENABLED, authorize, unauthorized } from "./auth.ts";
import { listReviewsHandler, getReviewHandler } from "./handlers/reviews.ts";
import { audioHandler } from "./handlers/audio.ts";
import {
  bulkPutPracticeHandler,
  getPracticeHandler,
  practiceSummaryHandler,
  putPracticeIssueHandler,
} from "./handlers/practice.ts";
import { syncHandler } from "./handlers/sync.ts";
import { methodNotAllowed, notFound } from "./handlers/shared.ts";
import { createStaticHandler } from "./static.ts";
import { DATA_DIR } from "./storage.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const DIST_DIR = resolve(
  process.env.SPEAKING_REVIEW_DIST ?? join(__dirname, "../../web/dist"),
);

const UUID = "[0-9a-f-]{36}";
const ROUTES = {
  list: new RegExp(`^/api/reviews/?$`),
  practiceSummary: new RegExp(`^/api/practice-summary$`),
  detail: new RegExp(`^/api/reviews/(${UUID})$`),
  practiceGet: new RegExp(`^/api/reviews/(${UUID})/practice$`),
  practicePut: new RegExp(`^/api/reviews/(${UUID})/practice/([^/]+)$`),
  audio: new RegExp(`^/files/(${UUID})/audio\\.wav$`),
  sync: new RegExp(`^/api/sync$`),
} as const;

const staticHandler = createStaticHandler(DIST_DIR);

async function dispatch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;
  const path = url.pathname;

  // Auth gate: any /api or /files request requires the token (when enabled).
  // Static SPA assets are public so the page can load before the user has
  // pasted the token.
  const isProtected = path.startsWith("/api/") || path.startsWith("/files/");
  if (isProtected && !authorize(req)) return unauthorized();

  // /api/practice-summary
  if (ROUTES.practiceSummary.test(path)) {
    if (method !== "GET") return methodNotAllowed(["GET"]);
    return practiceSummaryHandler();
  }

  // /api/reviews
  if (ROUTES.list.test(path)) {
    if (method !== "GET") return methodNotAllowed(["GET"]);
    return listReviewsHandler();
  }

  // /api/reviews/:id
  let m = path.match(ROUTES.detail);
  if (m) {
    if (method !== "GET") return methodNotAllowed(["GET"]);
    return getReviewHandler(m[1]!);
  }

  // /api/reviews/:id/practice
  m = path.match(ROUTES.practiceGet);
  if (m) {
    if (method === "GET") return getPracticeHandler(m[1]!);
    if (method === "POST") return bulkPutPracticeHandler(m[1]!, req);
    return methodNotAllowed(["GET", "POST"]);
  }

  // /api/reviews/:id/practice/:issueId
  m = path.match(ROUTES.practicePut);
  if (m) {
    if (method !== "PUT") return methodNotAllowed(["PUT"]);
    return putPracticeIssueHandler(m[1]!, m[2]!, req);
  }

  // /files/:id/audio.wav
  m = path.match(ROUTES.audio);
  if (m) {
    if (method !== "GET") return methodNotAllowed(["GET"]);
    return audioHandler(m[1]!, req);
  }

  // /api/sync
  if (ROUTES.sync.test(path)) {
    if (method !== "POST") return methodNotAllowed(["POST"]);
    return syncHandler(req);
  }

  // Fallback to static SPA in production. In dev, returns null and we 404 so
  // Vite handles the page itself.
  const staticResp = await staticHandler(req);
  if (staticResp) return staticResp;
  return notFound();
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch: dispatch,
  error(err: Error) {
    console.error("[server] unhandled:", err);
    return new Response("internal error", { status: 500 });
  },
});

console.log(`[server] listening on http://${HOST}:${PORT}`);
console.log(`[server] data dir: ${DATA_DIR}`);
console.log(`[server] auth: ${AUTH_ENABLED ? "ENABLED (token required)" : "disabled"}`);
console.log(`[server] static dist: ${DIST_DIR}`);

const shutdown = () => {
  console.log("[server] shutting down");
  server.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
