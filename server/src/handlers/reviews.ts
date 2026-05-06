import { listReviewMetas, readAnalysis } from "../storage.ts";
import { json, notFound } from "./shared.ts";

export async function listReviewsHandler(): Promise<Response> {
  const items = await listReviewMetas();
  return json(items);
}

export async function getReviewHandler(id: string): Promise<Response> {
  const analysis = await readAnalysis(id);
  if (!analysis) return notFound();
  return json(analysis);
}
