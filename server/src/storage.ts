// Filesystem layout for reviews. Mirrors cli/src/storage.ts but reads from
// SPEAKING_REVIEW_DATA (defaults to ~/.speaking-review/) so the same code
// works locally (dev) and on a deployed server with a mounted volume.

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { ReviewAnalysis, ReviewMeta } from "@shared/types.ts";

export const DATA_DIR =
  process.env.SPEAKING_REVIEW_DATA ?? join(homedir(), ".speaking-review");
export const REVIEWS_DIR = join(DATA_DIR, "reviews");

export function reviewDir(id: string): string {
  return join(REVIEWS_DIR, id);
}

export async function ensureReviewDir(id: string): Promise<string> {
  const d = reviewDir(id);
  await mkdir(d, { recursive: true });
  return d;
}

export async function listReviewMetas(): Promise<ReviewMeta[]> {
  const ids = await safeReaddir(REVIEWS_DIR);
  const items: ReviewMeta[] = [];
  for (const id of ids) {
    try {
      const text = await readFile(join(REVIEWS_DIR, id, "meta.json"), "utf8");
      items.push(JSON.parse(text) as ReviewMeta);
    } catch {
      // skip incomplete review dirs
    }
  }
  items.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return items;
}

export async function readAnalysis(id: string): Promise<ReviewAnalysis | null> {
  const path = join(reviewDir(id), "analysis.json");
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8")) as ReviewAnalysis;
}

export async function readMeta(id: string): Promise<ReviewMeta | null> {
  const path = join(reviewDir(id), "meta.json");
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8")) as ReviewMeta;
}

export async function writeMeta(meta: ReviewMeta): Promise<void> {
  await ensureReviewDir(meta.id);
  await writeFile(
    join(reviewDir(meta.id), "meta.json"),
    JSON.stringify(meta, null, 2),
  );
}

export async function writeAnalysis(analysis: ReviewAnalysis): Promise<void> {
  await ensureReviewDir(analysis.meta.id);
  await writeFile(
    join(reviewDir(analysis.meta.id), "analysis.json"),
    JSON.stringify(analysis, null, 2),
  );
}

export async function writeAudio(id: string, bytes: ArrayBuffer): Promise<void> {
  await ensureReviewDir(id);
  await writeFile(join(reviewDir(id), "audio.wav"), new Uint8Array(bytes));
}

export async function audioStat(id: string): Promise<{ path: string; size: number } | null> {
  const path = join(reviewDir(id), "audio.wav");
  if (!existsSync(path)) return null;
  return { path, size: (await stat(path)).size };
}

export async function readPractice(id: string): Promise<Record<string, unknown>> {
  const path = join(reviewDir(id), "practice.json");
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function writePractice(
  id: string,
  state: Record<string, unknown>,
): Promise<void> {
  await ensureReviewDir(id);
  await writeFile(
    join(reviewDir(id), "practice.json"),
    JSON.stringify(state, null, 2),
  );
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    const dirs: string[] = [];
    for (const entry of entries) {
      const s = await stat(join(dir, entry));
      if (s.isDirectory()) dirs.push(entry);
    }
    return dirs;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}
