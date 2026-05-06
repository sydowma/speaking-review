import { useEffect, useRef } from "react";
import type { Issue, TranscriptSegment } from "@shared/types.ts";
import { formatTimestamp } from "../lib/format.ts";

interface Props {
  transcript: TranscriptSegment[];
  issues: Issue[];
  activeSegmentId: string | null;
  /** segmentId currently being played; the row shows ⏸ instead of ▶. */
  playingSegmentId: string | null;
  onSegmentClick: (segmentId: string, startSec: number, endSec: number) => void;
}

export function TranscriptPane({
  transcript,
  issues,
  activeSegmentId,
  playingSegmentId,
  onSegmentClick,
}: Props): React.ReactElement {
  const issuesBySegment = new Map<string, number>();
  for (const i of issues) {
    issuesBySegment.set(i.segmentId, (issuesBySegment.get(i.segmentId) ?? 0) + 1);
  }

  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeSegmentId]);

  return (
    <ol className="p-4 space-y-1">
      {transcript.map((seg) => {
        const isActive = seg.id === activeSegmentId;
        const isPlaying = seg.id === playingSegmentId;
        const issueCount = issuesBySegment.get(seg.id) ?? 0;
        const isUser = seg.speaker === "user";
        return (
          <li key={seg.id}>
            <button
              ref={isActive ? activeRef : undefined}
              type="button"
              onClick={() => onSegmentClick(seg.id, seg.startSec, seg.endSec)}
              className={[
                "w-full text-left rounded-lg px-3 py-2 transition flex gap-3 group",
                isActive
                  ? "bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-300 dark:ring-blue-500/50"
                  : "hover:bg-stone-100 dark:hover:bg-zinc-800/60",
              ].join(" ")}
            >
              <span
                className={[
                  "shrink-0 text-[11px] font-medium uppercase tracking-wide tabular-nums w-12 pt-0.5",
                  isUser ? "text-blue-600 dark:text-blue-400" : "text-purple-600 dark:text-purple-400",
                ].join(" ")}
              >
                {formatTimestamp(seg.startSec)}
              </span>
              <span className="shrink-0 text-[11px] uppercase tracking-wide pt-0.5 text-zinc-400 dark:text-zinc-500 w-14">
                {isUser ? "你" : "Teacher"}
              </span>
              <span
                className={[
                  "min-w-0 flex-1 text-sm leading-snug",
                  isUser ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400",
                ].join(" ")}
              >
                {seg.text}
              </span>
              {isPlaying && (
                <span className="shrink-0 inline-flex items-center text-[11px] font-medium text-blue-600 dark:text-blue-300 pt-0.5">
                  ⏸
                </span>
              )}
              {issueCount > 0 && (
                <span
                  className="shrink-0 inline-flex items-center justify-center text-[10px] rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 ring-1 ring-red-200 dark:ring-red-500/30 px-2 py-0.5"
                  aria-label={`${issueCount} issues`}
                >
                  {issueCount}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
