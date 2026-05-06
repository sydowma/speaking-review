import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ReviewMeta } from "@shared/types.ts";
import {
  fetchPracticeSummary,
  fetchReviewList,
  type PracticeSummary,
} from "../lib/reviewApi.ts";
import { formatDate, formatDuration } from "../lib/format.ts";
import { ThemeToggle } from "../components/ThemeToggle.tsx";

export function ReviewListPage(): React.ReactElement {
  const [reviews, setReviews] = useState<ReviewMeta[] | null>(null);
  const [summaries, setSummaries] = useState<Record<string, PracticeSummary>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchReviewList(), fetchPracticeSummary().catch(() => ({}))])
      .then(([list, sum]) => {
        setReviews(list);
        setSummaries(sum);
      })
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8 max-w-5xl mx-auto flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Speaking Review</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            English speaking practice analysis
          </p>
        </div>
        <ThemeToggle />
      </header>

      <div className="max-w-5xl mx-auto">
        {error && <div className="text-red-600 dark:text-red-400 text-sm">Error: {error}</div>}

        {reviews === null && !error && (
          <div className="text-zinc-400 dark:text-zinc-500 text-sm">Loading…</div>
        )}

        {reviews && reviews.length === 0 && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-zinc-500 dark:text-zinc-400 shadow-sm">
            No reviews yet. Run:
            <pre className="mt-2 text-zinc-700 dark:text-zinc-200 bg-stone-100 dark:bg-zinc-950 p-3 rounded-lg text-xs">
              speaking-review ingest /path/to/recording.mp4
            </pre>
          </div>
        )}

        {reviews && reviews.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {reviews.map((r) => (
              <ReviewCard key={r.id} review={r} summary={summaries[r.id]} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewCard({
  review: r,
  summary,
}: {
  review: ReviewMeta;
  summary: PracticeSummary | undefined;
}): React.ReactElement {
  return (
    <Link
      to={`/review/${r.id}`}
      className="block rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-blue-300 dark:hover:border-blue-500/60 hover:shadow-md transition p-5 shadow-sm"
    >
      <div className="text-xs text-zinc-400 dark:text-zinc-500">{formatDate(r.createdAt)}</div>
      <div className="text-base font-medium mt-1 truncate">
        {r.title ?? r.sourceFilename}
      </div>
      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 flex items-center gap-2">
        <span>{formatDuration(r.durationSec)} · {r.language}</span>
        {r.title && (
          <span className="text-zinc-400 dark:text-zinc-600 truncate" title={r.sourceFilename}>
            · {r.sourceFilename}
          </span>
        )}
      </div>
      {summary && summary.total > 0 && (
        <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          已掌握 <span className="text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">{summary.gotIt}</span>
          <span className="text-zinc-400 dark:text-zinc-500"> / 已练 {summary.total}</span>
        </div>
      )}
    </Link>
  );
}
