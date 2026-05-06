// Optional bearer-token auth. Enabled iff SPEAKING_REVIEW_TOKEN is set.
// Web client passes either ?token= (first load) or Authorization header.

const TOKEN = process.env.SPEAKING_REVIEW_TOKEN ?? "";
export const AUTH_ENABLED = TOKEN.length > 0;

export function authorize(req: Request): boolean {
  if (!AUTH_ENABLED) return true;

  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("token");
  if (fromQuery && safeEqual(fromQuery, TOKEN)) return true;

  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (m && safeEqual(m[1]!, TOKEN)) return true;

  return false;
}

export function unauthorized(): Response {
  return new Response(
    JSON.stringify({ error: "unauthorized" }),
    { status: 401, headers: { "content-type": "application/json" } },
  );
}

// Constant-time comparison to avoid timing-attack leaks. Both inputs are
// utf8 strings of similar shape (long random tokens), so this is sufficient.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
