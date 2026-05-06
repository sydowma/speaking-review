import { Link } from "react-router-dom";
import type { ReviewSummary } from "@shared/types.ts";

interface Props {
  summary: ReviewSummary;
  reviewId: string;
  onTopMistakeClick: (topic: string) => void;
  activeFilterTopic: string | null;
}

export function SummaryCard({
  summary,
  reviewId,
  onTopMistakeClick,
  activeFilterTopic,
}: Props): React.ReactElement {
  const bandLabel =
    summary.estimatedBandLow === summary.estimatedBandHigh
      ? summary.estimatedBandLow.toFixed(1)
      : `${summary.estimatedBandLow.toFixed(1)} – ${summary.estimatedBandHigh.toFixed(1)}`;

  return (
    <section className="px-4 sm:px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 grid grid-cols-1 md:grid-cols-[200px_1fr_1fr] gap-5">
      <div>
        <div className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Estimated Band
        </div>
        <div className="text-3xl font-semibold mt-1 tracking-tight">{bandLabel}</div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 space-y-0.5">
          <div>
            Filler words: <span className="text-zinc-800 dark:text-zinc-200 tabular-nums font-medium">{summary.fillerWordCount}</span>
          </div>
          <div>
            Talk ratio: <span className="text-zinc-800 dark:text-zinc-200 tabular-nums font-medium">
              {Math.round(summary.userTalkRatio * 100)}%
            </span>
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1.5">
          Top Mistakes
          <span className="ml-2 text-[10px] normal-case text-zinc-400 dark:text-zinc-500 font-normal">
            点击筛选错题
          </span>
        </div>
        <ul className="text-sm space-y-1">
          {summary.topMistakes.map((s, i) => {
            const topic = extractTopic(s);
            const isActive = activeFilterTopic === topic;
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onTopMistakeClick(topic)}
                  className={[
                    "text-left leading-relaxed w-full rounded-md px-2 py-0.5 -mx-2 transition",
                    isActive
                      ? "bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200"
                      : "text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20",
                  ].join(" ")}
                >
                  • {s}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1.5">
          Strengths
        </div>
        <ul className="text-sm space-y-1 text-emerald-700 dark:text-emerald-300">
          {summary.strengths.map((s, i) => (
            <li key={i} className="leading-relaxed">• {s}</li>
          ))}
        </ul>
      </div>

      {summary.recommendations.length > 0 && (
        <div className="md:col-span-3 mt-1">
          <div className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1.5 flex items-center gap-2">
            Recommendations
            <Link
              to={`/practice/${reviewId}`}
              className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 normal-case"
            >
              开始练习 →
            </Link>
          </div>
          <ul className="text-sm text-zinc-700 dark:text-zinc-300 space-y-1">
            {summary.recommendations.map((r, i) => (
              <li key={i} className="leading-relaxed">• {r}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function extractTopic(mistake: string): string {
  const colonSplit = mistake.split(/[:：]/);
  if (colonSplit.length > 1) {
    const tail = colonSplit.slice(1).join(":");
    const match = tail.match(/[a-zA-Z][a-zA-Z\s'-]{2,}/);
    if (match) return match[0].trim();
  }
  const fallback = mistake.match(/[a-zA-Z][a-zA-Z\s'-]{3,}/);
  return fallback ? fallback[0].trim() : mistake.slice(0, 12);
}
