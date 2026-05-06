// whisper-cpp wrapper: wav → segments with start/end timestamps + text.

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { readFile } from "node:fs/promises";

const DEFAULT_MODEL = process.env.WHISPER_MODEL
  ?? join(homedir(), "whisper-models", "ggml-large-v3.bin");

export interface WhisperSegment {
  startSec: number;
  endSec: number;
  text: string;
}

export async function transcribe(wavPath: string): Promise<WhisperSegment[]> {
  // whisper-cli outputs <prefix>.json next to <prefix>.wav when -oj is set.
  const prefix = wavPath.replace(/\.wav$/, "");
  await runWhisper([
    "-m", DEFAULT_MODEL,
    "-f", wavPath,
    "-l", "en",
    "-oj",
    "-of", prefix,
    "-t", "8",
  ]);
  const json = JSON.parse(await readFile(`${prefix}.json`, "utf8"));
  return parseWhisperJson(json);
}

export async function readCachedTranscription(wavPath: string): Promise<WhisperSegment[]> {
  const prefix = wavPath.replace(/\.wav$/, "");
  const json = JSON.parse(await readFile(`${prefix}.json`, "utf8"));
  return parseWhisperJson(json);
}

interface WhisperJsonShape {
  transcription: Array<{
    timestamps: { from: string; to: string };
    text: string;
  }>;
}

function parseWhisperJson(json: WhisperJsonShape): WhisperSegment[] {
  // whisper-cli emits streaming partials when the model hesitates: the same
  // text appears in many consecutive segments with advancing end timestamps,
  // until the model commits and moves on. Collapse those runs into one segment
  // with the widest [start,end] window.
  const out: WhisperSegment[] = [];
  for (const seg of json.transcription) {
    const text = seg.text.trim();
    if (!text) continue;
    const startSec = parseTimestamp(seg.timestamps.from);
    const endSec = parseTimestamp(seg.timestamps.to);
    const last = out[out.length - 1];
    if (last && last.text === text) {
      last.endSec = Math.max(last.endSec, endSec);
      continue;
    }
    out.push({ startSec, endSec, text });
  }
  return out;
}

function parseTimestamp(ts: string): number {
  // Format: HH:MM:SS,mmm
  const m = ts.match(/^(\d+):(\d+):(\d+),(\d+)$/);
  if (!m) throw new Error(`bad timestamp: ${ts}`);
  const [, h, mm, s, ms] = m;
  return Number(h) * 3600 + Number(mm) * 60 + Number(s) + Number(ms) / 1000;
}

function runWhisper(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("whisper-cli", args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: dirname(args[args.indexOf("-f") + 1]!),
    });
    let stderr = "";
    p.stderr.on("data", (d) => { stderr += d.toString(); });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`whisper-cli exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}
