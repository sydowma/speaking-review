// CLI uploads a completed review (meta + analysis + audio.wav) here.
// Multipart form with three named parts: "meta", "analysis", "audio".

import type { ReviewAnalysis, ReviewMeta } from "@shared/types.ts";
import { writeAnalysis, writeAudio, writeMeta } from "../storage.ts";
import { badRequest, json } from "./shared.ts";

export async function syncHandler(req: Request): Promise<Response> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return badRequest("expected multipart/form-data");
  }
  const form = await req.formData();
  const metaFile = form.get("meta");
  const analysisFile = form.get("analysis");
  const audioFile = form.get("audio");
  if (!(metaFile instanceof File) || !(analysisFile instanceof File) || !(audioFile instanceof File)) {
    return badRequest("missing one of: meta, analysis, audio");
  }

  let meta: ReviewMeta;
  let analysis: ReviewAnalysis;
  try {
    meta = JSON.parse(await metaFile.text()) as ReviewMeta;
    analysis = JSON.parse(await analysisFile.text()) as ReviewAnalysis;
  } catch (err) {
    return badRequest(`invalid JSON: ${err instanceof Error ? err.message : err}`);
  }

  if (!meta.id || meta.id !== analysis.meta.id) {
    return badRequest("meta.id and analysis.meta.id must match");
  }

  await writeMeta(meta);
  await writeAnalysis(analysis);
  await writeAudio(meta.id, await audioFile.arrayBuffer());

  return json({ id: meta.id });
}
