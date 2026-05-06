// Microphone recording via MediaRecorder API. Returns a blob and an object URL
// for in-page playback. Stream is released after each recording.

export interface RecordingResult {
  blob: Blob;
  url: string;
  durationSec: number;
}

export class MicRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;

  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(stream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start();
    this.startedAt = performance.now();
    this.mediaRecorder.addEventListener("stop", () => {
      stream.getTracks().forEach((t) => t.stop());
    }, { once: true });
  }

  stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      const recorder = this.mediaRecorder;
      if (!recorder) {
        reject(new Error("not recording"));
        return;
      }
      recorder.addEventListener(
        "stop",
        () => {
          const blob = new Blob(this.chunks, { type: recorder.mimeType });
          const url = URL.createObjectURL(blob);
          const durationSec = (performance.now() - this.startedAt) / 1000;
          this.mediaRecorder = null;
          this.chunks = [];
          resolve({ blob, url, durationSec });
        },
        { once: true },
      );
      recorder.stop();
    });
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === "recording";
  }
}
