// Plays a [start, end] range of an audio URL with auto-pause at end.
// Used by Practice mode to play a single segment without involving the
// shared wavesurfer instance on the review page.

export interface RangeClipPlayer {
  playRange: (startSec: number, endSec: number) => Promise<void>;
  /** Plays a range and resolves when playback finishes (or is paused). */
  playRangeAndWait: (startSec: number, endSec: number) => Promise<void>;
  pause: () => void;
  destroy: () => void;
}

export function createRangeClipPlayer(url: string): RangeClipPlayer {
  const audio = new Audio(url);
  audio.preload = "auto";
  let stopAt = Infinity;
  const onTime = () => {
    if (audio.currentTime >= stopAt) {
      audio.pause();
      stopAt = Infinity;
    }
  };
  audio.addEventListener("timeupdate", onTime);

  return {
    pause() {
      audio.pause();
    },
    async playRange(startSec, endSec) {
      stopAt = endSec;
      audio.currentTime = startSec;
      await audio.play();
    },
    playRangeAndWait(startSec, endSec) {
      return new Promise<void>((resolve) => {
        stopAt = endSec;
        audio.currentTime = startSec;
        const done = () => {
          audio.removeEventListener("pause", done);
          audio.removeEventListener("ended", done);
          resolve();
        };
        audio.addEventListener("pause", done, { once: true });
        audio.addEventListener("ended", done, { once: true });
        void audio.play();
      });
    },
    destroy() {
      audio.removeEventListener("timeupdate", onTime);
      audio.pause();
      audio.src = "";
    },
  };
}

export function playElementAndWait(url: string): Promise<HTMLAudioElement> {
  return new Promise((resolve) => {
    const a = new Audio(url);
    const done = () => resolve(a);
    a.addEventListener("ended", done, { once: true });
    a.addEventListener("pause", done, { once: true });
    a.addEventListener("error", done, { once: true });
    void a.play();
  });
}

export function speakAndWait(text: string, rate: number): Promise<void> {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    const sel = window.speechSynthesis.getVoices().find((v) => {
      const stored = localStorage.getItem("speaking-review.voiceURI");
      return stored ? v.voiceURI === stored : v.lang.startsWith("en");
    });
    if (sel) u.voice = sel;
    const done = () => resolve();
    u.addEventListener("end", done, { once: true });
    u.addEventListener("error", done, { once: true });
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
