import type { ReviewAnalysis, ReviewMeta } from "@shared/types.ts";
import { authHeaders, getToken } from "./auth.ts";

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
  });
  if (res.status === 401) {
    throw new ApiError(401, "需要 token —— 在地址栏后面加 ?token=YOUR_TOKEN");
  }
  return res;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function fetchReviewList(): Promise<ReviewMeta[]> {
  const res = await apiFetch("/api/reviews");
  if (!res.ok) throw new ApiError(res.status, `list failed: ${res.status}`);
  return (await res.json()) as ReviewMeta[];
}

export async function fetchReview(id: string): Promise<ReviewAnalysis> {
  const res = await apiFetch(`/api/reviews/${id}`);
  if (!res.ok) throw new ApiError(res.status, `fetch ${id} failed: ${res.status}`);
  return (await res.json()) as ReviewAnalysis;
}

export function audioUrl(id: string): string {
  // Range requests on <audio> / wavesurfer don't allow per-request headers,
  // so fall back to ?token= query when auth is enabled.
  const t = getToken();
  return t ? `/files/${id}/audio.wav?token=${encodeURIComponent(t)}` : `/files/${id}/audio.wav`;
}

// --- Practice state ---

export type PracticeStatus = "got_it" | "needs_more" | "skipped";

export interface IssuePractice {
  status: PracticeStatus;
  attempts: number;
  lastPracticedAt: string;
}

export type PracticeState = Record<string, IssuePractice>;

export async function fetchPractice(reviewId: string): Promise<PracticeState> {
  const res = await apiFetch(`/api/reviews/${reviewId}/practice`);
  if (!res.ok) throw new ApiError(res.status, `practice fetch failed: ${res.status}`);
  return (await res.json()) as PracticeState;
}

export async function putPracticeIssue(
  reviewId: string,
  issueId: string,
  status: PracticeStatus,
): Promise<IssuePractice> {
  const res = await apiFetch(`/api/reviews/${reviewId}/practice/${issueId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new ApiError(res.status, `practice put failed: ${res.status}`);
  return (await res.json()) as IssuePractice;
}

export interface PracticeSummary {
  gotIt: number;
  total: number;
}

export async function fetchPracticeSummary(): Promise<Record<string, PracticeSummary>> {
  const res = await apiFetch("/api/practice-summary");
  if (!res.ok) throw new ApiError(res.status, `summary failed: ${res.status}`);
  return (await res.json()) as Record<string, PracticeSummary>;
}

export async function bulkPutPractice(reviewId: string, state: PracticeState): Promise<void> {
  const res = await apiFetch(`/api/reviews/${reviewId}/practice`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state),
  });
  if (!res.ok) throw new ApiError(res.status, `bulk put failed: ${res.status}`);
}
