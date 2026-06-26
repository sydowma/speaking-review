import { basename, resolve } from "node:path";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { ensureReviewDir, reviewDir, writeMeta, writeAnalysis, readMeta } from "../storage.ts";
import { extractAudio } from "../pipeline/ffmpeg.ts";
import { transcribe, readCachedTranscription } from "../pipeline/whisper.ts";
import { analyze } from "../pipeline/analyze.ts";
import type { ReviewMeta } from "@shared/types.ts";
import { SCHEMA_VERSION } from "@shared/types.ts";

const MODEL_TRANSCRIBE = "whisper-cpp/ggml-large-v3";

export interface IngestOptions {
  sourceProvider?: ReviewMeta["sourceProvider"];
  sourceUrl?: string;
  externalId?: string;
  lessonAt?: string;
  tutorName?: string;
}

export async function ingest(inputArg: string, options: IngestOptions = {}): Promise<string> {
  const sourcePath = resolve(inputArg);
  const id = randomUUID();
  const dir = await ensureReviewDir(id);
  const audioFile = "audio.wav";
  const audioPath = join(dir, audioFile);

  log(`[ingest ${id}] source: ${sourcePath}`);

  log(`[ingest ${id}] extracting audio…`);
  const t0 = Date.now();
  const { durationSec } = await extractAudio(sourcePath, audioPath);
  log(`[ingest ${id}] audio: ${audioFile} (${durationSec.toFixed(1)}s) in ${ms(t0)}`);

  // Persist meta as early as possible so a failed analyze step is resumable.
  const meta: ReviewMeta = {
    id,
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    sourcePath,
    sourceFilename: basename(sourcePath),
    sourceProvider: options.sourceProvider ?? "local",
    sourceUrl: options.sourceUrl,
    externalId: options.externalId,
    lessonAt: options.lessonAt,
    tutorName: options.tutorName,
    durationSec,
    audioFile,
    modelTranscribe: MODEL_TRANSCRIBE,
    modelAnalyze: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
    language: "en",
  };
  await writeMeta(meta);

  log(`[ingest ${id}] transcribing…`);
  const t1 = Date.now();
  const segments = await transcribe(audioPath);
  log(`[ingest ${id}] transcribed ${segments.length} segments in ${ms(t1)}`);

  log(`[ingest ${id}] analyzing with Claude…`);
  const t2 = Date.now();
  const { title, transcript, issues, summary } = await analyze(segments);
  log(`[ingest ${id}] analyzed (${issues.length} issues) in ${ms(t2)}`);

  if (title) {
    meta.title = title;
    await writeMeta(meta);
  }
  await writeAnalysis({ meta, transcript, issues, summary });

  log(`[ingest ${id}] done → ~/.speaking-review/reviews/${id}/`);
  return id;
}

export async function resume(id: string): Promise<void> {
  const dir = reviewDir(id);
  if (!existsSync(dir)) throw new Error(`review not found: ${id}`);

  let meta: ReviewMeta;
  try {
    meta = await readMeta(id);
  } catch {
    // No meta.json — reconstruct from the ingest dir contents.
    const audioPath = join(dir, "audio.wav");
    const audioStat = await stat(audioPath);
    meta = {
      id,
      schemaVersion: SCHEMA_VERSION,
      createdAt: audioStat.birthtime.toISOString(),
      sourcePath: "(unknown)",
      sourceFilename: "(unknown)",
      durationSec: 0,
      audioFile: "audio.wav",
      modelTranscribe: MODEL_TRANSCRIBE,
      modelAnalyze: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
      language: "en",
    };
    await writeMeta(meta);
  }

  log(`[resume ${id}] loading cached whisper output…`);
  const segments = await readCachedTranscription(join(dir, "audio.wav"));
  log(`[resume ${id}] ${segments.length} segments`);

  log(`[resume ${id}] analyzing with Claude…`);
  const t = Date.now();
  const { title, transcript, issues, summary } = await analyze(segments);
  log(`[resume ${id}] analyzed (${issues.length} issues) in ${ms(t)}`);

  if (title) {
    meta.title = title;
    await writeMeta(meta);
  }
  await writeAnalysis({ meta, transcript, issues, summary });
  log(`[resume ${id}] done → ~/.speaking-review/reviews/${id}/`);
}

function log(msg: string): void {
  console.error(msg);
}

function ms(start: number): string {
  return `${((Date.now() - start) / 1000).toFixed(1)}s`;
}
