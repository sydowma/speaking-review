import type { Issue, IssueCategory, Severity } from "@shared/types.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PracticeState } from "../lib/practiceStore.ts";

interface Props {
  issues: Issue[];
  totalIssues: number;
  activeIssueId: string | null;
  /** segmentId currently being played by the global waveform, if any. */
  playingSegmentId: string | null;
  canPlayOriginal: boolean;
  /** issueId whose suggested phrase is currently being spoken via TTS. */
  speakingIssueId: string | null;
  onIssueSelect: (issueId: string) => void;
  onPlayOriginal: (issueId: string) => void;
  onSpeakSuggested: (issueId: string) => void;
  filterTopic: string | null;
  onClearFilter: () => void;
  practice: PracticeState;
}

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-red-500",
  moderate: "bg-amber-500",
  minor: "bg-emerald-500",
};

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  grammar: "语法",
  vocabulary: "用词",
  fluency: "流利度",
  pronunciation: "发音",
  discourse: "篇章",
};

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  moderate: 1,
  minor: 2,
};

export function IssuesPane({
  issues,
  totalIssues,
  activeIssueId,
  playingSegmentId,
  canPlayOriginal,
  speakingIssueId,
  onIssueSelect,
  onPlayOriginal,
  onSpeakSuggested,
  filterTopic,
  onClearFilter,
  practice,
}: Props): React.ReactElement {
  const [filter, setFilter] = useState<Severity | "all">("all");
  const filtered = useMemo(() => {
    const list = filter === "all" ? issues : issues.filter((i) => i.severity === filter);
    return [...list].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  }, [issues, filter]);

  const activeRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!activeIssueId) return;
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIssueId]);

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { critical: 0, moderate: 0, minor: 0 };
    for (const i of issues) c[i.severity]++;
    return c;
  }, [issues]);

  return (
    <div className="p-4">
      {filterTopic && (
        <div className="mb-3 flex items-center gap-2 text-xs bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-500/40 rounded-lg px-3 py-1.5">
          <span className="text-blue-700 dark:text-blue-200">
            按主题筛选: <strong>"{filterTopic}"</strong>
          </span>
          <button
            type="button"
            onClick={onClearFilter}
            className="ml-auto text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100"
          >
            清除 ✕
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 text-xs mb-3">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All ({issues.length}
          {filterTopic ? `/${totalIssues}` : ""})
        </FilterChip>
        <FilterChip active={filter === "critical"} onClick={() => setFilter("critical")}>
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />
          {counts.critical}
        </FilterChip>
        <FilterChip active={filter === "moderate"} onClick={() => setFilter("moderate")}>
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />
          {counts.moderate}
        </FilterChip>
        <FilterChip active={filter === "minor"} onClick={() => setFilter("minor")}>
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />
          {counts.minor}
        </FilterChip>
      </div>

      <ol className="space-y-2">
        {filtered.map((issue) => {
          const isActive = issue.id === activeIssueId;
          const status = practice[issue.id]?.status;
          const isPlayingOriginal = playingSegmentId === issue.segmentId;
          const isSpeakingSuggested = speakingIssueId === issue.id;
          return (
            <li
              key={issue.id}
              ref={isActive ? activeRef : undefined}
              className={[
                "rounded-xl border p-3 transition bg-white dark:bg-zinc-900 shadow-sm",
                isActive
                  ? "border-blue-400 dark:border-blue-500 ring-2 ring-blue-100 dark:ring-blue-500/30"
                  : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700",
                status === "got_it" ? "opacity-60" : "",
              ].join(" ")}
            >
              {/* Click target: select only, no auto-play. */}
              <button
                type="button"
                onClick={() => onIssueSelect(issue.id)}
                className="w-full text-left"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[issue.severity]}`}
                  />
                  <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                    {CATEGORY_LABEL[issue.category]}
                  </span>
                  {issue.bandImpact && (
                    <span className="text-zinc-400 dark:text-zinc-500">· {issue.bandImpact}</span>
                  )}
                  {status && (
                    <span
                      className={[
                        "ml-auto inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5",
                        status === "got_it"
                          ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                          : status === "needs_more"
                            ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
                      ].join(" ")}
                    >
                      {status === "got_it"
                        ? "✓ 掌握"
                        : status === "needs_more"
                          ? "🔁 待复练"
                          : "⏭ 已跳过"}
                    </span>
                  )}
                </div>
              </button>

              {/* Original */}
              <div className="mt-2 flex items-start gap-2">
                <span className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mt-1 w-12 shrink-0">
                  你说的
                </span>
                <p className="flex-1 text-sm text-zinc-500 dark:text-zinc-400 line-through decoration-red-400/70">
                  {issue.original}
                </p>
                <PlaybackButton
                  active={isPlayingOriginal}
                  disabled={!canPlayOriginal}
                  idleLabel={canPlayOriginal ? "▶ 原句" : "无原声"}
                  activeLabel="⏸ 暂停"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlayOriginal(issue.id);
                  }}
                  variant="zinc"
                />
              </div>

              {/* Suggested */}
              <div className="mt-2 flex items-start gap-2">
                <span className="text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mt-1 w-12 shrink-0">
                  应该说
                </span>
                <p className="flex-1 text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                  {issue.suggested}
                </p>
                <PlaybackButton
                  active={isSpeakingSuggested}
                  idleLabel="🔊 正解"
                  activeLabel="⏸ 停止"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSpeakSuggested(issue.id);
                  }}
                  variant="emerald"
                />
              </div>

              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {issue.explanation}
              </p>
            </li>
          );
        })}
      </ol>

      {filtered.length === 0 && (
        <div className="text-zinc-400 dark:text-zinc-500 text-sm text-center py-8">
          {filterTopic ? "该主题下没有匹配的错题。" : "No issues in this filter."}
        </div>
      )}
    </div>
  );
}

function PlaybackButton({
  active,
  idleLabel,
  activeLabel,
  onClick,
  variant,
  disabled = false,
}: {
  active: boolean;
  idleLabel: string;
  activeLabel: string;
  onClick: (e: React.MouseEvent) => void;
  variant: "zinc" | "emerald";
  disabled?: boolean;
}): React.ReactElement {
  const colors = disabled
    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-zinc-700 cursor-not-allowed"
    : active
      ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
      : variant === "emerald"
        ? "bg-white dark:bg-zinc-900 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40 hover:border-emerald-500"
        : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700 hover:border-zinc-500";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 inline-flex items-center justify-center text-[11px] font-medium border rounded-md h-7 px-2.5 transition ${colors}`}
    >
      {active ? activeLabel : idleLabel}
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-2.5 py-1 rounded-full transition text-[11px] font-medium",
        active
          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
          : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-500",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
