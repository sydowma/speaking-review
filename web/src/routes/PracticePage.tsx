import type {
  Issue,
  IssueCategory,
  ReviewAnalysis,
  Severity,
  TranscriptSegment,
} from "@shared/types.ts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ThemeToggle } from "../components/ThemeToggle.tsx";
import { VoicePicker } from "../components/VoicePicker.tsx";
import {
  createRangeClipPlayer,
  playElementAndWait,
  type RangeClipPlayer,
  sleep,
  speakAndWait,
} from "../lib/audioClip.ts";
import {
  loadPracticeRemote,
  type PracticeState,
  type PracticeStatus,
  setIssueStatusRemote,
} from "../lib/practiceStore.ts";
import { MicRecorder, type RecordingResult } from "../lib/recorder.ts";
import { audioUrl, fetchReview } from "../lib/reviewApi.ts";
import { cancelSpeech, speak } from "../lib/tts.ts";

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  grammar: "语法",
  vocabulary: "用词",
  fluency: "流利度",
  pronunciation: "发音",
  discourse: "篇章",
};

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-red-500",
  moderate: "bg-amber-500",
  minor: "bg-emerald-500",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "高优先级",
  moderate: "中等",
  minor: "次要",
};

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  moderate: 1,
  minor: 2,
};

export function PracticePage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ReviewAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [practice, setPractice] = useState<PracticeState>({});
  const [index, setIndex] = useState(0);
  const [recording, setRecording] = useState<RecordingResult | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [sequencePlaying, setSequencePlaying] = useState(false);
  const recorderRef = useRef<MicRecorder>(new MicRecorder());
  const clipRef = useRef<RangeClipPlayer | null>(null);
  const sequenceAbortRef = useRef<{ aborted: boolean }>({ aborted: false });

  useEffect(() => {
    if (!id) return;
    fetchReview(id)
      .then(setData)
      .catch((e) => setError(String(e)));
    loadPracticeRemote(id)
      .then(setPractice)
      .catch(() => setPractice({}));
  }, [id]);

  useEffect(() => {
    if (!id || !data?.meta.audioFile) {
      clipRef.current?.destroy();
      clipRef.current = null;
      return;
    }
    clipRef.current = createRangeClipPlayer(audioUrl(id));
    return () => {
      clipRef.current?.destroy();
      clipRef.current = null;
      cancelSpeech();
    };
  }, [id, data?.meta.audioFile]);

  // Sort issues: unfinished first (skipped/needs_more/unseen), then by severity.
  const sortedIssues = useMemo<Issue[]>(() => {
    if (!data) return [];
    const list = [...data.issues];
    list.sort((a, b) => {
      const aDone = practice[a.id]?.status === "got_it" ? 1 : 0;
      const bDone = practice[b.id]?.status === "got_it" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    });
    return list;
  }, [data, practice]);

  const issue = sortedIssues[index];
  const segment = useMemo<TranscriptSegment | null>(() => {
    if (!data || !issue) return null;
    return data.transcript.find((s) => s.id === issue.segmentId) ?? null;
  }, [data, issue]);

  const playOriginal = useCallback(() => {
    if (!segment || !data?.meta.audioFile || !clipRef.current) return;
    cancelSpeech();
    void clipRef.current.playRange(segment.startSec, segment.endSec);
  }, [data?.meta.audioFile, segment]);

  const playSuggested = useCallback(
    (rate: number) => {
      if (!issue) return;
      clipRef.current?.pause();
      speak(issue.suggested, { rate });
    },
    [issue],
  );

  const playRecording = useCallback(() => {
    if (!recording) return;
    cancelSpeech();
    clipRef.current?.pause();
    const a = new Audio(recording.url);
    void a.play();
  }, [recording]);

  const stopSequence = useCallback(() => {
    sequenceAbortRef.current.aborted = true;
    cancelSpeech();
    clipRef.current?.pause();
    setSequencePlaying(false);
  }, []);

  const playSequence = useCallback(async () => {
    if (!segment || !issue || !recording || !data?.meta.audioFile || !clipRef.current) return;
    if (sequencePlaying) {
      stopSequence();
      return;
    }
    const token = { aborted: false };
    sequenceAbortRef.current = token;
    setSequencePlaying(true);
    try {
      // 1. Original Cambly clip
      await clipRef.current.playRangeAndWait(segment.startSec, segment.endSec);
      if (token.aborted) return;
      await sleep(700);
      if (token.aborted) return;
      // 2. TTS suggested
      await speakAndWait(issue.suggested, 0.95);
      if (token.aborted) return;
      await sleep(700);
      if (token.aborted) return;
      // 3. User recording
      await playElementAndWait(recording.url);
    } finally {
      setSequencePlaying(false);
    }
  }, [data?.meta.audioFile, segment, issue, recording, sequencePlaying, stopSequence]);

  const startRecording = useCallback(async () => {
    cancelSpeech();
    clipRef.current?.pause();
    try {
      await recorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      alert(`无法访问麦克风: ${err instanceof Error ? err.message : err}`);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const result = await recorderRef.current.stop();
    setIsRecording(false);
    if (recording?.url) URL.revokeObjectURL(recording.url);
    setRecording(result);
  }, [recording]);

  const markStatus = useCallback(
    (status: PracticeStatus) => {
      if (!id || !issue) return;
      // Optimistic update so the UI doesn't block on the network round-trip.
      const optimistic: PracticeState = {
        ...practice,
        [issue.id]: {
          status,
          attempts: (practice[issue.id]?.attempts ?? 0) + 1,
          lastPracticedAt: new Date().toISOString(),
        },
      };
      setPractice(optimistic);
      if (status === "got_it" && index < sortedIssues.length - 1) {
        setIndex(index + 1);
        if (recording?.url) URL.revokeObjectURL(recording.url);
        setRecording(null);
      }
      // Reconcile with server in the background; on failure roll back.
      setIssueStatusRemote(id, practice, issue.id, status)
        .then(setPractice)
        .catch(() => setPractice(practice));
    },
    [id, issue, index, sortedIssues.length, recording, practice],
  );

  const goPrev = useCallback(() => {
    stopSequence();
    setIndex((i) => Math.max(0, i - 1));
    if (recording?.url) URL.revokeObjectURL(recording.url);
    setRecording(null);
  }, [recording, stopSequence]);

  const goNext = useCallback(() => {
    stopSequence();
    setIndex((i) => Math.min(sortedIssues.length - 1, i + 1));
    if (recording?.url) URL.revokeObjectURL(recording.url);
    setRecording(null);
  }, [sortedIssues.length, recording, stopSequence]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case "1":
          playOriginal();
          break;
        case "2":
          playSuggested(0.95);
          break;
        case "r":
        case "R":
          if (isRecording) void stopRecording();
          else void startRecording();
          break;
        case "ArrowRight":
          goNext();
          break;
        case "ArrowLeft":
          goPrev();
          break;
        case "Enter":
          markStatus("got_it");
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    playOriginal,
    playSuggested,
    goNext,
    goPrev,
    markStatus,
    isRecording,
    startRecording,
    stopRecording,
  ]);

  if (!id) return <div className="p-8">Missing id.</div>;
  if (error) return <div className="p-8 text-red-600 dark:text-red-400">Error: {error}</div>;
  if (!data) return <div className="p-8 text-zinc-400 dark:text-zinc-500">Loading…</div>;
  if (!issue) {
    return (
      <div className="p-8">
        <Link
          to={`/review/${id}`}
          className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          ← Back to review
        </Link>
        <p className="mt-4 text-zinc-700 dark:text-zinc-300">没有可练习的错题。</p>
      </div>
    );
  }

  const completedCount = sortedIssues.filter((i) => practice[i.id]?.status === "got_it").length;
  const totalCount = sortedIssues.length;
  const progressPct = (completedCount / totalCount) * 100;
  const currentStatus = practice[issue.id]?.status;
  const hasAudio = Boolean(data.meta.audioFile);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 flex flex-col">
      <header className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between gap-4">
        <Link
          to={`/review/${id}`}
          className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          ← Back to review
        </Link>
        <div className="text-sm font-medium tabular-nums">
          {index + 1} / {totalCount}
          <span className="ml-3 text-emerald-600 dark:text-emerald-400">
            已掌握 {completedCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <VoicePicker />
          <ThemeToggle />
        </div>
      </header>

      <div className="h-1 bg-stone-200 dark:bg-zinc-800">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <main className="flex-1 px-4 py-6 max-w-3xl w-full mx-auto">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-6">
          {/* Meta */}
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[issue.severity]}`} />
            <span className="font-medium text-zinc-700 dark:text-zinc-200">
              {SEVERITY_LABEL[issue.severity]} · {CATEGORY_LABEL[issue.category]}
            </span>
            {issue.bandImpact && <span>· {issue.bandImpact}</span>}
            {currentStatus && (
              <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-stone-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                {currentStatus === "got_it"
                  ? "已掌握"
                  : currentStatus === "needs_more"
                    ? "待复练"
                    : "已跳过"}
              </span>
            )}
          </div>

          {/* Original */}
          <section className="mt-5">
            <div className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              你说的
            </div>
            <div className="mt-2 flex items-start gap-3">
              <p className="flex-1 text-zinc-700 dark:text-zinc-300 leading-relaxed line-through decoration-red-400">
                {issue.original}
              </p>
              <button
                type="button"
                onClick={playOriginal}
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 border border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 dark:hover:border-zinc-500 rounded-lg px-3 py-1.5 bg-white dark:bg-zinc-900"
                title="按 1 键"
              >
                ▶ 听原句
              </button>
            </div>
          </section>

          {/* Suggested */}
          <section className="mt-6 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-500/30 p-4">
            <div className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              应该说
            </div>
            <p className="mt-2 text-emerald-900 dark:text-emerald-100 text-lg font-medium leading-relaxed">
              {issue.suggested}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => playSuggested(0.7)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-100 border border-emerald-300 dark:border-emerald-500/40 hover:border-emerald-500 dark:hover:border-emerald-400 rounded-lg px-3 py-1.5 bg-white dark:bg-zinc-900"
              >
                🔊 慢速
              </button>
              <button
                type="button"
                onClick={() => playSuggested(0.95)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-100 border border-emerald-300 dark:border-emerald-500/40 hover:border-emerald-500 dark:hover:border-emerald-400 rounded-lg px-3 py-1.5 bg-white dark:bg-zinc-900"
                title="按 2 键"
              >
                🔊 正常
              </button>
            </div>
          </section>

          {/* Explanation */}
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
            {issue.explanation}
          </p>

          {/* Recorder */}
          <section className="mt-6 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-stone-50 dark:bg-zinc-950/40">
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-3">
              录你自己念一遍
              <span className="ml-2 normal-case text-[10px] text-zinc-400 dark:text-zinc-500">
                按 R 键
              </span>
            </div>

            {!recording && (
              <div className="flex items-center gap-3">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-500 hover:bg-red-400 text-white text-sm px-4 py-2 font-medium shadow-sm"
                  >
                    🎤 开始录音
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-700 dark:hover:bg-zinc-300 text-white dark:text-zinc-900 text-sm px-4 py-2 font-medium shadow-sm animate-pulse"
                  >
                    ⏹ 停止录音
                  </button>
                )}
              </div>
            )}

            {recording && !isRecording && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <CompareCard
                    label="① 你说过的"
                    sublabel={hasAudio ? "原始录音" : "无原声"}
                    onPlay={playOriginal}
                    color="zinc"
                    disabled={!hasAudio}
                  />
                  <CompareCard
                    label="② 应该说"
                    sublabel="TTS 正解"
                    onPlay={() => playSuggested(0.95)}
                    color="emerald"
                  />
                  <CompareCard
                    label="③ 你刚录的"
                    sublabel={`${recording.durationSec.toFixed(1)}s`}
                    onPlay={playRecording}
                    color="blue"
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={playSequence}
                    disabled={!hasAudio}
                    className={[
                      "inline-flex items-center gap-1.5 text-sm font-medium rounded-lg px-3 py-2 shadow-sm",
                      !hasAudio
                        ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
                        : sequencePlaying
                          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                          : "bg-blue-600 hover:bg-blue-500 text-white",
                    ].join(" ")}
                  >
                    {!hasAudio ? "缺少原声" : sequencePlaying ? "⏹ 停止" : "▶ 顺序对比播放"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopSequence();
                      if (recording.url) URL.revokeObjectURL(recording.url);
                      setRecording(null);
                      void startRecording();
                    }}
                    className="inline-flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 px-2 py-1.5"
                  >
                    🔄 重录
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Footer actions */}
          <footer className="mt-6 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => markStatus("got_it")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-2 font-medium shadow-sm"
              title="按回车"
            >
              ✓ 掌握，下一条
            </button>
            <button
              type="button"
              onClick={() => markStatus("needs_more")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm px-4 py-2 font-medium shadow-sm"
            >
              🔁 待复练
            </button>
            <button
              type="button"
              onClick={() => markStatus("skipped")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 text-sm px-3 py-2 text-zinc-600 dark:text-zinc-300"
            >
              ⏭ 跳过
            </button>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={goPrev}
                disabled={index === 0}
                className="rounded-lg border border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 text-sm px-3 py-2 text-zinc-600 dark:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← 上一条
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={index === totalCount - 1}
                className="rounded-lg border border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 text-sm px-3 py-2 text-zinc-600 dark:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                下一条 →
              </button>
            </div>
          </footer>
        </div>

        <div className="mt-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
          快捷键：1 听原句 · 2 听正解 · R 录音 · 回车 掌握 · ← / →
        </div>
      </main>
    </div>
  );
}

const COMPARE_COLORS = {
  zinc: {
    bg: "bg-white dark:bg-zinc-900",
    border: "border-zinc-200 dark:border-zinc-700",
    text: "text-zinc-700 dark:text-zinc-200",
    sub: "text-zinc-400 dark:text-zinc-500",
    btn: "bg-zinc-700 hover:bg-zinc-600 text-white",
  },
  emerald: {
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    border: "border-emerald-200 dark:border-emerald-500/30",
    text: "text-emerald-800 dark:text-emerald-200",
    sub: "text-emerald-600 dark:text-emerald-400",
    btn: "bg-emerald-600 hover:bg-emerald-500 text-white",
  },
  blue: {
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-500/30",
    text: "text-blue-800 dark:text-blue-200",
    sub: "text-blue-600 dark:text-blue-400",
    btn: "bg-blue-600 hover:bg-blue-500 text-white",
  },
};

function CompareCard({
  label,
  sublabel,
  onPlay,
  color,
  disabled = false,
}: {
  label: string;
  sublabel: string;
  onPlay: () => void;
  color: keyof typeof COMPARE_COLORS;
  disabled?: boolean;
}): React.ReactElement {
  const c = COMPARE_COLORS[color];
  return (
    <div className={`rounded-lg border ${c.border} ${c.bg} p-3`}>
      <div className={`text-xs font-medium ${c.text}`}>{label}</div>
      <div className={`text-[10px] ${c.sub} mt-0.5`}>{sublabel}</div>
      <button
        type="button"
        onClick={onPlay}
        disabled={disabled}
        className={[
          "mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-md text-xs font-medium px-2 py-1.5",
          disabled
            ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
            : c.btn,
        ].join(" ")}
      >
        {disabled ? "无原声" : "▶ 播放"}
      </button>
    </div>
  );
}
