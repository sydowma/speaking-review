import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readdir, readFile, writeFile, stat } from "node:fs/promises";
import type { ReviewAnalysis, ReviewMeta } from "@shared/types.ts";

export const ROOT = process.env.SPEAKING_REVIEW_DATA ?? join(homedir(), ".speaking-review");
export const REVIEWS_DIR = join(ROOT, "reviews");

export function reviewDir(id: string): string {
  return join(REVIEWS_DIR, id);
}

export async function ensureReviewDir(id: string): Promise<string> {
  const dir = reviewDir(id);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function writeMeta(meta: ReviewMeta): Promise<void> {
  const path = join(reviewDir(meta.id), "meta.json");
  await writeFile(path, JSON.stringify(meta, null, 2));
}

export async function writeAnalysis(analysis: ReviewAnalysis): Promise<void> {
  const path = join(reviewDir(analysis.meta.id), "analysis.json");
  await writeFile(path, JSON.stringify(analysis, null, 2));
}

export async function readMeta(id: string): Promise<ReviewMeta> {
  const path = join(reviewDir(id), "meta.json");
  return JSON.parse(await readFile(path, "utf8")) as ReviewMeta;
}

export async function listReviewIds(): Promise<string[]> {
  try {
    const entries = await readdir(REVIEWS_DIR);
    const dirs: string[] = [];
    for (const entry of entries) {
      const s = await stat(join(REVIEWS_DIR, entry));
      if (s.isDirectory()) dirs.push(entry);
    }
    return dirs;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}
