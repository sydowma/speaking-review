import type { ReviewAnalysis, TranscriptSegment } from "@shared/types.ts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CoachingPanel } from "../components/CoachingPanel.tsx";
import { IssuesPane } from "../components/IssuesPane.tsx";
import { SummaryCard } from "../components/SummaryCard.tsx";
import { ThemeToggle } from "../components/ThemeToggle.tsx";
import { TranscriptPane } from "../components/TranscriptPane.tsx";
import { VoicePicker } from "../components/VoicePicker.tsx";
import { Waveform, type WaveformHandle } from "../components/Waveform.tsx";
import { formatDate, formatDuration } from "../lib/format.ts";
import { loadPracticeRemote, type PracticeState } from "../lib/practiceStore.ts";
import { fetchReview } from "../lib/reviewApi.ts";
import { cancelSpeech, speak } from "../lib/tts.ts";

type MobileTab = "transcript" | "coaching" | "issues" | "summary";

export function ReviewDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ReviewAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const [speakingIssueId, setSpeakingIssueId] = useState<string | null>(null);
  const [issueFilterTopic, setIssueFilterTopic] = useState<string | null>(null);
  const [loopSingle, setLoopSingle] = useState<boolean>(true);
  const [practice, setPractice] = useState<PracticeState>({});
  const [mobileTab, setMobileTab] = useState<MobileTab>("transcript");
  const waveformRef = useRef<WaveformHandle>(null);

  useEffect(() => {
    if (!id) return;
    fetchReview(id)
      .then(setData)
      .catch((e) => setError(String(e)));
    loadPracticeRemote(id)
      .then(setPractice)
      .catch(() => setPractice({}));
  }, [id]);

  const playSegment = useCallback(
    (seg: Pick<TranscriptSegment, "id" | "startSec" | "endSec">, opts: { loop?: boolean } = {}) => {
      const ws = waveformRef.current;
      if (!ws) return;
      cancelSpeech();
      setSpeakingIssueId(null);
      // Loop default comes from the global toggle, but callers can override
      // (e.g. issue-card playback always plays once).
      ws.playRange(seg.startSec, seg.endSec, { loop: opts.loop ?? loopSingle });
      setPlayingSegmentId(seg.id);
      setActiveSegmentId(seg.id);
    },
    [loopSingle],
  );

  const pauseAll = useCallback(() => {
    waveformRef.current?.pause();
    cancelSpeech();
    setPlayingSegmentId(null);
    setSpeakingIssueId(null);
  }, []);

  const handleSegmentClick = useCallback(
    (segmentId: string, startSec: number, endSec: number) => {
      if (!data) return;
      setActiveIssueId(null);
      setActiveSegmentId(segmentId);
      // Toggle: clicking the segment that's already playing pauses it.
      if (playingSegmentId === segmentId) {
        pauseAll();
      } else if (data.meta.audioFile) {
        playSegment({ id: segmentId, startSec, endSec });
      }
    },
    [data, playSegment, pauseAll, playingSegmentId],
  );

  const handleIssueSelect = useCallback(
    (issueId: string) => {
      if (!data) return;
      const issue = data.issues.find((i) => i.id === issueId);
      if (!issue) return;
      const seg = data.transcript.find((s) => s.id === issue.segmentId);
      if (!seg) return;
      // Selection only — no auto-playback. Highlights segment in transcript
      // and scrolls into view.
      setActiveIssueId(issueId);
      setActiveSegmentId(seg.id);
      setMobileTab("transcript");
    },
    [data],
  );

  const handlePlayIssueOriginal = useCallback(
    (issueId: string) => {
      if (!data) return;
      const issue = data.issues.find((i) => i.id === issueId);
      if (!issue) return;
      const seg = data.transcript.find((s) => s.id === issue.segmentId);
      if (!seg) return;
      setActiveIssueId(issueId);
      setActiveSegmentId(seg.id);
      if (!data.meta.audioFile) return;
      if (playingSegmentId === seg.id) {
        pauseAll();
      } else {
        // Issue-card playback is always a single playthrough — the loop
        // toggle is a transcript/shadowing affordance, not a verification one.
        playSegment(seg, { loop: false });
      }
    },
    [data, playSegment, pauseAll, playingSegmentId],
  );

  const handleSpeakIssueSuggested = useCallback(
    (issueId: string) => {
      if (!data) return;
      const issue = data.issues.find((i) => i.id === issueId);
      if (!issue) return;
      // Toggle: same issue → stop. Different issue → cancel + start new.
      if (speakingIssueId === issueId) {
        cancelSpeech();
        setSpeakingIssueId(null);
        return;
      }
      waveformRef.current?.pause();
      setPlayingSegmentId(null);
      setActiveIssueId(issueId);
      const utterance = speak(issue.suggested);
      setSpeakingIssueId(issueId);
      const onDone = () => setSpeakingIssueId(null);
      utterance.addEventListener("end", onDone, { once: true });
      utterance.addEventListener("error", onDone, { once: true });
    },
    [data, speakingIssueId],
  );

  const handleWaveformPause = useCallback(() => {
    setPlayingSegmentId(null);
  }, []);

  const filteredIssues = useMemo(() => {
    if (!data || !issueFilterTopic) return data?.issues ?? [];
    const topic = issueFilterTopic.toLowerCase();
    return data.issues.filter(
      (i) =>
        i.original.toLowerCase().includes(topic) ||
        i.suggested.toLowerCase().includes(topic) ||
        i.explanation.toLowerCase().includes(topic),
    );
  }, [data, issueFilterTopic]);

  if (!id) return <div className="p-8">Missing id.</div>;
  if (error) return <div className="p-8 text-red-600 dark:text-red-400">Error: {error}</div>;
  if (!data) return <div className="p-8 text-zinc-400 dark:text-zinc-500">Loading…</div>;

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 dark:bg-zinc-950">
      <header className="px-4 sm:px-6 py-3 sm:py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            to="/"
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            ← All reviews
          </Link>
          <div className="text-sm sm:text-base font-medium truncate mt-0.5">
            {data.meta.title ?? data.meta.sourceFilename}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:block">
            {formatDate(data.meta.createdAt)} · {formatDuration(data.meta.durationSec)}
            {data.meta.title && (
              <span className="text-zinc-400 dark:text-zinc-600">
                {" "}
                · {data.meta.sourceFilename}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to={`/practice/${id}`}
            className="rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm px-3 sm:px-3.5 py-1.5 sm:py-2 font-medium shadow-sm"
          >
            🎯 <span className="hidden xs:inline">Practice </span>({data.issues.length})
          </Link>
          <div className="hidden md:block">
            <VoicePicker />
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="hidden lg:block">
        <SummaryCard
          summary={data.summary}
          reviewId={id}
          onTopMistakeClick={(topic) => {
            setIssueFilterTopic(topic);
            setMobileTab("issues");
          }}
          activeFilterTopic={issueFilterTopic}
        />
      </div>

      <div className="lg:hidden border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="flex">
          <TabButton active={mobileTab === "transcript"} onClick={() => setMobileTab("transcript")}>
            字幕
          </TabButton>
          {data.coaching && (
            <TabButton active={mobileTab === "coaching"} onClick={() => setMobileTab("coaching")}>
              话术
            </TabButton>
          )}
          <TabButton active={mobileTab === "issues"} onClick={() => setMobileTab("issues")}>
            错题 ({data.issues.length})
          </TabButton>
          <TabButton active={mobileTab === "summary"} onClick={() => setMobileTab("summary")}>
            总结
          </TabButton>
        </div>
      </div>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_400px] overflow-hidden">
        <div
          className={[
            "overflow-y-auto border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900",
            mobileTab !== "transcript" ? "hidden lg:block" : "",
          ].join(" ")}
        >
          <TranscriptPane
            transcript={data.transcript}
            issues={data.issues}
            activeSegmentId={activeSegmentId}
            playingSegmentId={playingSegmentId}
            onSegmentClick={handleSegmentClick}
          />
        </div>
        <div
          className={[
            "overflow-y-auto bg-stone-50 dark:bg-zinc-950",
            mobileTab !== "issues" ? "hidden lg:block" : "",
          ].join(" ")}
        >
          {data.coaching && <CoachingPanel coaching={data.coaching} />}
          <IssuesPane
            issues={filteredIssues}
            totalIssues={data.issues.length}
            activeIssueId={activeIssueId}
            playingSegmentId={playingSegmentId}
            canPlayOriginal={Boolean(data.meta.audioFile)}
            speakingIssueId={speakingIssueId}
            onIssueSelect={handleIssueSelect}
            onPlayOriginal={handlePlayIssueOriginal}
            onSpeakSuggested={handleSpeakIssueSuggested}
            filterTopic={issueFilterTopic}
            onClearFilter={() => setIssueFilterTopic(null)}
            practice={practice}
          />
        </div>

        {mobileTab === "coaching" && data.coaching && (
          <div className="lg:hidden overflow-y-auto bg-stone-50 dark:bg-zinc-950">
            <CoachingPanel coaching={data.coaching} />
          </div>
        )}

        {mobileTab === "summary" && (
          <div className="lg:hidden overflow-y-auto bg-stone-50 dark:bg-zinc-950">
            <SummaryCard
              summary={data.summary}
              reviewId={id}
              onTopMistakeClick={(topic) => {
                setIssueFilterTopic(topic);
                setMobileTab("issues");
              }}
              activeFilterTopic={issueFilterTopic}
            />
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <Waveform
          ref={waveformRef}
          reviewId={id}
          transcript={data.transcript}
          issues={data.issues}
          hasAudio={Boolean(data.meta.audioFile)}
          loopSingle={loopSingle}
          onLoopToggle={setLoopSingle}
          onSegmentEnter={setActiveSegmentId}
          onPause={handleWaveformPause}
        />
      </footer>
    </div>
  );
}

function TabButton({
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
        "flex-1 px-3 py-2 text-xs font-medium border-b-2 transition",
        active
          ? "border-blue-500 text-zinc-900 dark:text-zinc-100"
          : "border-transparent text-zinc-500 dark:text-zinc-400",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
