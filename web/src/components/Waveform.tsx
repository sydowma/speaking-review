import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import type { Issue, TranscriptSegment } from "@shared/types.ts";
import { audioUrl } from "../lib/reviewApi.ts";
import { formatTimestamp } from "../lib/format.ts";
import { loadPref, resolvePref, subscribe } from "../lib/theme.ts";

export interface WaveformHandle {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (sec: number) => void;
  /** Play [start, end) and auto-pause at end. If loop, restart at start. */
  playRange: (startSec: number, endSec: number, opts?: { loop?: boolean }) => void;
}

interface Props {
  reviewId: string;
  transcript: TranscriptSegment[];
  issues: Issue[];
  loopSingle: boolean;
  onLoopToggle: (loop: boolean) => void;
  onSegmentEnter?: (segmentId: string) => void;
  /** Fires whenever playback stops — natural end, user pause, or scrub. */
  onPause?: () => void;
}

const COLORS_LIGHT = {
  wave: "#cbd5e1",
  progress: "#3b82f6",
  cursor: "#1e40af",
  region: "rgba(239,68,68,0.18)",
};

const COLORS_DARK = {
  wave: "#3f3f46",
  progress: "#60a5fa",
  cursor: "#93c5fd",
  region: "rgba(248,113,113,0.22)",
};

export const Waveform = forwardRef<WaveformHandle, Props>(function Waveform(
  { reviewId, transcript, issues, loopSingle, onLoopToggle, onSegmentEnter, onPause },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const rangeRef = useRef<{ start: number; end: number; loop: boolean } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const initialColors = resolvePref(loadPref()) === "dark" ? COLORS_DARK : COLORS_LIGHT;
    const regions = RegionsPlugin.create();
    const ws = WaveSurfer.create({
      container: containerRef.current,
      url: audioUrl(reviewId),
      waveColor: initialColors.wave,
      progressColor: initialColors.progress,
      cursorColor: initialColors.cursor,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 64,
      plugins: [regions],
    });
    wsRef.current = ws;

    ws.on("ready", (d) => {
      setDuration(d);
      const issueSegmentIds = new Set(issues.map((i) => i.segmentId));
      for (const seg of transcript) {
        if (seg.speaker !== "user" || !issueSegmentIds.has(seg.id)) continue;
        const colors = resolvePref(loadPref()) === "dark" ? COLORS_DARK : COLORS_LIGHT;
        regions.addRegion({
          id: seg.id,
          start: seg.startSec,
          end: seg.endSec,
          color: colors.region,
          drag: false,
          resize: false,
        });
      }
    });
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => {
      setIsPlaying(false);
      onPause?.();
    });
    ws.on("audioprocess", (t) => {
      setCurrentTime(t);
      const r = rangeRef.current;
      if (!r) return;
      if (t >= r.end - 0.02) {
        if (r.loop) {
          ws.setTime(r.start);
        } else {
          ws.pause();
          rangeRef.current = null;
        }
      }
    });
    ws.on("seeking", (t) => setCurrentTime(t));
    ws.on("interaction", () => {
      rangeRef.current = null;
    });

    regions.on("region-clicked", (region, e) => {
      e.stopPropagation();
      onSegmentEnter?.(region.id);
      rangeRef.current = { start: region.start, end: region.end, loop: false };
      ws.setTime(region.start);
      void ws.play();
    });

    // React to theme changes by swapping waveform colors live.
    const unsub = subscribe(() => {
      const colors = resolvePref(loadPref()) === "dark" ? COLORS_DARK : COLORS_LIGHT;
      ws.setOptions({
        waveColor: colors.wave,
        progressColor: colors.progress,
        cursorColor: colors.cursor,
      });
    });

    return () => {
      unsub();
      ws.destroy();
      wsRef.current = null;
    };
  }, [reviewId, transcript, issues, onSegmentEnter, onPause]);

  useImperativeHandle(ref, () => ({
    play: () => void wsRef.current?.play(),
    pause: () => wsRef.current?.pause(),
    toggle: () => void wsRef.current?.playPause(),
    seek: (sec: number) => {
      const ws = wsRef.current;
      if (!ws) return;
      ws.setTime(Math.max(0, Math.min(sec, ws.getDuration() || sec)));
    },
    playRange: (startSec, endSec, opts) => {
      const ws = wsRef.current;
      if (!ws) return;
      rangeRef.current = { start: startSec, end: endSec, loop: opts?.loop ?? false };
      ws.setTime(startSec);
      void ws.play();
    },
  }));

  return (
    <div className="px-3 sm:px-4 py-2.5 sm:py-3">
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => wsRef.current?.playPause()}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 text-white text-sm shadow-sm shrink-0"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>
        <div className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 tabular-nums w-14 sm:w-20 shrink-0">
          {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
        </div>
        <div ref={containerRef} className="flex-1 min-w-0" />
        <label className="flex items-center gap-1.5 text-[11px] sm:text-xs text-zinc-600 dark:text-zinc-300 select-none cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={loopSingle}
            onChange={(e) => onLoopToggle(e.target.checked)}
            className="rounded accent-blue-600"
          />
          <span className="hidden sm:inline">循环单句</span>
          <span className="sm:hidden">↻</span>
        </label>
      </div>
    </div>
  );
});
