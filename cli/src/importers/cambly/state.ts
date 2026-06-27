import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { ROOT } from "../../storage.ts";
import type { CamblyImportState } from "./types.ts";

export const CAMBLY_IMPORT_DIR = join(ROOT, "imports", "cambly");
export const CAMBLY_VIDEOS_DIR = join(CAMBLY_IMPORT_DIR, "videos");
export const CAMBLY_TRANSCRIPTS_DIR = join(CAMBLY_IMPORT_DIR, "transcripts");
export const CAMBLY_STATE_PATH = join(CAMBLY_IMPORT_DIR, "state.json");

export async function ensureCamblyImportDirs(): Promise<void> {
  await mkdir(CAMBLY_VIDEOS_DIR, { recursive: true });
  await mkdir(CAMBLY_TRANSCRIPTS_DIR, { recursive: true });
}

export async function readCamblyState(): Promise<CamblyImportState> {
  try {
    return JSON.parse(await readFile(CAMBLY_STATE_PATH, "utf8")) as CamblyImportState;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return { schemaVersion: 1, lessons: {} };
  }
}

export async function writeCamblyState(state: CamblyImportState): Promise<void> {
  await mkdir(CAMBLY_IMPORT_DIR, { recursive: true });
  await writeFile(CAMBLY_STATE_PATH, JSON.stringify(state, null, 2));
}

export function toCamblyStatePath(path: string): string {
  return relative(CAMBLY_IMPORT_DIR, path);
}
