// Serve the built SPA from web/dist in production. SPA fallback: any
// non-file path 404 returns index.html so client-side routing works.

import { existsSync } from "node:fs";
import { join } from "node:path";

export function createStaticHandler(distDir: string): (req: Request) => Promise<Response | null> {
  const indexPath = join(distDir, "index.html");

  return async (req: Request): Promise<Response | null> => {
    // Re-check existence per request so a build done after server start
    // becomes visible without a restart. If dist doesn't exist (dev mode),
    // return null and let the caller 404.
    if (!existsSync(distDir)) return null;

    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";

    const candidate = join(distDir, pathname);
    // Prevent path traversal: candidate must stay under distDir.
    if (!candidate.startsWith(distDir)) {
      return new Response("forbidden", { status: 403 });
    }

    if (existsSync(candidate)) {
      return new Response(Bun.file(candidate));
    }
    // SPA fallback for client-side routes.
    if (existsSync(indexPath)) {
      return new Response(Bun.file(indexPath), {
        headers: { "content-type": "text/html" },
      });
    }
    return null;
  };
}
