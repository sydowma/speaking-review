export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function notFound(): Response {
  return json({ error: "not found" }, 404);
}

export function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function methodNotAllowed(allowed: string[]): Response {
  return new Response(
    JSON.stringify({ error: "method not allowed" }),
    {
      status: 405,
      headers: {
        "content-type": "application/json",
        allow: allowed.join(", "),
      },
    },
  );
}
