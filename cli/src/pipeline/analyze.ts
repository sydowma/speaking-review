// Single Claude call: speaker labeling + issue extraction + summary.
// Uses prompt caching on the system prompt so repeated runs are cheap.

import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { ANALYSIS_SYSTEM_PROMPT } from "./prompts.ts";
import type { WhisperSegment } from "./whisper.ts";
import type {
  Issue,
  ReviewSummary,
  Speaker,
  TranscriptSegment,
} from "@shared/types.ts";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const MAX_TOKENS = 16_000;

interface ClaudeResponse {
  title?: string;
  transcript: Array<{ id: string; speaker: Speaker }>;
  issues: Array<Omit<Issue, "id"> & { id?: string }>;
  summary: ReviewSummary;
}

export interface AnalyzeResult {
  title?: string;
  transcript: TranscriptSegment[];
  issues: Issue[];
  summary: ReviewSummary;
}

export async function analyze(segments: WhisperSegment[]): Promise<AnalyzeResult> {
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
    speaker: "user",            // placeholder, overwritten below
    text: s.text,
    issueIds: [],
  }));

  const userMessage = JSON.stringify(
    transcriptInput.map(({ id, startSec, endSec, text }) => ({
      id,
      startSec: round(startSec, 2),
      endSec: round(endSec, 2),
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
    messages: [
      { role: "user", content: userMessage },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = parseClaudeJson(text);

  // Apply speaker labels.
  const speakerById = new Map(parsed.transcript.map((t) => [t.id, t.speaker]));
  for (const seg of transcriptInput) {
    seg.speaker = speakerById.get(seg.id) ?? "user";
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
  };
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
