import { useEffect, useState } from "react";
import {
  getSelectedVoice,
  listEnglishVoices,
  onVoicesReady,
  setSelectedVoice,
  speak,
} from "../lib/tts.ts";

export function VoicePicker(): React.ReactElement {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedURI, setSelectedURI] = useState<string>("");

  useEffect(() => {
    return onVoicesReady(() => {
      setVoices(listEnglishVoices());
      setSelectedURI(getSelectedVoice()?.voiceURI ?? "");
    });
  }, []);

  if (voices.length === 0) {
    return <span className="text-xs text-zinc-400 dark:text-zinc-500">TTS unavailable</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-md px-2 py-1.5 text-xs max-w-[220px] hover:border-zinc-400 dark:hover:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
        value={selectedURI}
        onChange={(e) => {
          setSelectedURI(e.target.value);
          setSelectedVoice(e.target.value);
        }}
      >
        {voices.map((v) => (
          <option key={v.voiceURI} value={v.voiceURI}>
            {v.name} ({v.lang})
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => speak("This is how the correction will sound.")}
        className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 px-1.5 py-1"
        title="Test voice"
      >
        🔊
      </button>
    </div>
  );
}
