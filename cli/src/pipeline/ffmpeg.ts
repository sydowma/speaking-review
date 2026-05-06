// Audio extraction: any video/audio file → 16kHz mono PCM WAV (whisper-cpp's required format).

import { spawn } from "node:child_process";

export interface ExtractResult {
  durationSec: number;
}

export async function extractAudio(input: string, output: string): Promise<ExtractResult> {
  await runFfmpeg([
    "-y",
    "-i", input,
    "-ar", "16000",
    "-ac", "1",
    "-c:a", "pcm_s16le",
    output,
  ]);
  return { durationSec: await probeDuration(output) };
}

async function probeDuration(file: string): Promise<number> {
  const stderr = await runFfmpegCapture(["-i", file]);
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  if (!match) throw new Error("ffmpeg: could not parse duration");
  const [, h, m, s] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${err.slice(-500)}`));
    });
  });
}

function runFfmpegCapture(args: string[]): Promise<string> {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("close", () => resolve(err));
  });
}
