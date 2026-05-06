// Browser-native TTS via Web Speech API.
// On iOS Safari, getVoices() returns the device's installed voices including
// any Premium voices the user has downloaded in Settings → Accessibility →
// Spoken Content. The picked voice URI is persisted in localStorage.

const VOICE_KEY = "speaking-review.voiceURI";

export function listEnglishVoices(): SpeechSynthesisVoice[] {
  const voices = window.speechSynthesis.getVoices();
  return voices.filter((v) => v.lang.startsWith("en"));
}

export function getSelectedVoice(): SpeechSynthesisVoice | undefined {
  const stored = localStorage.getItem(VOICE_KEY);
  const voices = listEnglishVoices();
  if (stored) {
    const found = voices.find((v) => v.voiceURI === stored);
    if (found) return found;
  }
  // Default: prefer en-GB > en-US, prefer non-default labels (Premium often
  // doesn't have "default" tag but has higher quality).
  return (
    voices.find((v) => v.lang === "en-GB" && v.name.includes("Premium")) ??
    voices.find((v) => v.lang === "en-GB") ??
    voices.find((v) => v.lang === "en-US" && v.name.includes("Premium")) ??
    voices.find((v) => v.lang === "en-US") ??
    voices[0]
  );
}

export function setSelectedVoice(voiceURI: string): void {
  localStorage.setItem(VOICE_KEY, voiceURI);
}

export function speak(text: string, opts: { rate?: number } = {}): SpeechSynthesisUtterance {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = getSelectedVoice();
  if (v) u.voice = v;
  u.rate = opts.rate ?? 0.95;
  window.speechSynthesis.speak(u);
  return u;
}

export function cancelSpeech(): void {
  window.speechSynthesis.cancel();
}

export function onVoicesReady(cb: () => void): () => void {
  if (window.speechSynthesis.getVoices().length > 0) {
    cb();
    return () => {};
  }
  const handler = () => cb();
  window.speechSynthesis.addEventListener("voiceschanged", handler);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", handler);
}
