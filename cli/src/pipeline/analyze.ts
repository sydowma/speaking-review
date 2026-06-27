// Single Claude call: speaker labeling + issue extraction + summary.
// Uses prompt caching on the system prompt so repeated runs are cheap.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type {
  Issue,
  ReviewCoaching,
  ReviewSummary,
  Speaker,
  TranscriptSegment,
} from "@shared/types.ts";
import { ANALYSIS_SYSTEM_PROMPT } from "./prompts.ts";
import type { WhisperSegment } from "./whisper.ts";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const MAX_TOKENS = 16_000;

interface ClaudeResponse {
  title?: string;
  transcript: Array<{ id: string; speaker: Speaker }>;
  issues: Array<Omit<Issue, "id"> & { id?: string }>;
  summary: ReviewSummary;
  coaching?: ReviewCoaching;
}

export interface AnalyzeResult {
  title?: string;
  transcript: TranscriptSegment[];
  issues: Issue[];
  summary: ReviewSummary;
  coaching?: ReviewCoaching;
}

export async function analyze(segments: WhisperSegment[]): Promise<AnalyzeResult> {
  if (shouldUseCodex()) return await analyzeWithCodex(segments);

  const credential = process.env.ANTHROPIC_API_KEY;
  if (!credential) throw new Error("ANTHROPIC_API_KEY is not set");
  // Claude Code OAuth tokens (sk-ant-oat...) authenticate via Bearer token
  // and require the oauth beta header. Regular API keys (sk-ant-api...)
  // authenticate via x-api-key.
  const isOAuth = credential.startsWith("sk-ant-oat");

  const transcriptInput: TranscriptSegment[] = segments.map((s, i) => ({
    id: `s${i}`,
    startSec: s.startSec,
    endSec: s.endSec,
    speaker: s.speaker ?? "user", // placeholder for whisper input, known for provider transcripts
    text: s.text,
    issueIds: [],
  }));

  const userMessage = JSON.stringify(
    transcriptInput.map(({ id, startSec, endSec, speaker, text }) => ({
      id,
      startSec: round(startSec, 2),
      endSec: round(endSec, 2),
      speaker,
      text,
    })),
  );

  const client = isOAuth
    ? new Anthropic({
        authToken: credential,
        defaultHeaders: { "anthropic-beta": "oauth-2025-04-20" },
      })
    : new Anthropic({ apiKey: credential });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: "text",
        text: ANALYSIS_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = parseClaudeJson(text);

  // Apply speaker labels.
  const speakerById = new Map(parsed.transcript.map((t) => [t.id, t.speaker]));
  for (const seg of transcriptInput) {
    seg.speaker = speakerById.get(seg.id) ?? seg.speaker;
  }

  // Materialize issues with stable IDs and back-link from segments.
  const issues: Issue[] = parsed.issues.map((i) => ({
    id: i.id ?? randomUUID(),
    segmentId: i.segmentId,
    severity: i.severity,
    category: i.category,
    original: i.original,
    suggested: i.suggested,
    explanation: i.explanation,
    bandImpact: i.bandImpact,
  }));

  const segById = new Map(transcriptInput.map((s) => [s.id, s]));
  for (const issue of issues) {
    const seg = segById.get(issue.segmentId);
    if (seg) seg.issueIds.push(issue.id);
  }

  return {
    title: parsed.title,
    transcript: transcriptInput,
    issues,
    summary: parsed.summary,
    coaching: parsed.coaching,
  };
}

async function analyzeWithCodex(segments: WhisperSegment[]): Promise<AnalyzeResult> {
  const transcriptInput: TranscriptSegment[] = segments.map((s, i) => ({
    id: `s${i}`,
    startSec: s.startSec,
    endSec: s.endSec,
    speaker: s.speaker ?? "user",
    text: s.text,
    issueIds: [],
  }));
  const dir = await mkdtemp(join(tmpdir(), "speaking-review-codex-"));
  const inputPath = join(dir, "transcript.json");
  const outputPath = join(dir, "analysis.json");
  await writeFile(
    inputPath,
    JSON.stringify(
      transcriptInput.map(({ id, startSec, endSec, speaker, text }) => ({
        id,
        startSec: round(startSec, 2),
        endSec: round(endSec, 2),
        speaker,
        text,
      })),
      null,
      2,
    ),
  );

  const prompt = `Read ${inputPath}. It contains timestamped English lesson transcript segments. Segments already include the known speaker label ("user" is the learner, "teacher" is the tutor). Produce only one JSON object with this exact shape: {"title": string, "transcript": [{"id": string, "speaker": "user"|"teacher"}], "issues": [{"id": string, "segmentId": string, "severity": "critical"|"moderate"|"minor", "category": "grammar"|"vocabulary"|"fluency"|"pronunciation"|"discourse", "original": string, "suggested": string, "explanation": string in Chinese, "bandImpact": string}], "summary": {"estimatedBandLow": number, "estimatedBandHigh": number, "topMistakes": string[] in Chinese, "strengths": string[] in Chinese, "recommendations": string[] in Chinese, "fillerWordCount": number, "userTalkRatio": number}, "coaching": {"priorities": string[] in Chinese, "phraseRewrites": [{"id": string, "situation": string, "sourceSegmentIds": string[], "before": string, "after": string, "why": string in Chinese}], "practiceDrills": [{"id": string, "title": string in Chinese, "focus": string in Chinese, "minutes": number, "steps": string[] in Chinese}]}}. Focus issues only on learner/user segments. Keep 15-30 high-signal issues. For coaching, add 3 priorities, 4-8 reusable polished speaking scripts based on actual user topics, and 3 concrete drills. No markdown, no prose.`;

  await runCodex(prompt, outputPath);
  const parsed = parseClaudeJson(await readFile(outputPath, "utf8"));

  const speakerById = new Map(parsed.transcript.map((t) => [t.id, t.speaker]));
  for (const seg of transcriptInput) {
    seg.speaker = speakerById.get(seg.id) ?? seg.speaker;
  }

  const issues: Issue[] = parsed.issues.map((i) => ({
    id: i.id ?? randomUUID(),
    segmentId: i.segmentId,
    severity: i.severity,
    category: i.category,
    original: i.original,
    suggested: i.suggested,
    explanation: i.explanation,
    bandImpact: i.bandImpact,
  }));

  const segById = new Map(transcriptInput.map((s) => [s.id, s]));
  for (const issue of issues) {
    const seg = segById.get(issue.segmentId);
    if (seg) seg.issueIds.push(issue.id);
  }

  return {
    title: parsed.title,
    transcript: transcriptInput,
    issues,
    summary: parsed.summary,
    coaching: parsed.coaching,
  };
}

function shouldUseCodex(): boolean {
  const analyzer = process.env.SPEAKING_REVIEW_ANALYZER?.toLowerCase();
  if (analyzer === "codex") return true;
  if (analyzer === "claude" || analyzer === "anthropic") return false;
  return !process.env.ANTHROPIC_API_KEY && Boolean(process.env.PATH);
}

async function runCodex(prompt: string, outputPath: string): Promise<void> {
  const codexBin = process.env.CODEX_BIN ?? "codex";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      codexBin,
      ["exec", "--sandbox", "read-only", "--ephemeral", "-o", outputPath, prompt],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      if ("code" in err && err.code === "ENOENT") {
        reject(new Error("codex was not found. Set ANTHROPIC_API_KEY or install Codex CLI."));
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `codex exited with code ${code ?? "unknown"}`));
    });
  });
}

function parseClaudeJson(text: string): ClaudeResponse {
  // Claude sometimes wraps JSON in ```json fences even when asked not to.
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end < 0) {
    throw new Error(`Claude response not JSON: ${text.slice(0, 200)}`);
  }
  return JSON.parse(stripped.slice(start, end + 1)) as ClaudeResponse;
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
