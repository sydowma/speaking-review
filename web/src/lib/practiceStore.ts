// Practice state lives on the server. We keep an in-memory React state and
// PUT updates back to the server. localStorage is only used to migrate
// legacy data (from before the server existed) on first load.

import {
  bulkPutPractice,
  fetchPractice,
  putPracticeIssue,
  type IssuePractice,
  type PracticeState,
  type PracticeStatus,
} from "./reviewApi.ts";

export type { PracticeStatus, IssuePractice, PracticeState };

const LS_KEY_PREFIX = "speaking-review.practice.";
const LS_MIGRATED_PREFIX = "speaking-review.practice-migrated.";

export async function loadPracticeRemote(reviewId: string): Promise<PracticeState> {
  const remote = await fetchPractice(reviewId);

  // One-time migration: if we still have a localStorage copy and haven't
  // pushed it yet, merge it onto the server (server entries win).
  const lsKey = LS_KEY_PREFIX + reviewId;
  const flagKey = LS_MIGRATED_PREFIX + reviewId;
  if (!localStorage.getItem(flagKey)) {
    const legacyRaw = localStorage.getItem(lsKey);
    if (legacyRaw) {
      try {
        const legacy = JSON.parse(legacyRaw) as PracticeState;
        const merged: PracticeState = { ...legacy, ...remote };
        await bulkPutPractice(reviewId, merged);
        localStorage.setItem(flagKey, new Date().toISOString());
        return merged;
      } catch {
        // ignore malformed legacy data
      }
    }
    localStorage.setItem(flagKey, new Date().toISOString());
  }

  return remote;
}

export async function setIssueStatusRemote(
  reviewId: string,
  current: PracticeState,
  issueId: string,
  status: PracticeStatus,
): Promise<PracticeState> {
  const updated = await putPracticeIssue(reviewId, issueId, status);
  return { ...current, [issueId]: updated };
}
