import { listReviewMetas, readPractice, writePractice } from "../storage.ts";
import { badRequest, json, noContent } from "./shared.ts";

export type PracticeStatus = "got_it" | "needs_more" | "skipped";

interface IssueEntry {
  status: PracticeStatus;
  attempts: number;
  lastPracticedAt: string;
}

const VALID: ReadonlyArray<PracticeStatus> = ["got_it", "needs_more", "skipped"];

export async function getPracticeHandler(id: string): Promise<Response> {
  return json(await readPractice(id));
}

export async function putPracticeIssueHandler(
  id: string,
  issueId: string,
  req: Request,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid JSON");
  }
  if (
    typeof body !== "object" || body === null ||
    !("status" in body) || typeof (body as { status?: unknown }).status !== "string"
  ) {
    return badRequest("missing status");
  }
  const status = (body as { status: string }).status;
  if (!VALID.includes(status as PracticeStatus)) {
    return badRequest(`status must be one of: ${VALID.join(", ")}`);
  }
  const state = (await readPractice(id)) as Record<string, IssueEntry>;
  const prev = state[issueId];
  state[issueId] = {
    status: status as PracticeStatus,
    attempts: (prev?.attempts ?? 0) + 1,
    lastPracticedAt: new Date().toISOString(),
  };
  await writePractice(id, state);
  return json(state[issueId]);
}

export async function practiceSummaryHandler(): Promise<Response> {
  const metas = await listReviewMetas();
  const summary: Record<string, { gotIt: number; total: number }> = {};
  for (const m of metas) {
    const state = (await readPractice(m.id)) as Record<string, IssueEntry>;
    let gotIt = 0;
    for (const v of Object.values(state)) {
      if (v.status === "got_it") gotIt++;
    }
    summary[m.id] = { gotIt, total: Object.keys(state).length };
  }
  return json(summary);
}

export async function bulkPutPracticeHandler(
  id: string,
  req: Request,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid JSON");
  }
  if (typeof body !== "object" || body === null) return badRequest("body must be an object");
  // Trust shape; the web client sends well-formed records. Server merges with
  // existing state (later entries win).
  const incoming = body as Record<string, IssueEntry>;
  const state = (await readPractice(id)) as Record<string, IssueEntry>;
  for (const [key, val] of Object.entries(incoming)) {
    state[key] = val;
  }
  await writePractice(id, state);
  return noContent();
}
