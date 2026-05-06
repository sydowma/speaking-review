import { listReviewIds, readMeta } from "../storage.ts";

export async function list(): Promise<void> {
  const ids = await listReviewIds();
  if (ids.length === 0) {
    console.log("No reviews yet. Run: speaking-review ingest <file.mp4>");
    return;
  }
  const rows: Array<{ id: string; created: string; duration: string; source: string }> = [];
  for (const id of ids) {
    try {
      const meta = await readMeta(id);
      rows.push({
        id: meta.id.slice(0, 8),
        created: meta.createdAt.replace("T", " ").slice(0, 16),
        duration: formatDuration(meta.durationSec),
        source: meta.sourceFilename,
      });
    } catch {
      rows.push({ id: id.slice(0, 8), created: "?", duration: "?", source: "(missing meta.json)" });
    }
  }
  rows.sort((a, b) => b.created.localeCompare(a.created));
  console.log(["id      ", "created          ", "duration", "source"].join("  "));
  console.log("─".repeat(60));
  for (const r of rows) {
    console.log([r.id.padEnd(8), r.created.padEnd(17), r.duration.padStart(8), r.source].join("  "));
  }
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
