// Uploads a completed review (meta + analysis + audio.wav) from local
// ~/.speaking-review/reviews/<id>/ to a remote server's POST /api/sync.
//
// Usage: speaking-review sync <id> --to https://example.com [--token TOKEN]
//        Token also read from SPEAKING_REVIEW_TOKEN env var.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { reviewDir } from "../storage.ts";

interface SyncOpts {
  to: string;
  token?: string;
}

export async function sync(id: string, opts: SyncOpts): Promise<void> {
  const dir = reviewDir(id);
  if (!existsSync(dir)) throw new Error(`review not found: ${id}`);

  const metaPath = join(dir, "meta.json");
  const analysisPath = join(dir, "analysis.json");
  const audioPath = join(dir, "audio.wav");
  for (const p of [metaPath, analysisPath, audioPath]) {
    if (!existsSync(p)) throw new Error(`missing file: ${p}`);
  }

  const target = opts.to.replace(/\/+$/, "") + "/api/sync";
  const token = opts.token ?? process.env.SPEAKING_REVIEW_TOKEN ?? "";

  const fd = new FormData();
  fd.append("meta", new Blob([await readFile(metaPath)], { type: "application/json" }), "meta.json");
  fd.append("analysis", new Blob([await readFile(analysisPath)], { type: "application/json" }), "analysis.json");
  fd.append("audio", new Blob([await readFile(audioPath)], { type: "audio/wav" }), "audio.wav");

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  log(`[sync ${id}] uploading to ${target}…`);
  const t = Date.now();
  const res = await fetch(target, { method: "POST", body: fd, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`upload failed ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = await res.json();
  log(`[sync ${id}] uploaded in ${ms(t)} → ${JSON.stringify(body)}`);
}

export function parseSyncArgs(args: string[]): SyncOpts & { id?: string } {
  const out: SyncOpts & { id?: string } = { to: "" };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--to") {
      out.to = args[++i] ?? "";
    } else if (a === "--token") {
      out.token = args[++i];
    } else if (!a.startsWith("--") && !out.id) {
      out.id = a;
    }
  }
  return out;
}

function log(msg: string): void {
  console.error(msg);
}
function ms(start: number): string {
  return `${((Date.now() - start) / 1000).toFixed(1)}s`;
}
