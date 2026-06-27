import { spawn } from "node:child_process";

export interface CamblyOpenCliOptions {
  opencliSession?: string;
  opencliBin?: string;
  downloadPattern?: string;
  downloadTimeoutMs?: number;
}

export interface OpenCliDownloadResult {
  downloaded: boolean;
  id?: number;
  filename?: string;
  url?: string;
  finalUrl?: string;
  mime?: string;
  totalBytes?: number;
  state?: string;
  danger?: string;
  error?: string;
  elapsedMs?: number;
}

export interface OpenCliResolvedVideo {
  url: string;
  suggestedFilename: string;
  lessonUrl?: string;
}

export interface OpenCliCamblyVideoCandidate {
  chatId: string;
  lessonUrl: string;
  suggestedFilename: string;
  recordedAt?: string;
  tutorId?: string;
}

export interface OpenCliDownloadWaiter {
  promise: Promise<OpenCliDownloadResult>;
  cancel: () => void;
}

export interface OpenCliVideoEndpointClickResult {
  clicked: boolean;
  chatId?: string;
}

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 120_000;

export function usesOpenCli(options: CamblyOpenCliOptions): boolean {
  return Boolean(options.opencliSession?.trim() || process.env.CAMBLY_OPENCLI_SESSION?.trim());
}

export async function openCamblyWithOpenCli(
  url: string,
  options: CamblyOpenCliOptions,
): Promise<void> {
  await runOpenCliJson(options, ["browser", sessionName(options), "open", url], 60_000);
}

export async function listCamblyLinksWithOpenCli(
  options: CamblyOpenCliOptions,
): Promise<Array<{ href: string; text: string }>> {
  const result = await evalWithOpenCli(
    options,
    `(() => Array.from(document.querySelectorAll("a")).map((anchor) => ({
      href: anchor.href,
      text: (anchor.textContent || "").replace(/\\s+/g, " ").trim(),
    })))()`,
  );
  return Array.isArray(result) ? result.filter(isOpenCliLink) : [];
}

export async function clickDownloadWithOpenCli(
  options: CamblyOpenCliOptions,
): Promise<{ clicked: boolean; text?: string; url?: string }> {
  const result = await evalWithOpenCli(
    options,
    `(() => {
      const candidates = Array.from(document.querySelectorAll("button,a,[role='button']"));
      const download = candidates.find((node) => {
        const el = node;
        const label = [
          el.textContent,
          el.getAttribute && el.getAttribute("aria-label"),
          el.getAttribute && el.getAttribute("title"),
          el.getAttribute && el.getAttribute("download"),
        ].filter(Boolean).join(" ");
        return /download|下载/i.test(label);
      });
      if (!download) {
        return { clicked: false, url: location.href };
      }
      download.scrollIntoView({ block: "center", inline: "center" });
      download.click();
      return {
        clicked: true,
        text: (download.textContent || "").replace(/\\s+/g, " ").trim(),
        url: location.href,
      };
    })()`,
  );
  return isClickResult(result) ? result : { clicked: false };
}

export async function listCamblyDownloadableVideosWithOpenCli(
  options: CamblyOpenCliOptions,
  limit: number,
): Promise<OpenCliCamblyVideoCandidate[]> {
  const result = await evalWithOpenCli(
    options,
    `(async () => {
      const current = await fetch("/api/users/current?viewAs=student", {
        credentials: "include",
      }).then((response) => response.json());
      const userId = current?.result?.id || current?.result?.userId || current?.result?._id?.$oid;
      if (!userId) return [];

      const params = new URLSearchParams();
      params.set("language", "en");
      params.set("userId", userId);
      params.set("role", "student");
      params.append("state[]", "1");
      params.append("state[]", "2");
      params.set("sort", "-1");
      params.set("limit", String(${JSON.stringify(Math.max(limit * 5, 50))}));
      params.set("extraQuery", JSON.stringify({ startTime: { $lt: Date.now() } }));
      params.set("viewAs", "student");
      params.set("_", String(Date.now()));

      const data = await fetch(\`/api/chats?\${params}\`, {
        credentials: "include",
      }).then((response) => response.json());

      return (data.result || [])
        .filter((chat) => chat && chat.hasVideoUrl && (chat.id || chat._id?.$oid))
        .map((chat) => {
          const chatId = chat.id || chat._id.$oid;
          const rawRecordedAt = chat.endTimeDt?.$date || chat.endTime || chat.startTimeDt?.$date || chat.startTime;
          const recordedAtMs = rawRecordedAt ? new Date(rawRecordedAt).getTime() : 0;
          const recordedAt = Number.isFinite(recordedAtMs) && recordedAtMs > 0
            ? new Date(recordedAtMs).toISOString()
            : undefined;
          const tutorId = typeof chat.tutor === "string"
            ? chat.tutor
            : chat.tutor?.id || chat.tutor?._id?.$oid || chat.tutorId;
          return {
            chatId,
            lessonUrl: \`https://www.cambly.com/api/chats/\${chatId}/video\`,
            suggestedFilename: \`cambly-\${chatId}.mp4\`,
            recordedAt,
            tutorId,
            sortAt: recordedAtMs || 0,
          };
        })
        .sort((a, b) => b.sortAt - a.sortAt)
        .slice(0, ${JSON.stringify(Math.max(limit, 1))})
        .map(({ sortAt, ...candidate }) => candidate);
    })()`,
  );
  return Array.isArray(result) ? result.filter(isCamblyVideoCandidate) : [];
}

export async function listRecentCamblyChatIdsWithOpenCli(
  options: CamblyOpenCliOptions,
): Promise<string[]> {
  const result = await runOpenCliJson(
    options,
    ["browser", sessionName(options), "network", "--since", "10m", "--filter", "chats"],
    60_000,
  );
  if (!isNetworkSnapshot(result)) return [];

  const ids: string[] = [];
  const entries = [...result.entries].sort(compareNetworkEntryDesc);
  for (const entry of entries) {
    const chatId = extractChatId(entry.url);
    if (chatId && !ids.includes(chatId)) ids.push(chatId);
  }
  return ids;
}

export async function resetCamblyHistoryScrollWithOpenCli(
  options: CamblyOpenCliOptions,
): Promise<void> {
  await evalWithOpenCli(
    options,
    `(() => {
      const scrollTop = () => {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        for (const el of document.querySelectorAll("*")) {
          if (el.scrollHeight > el.clientHeight) el.scrollTop = 0;
          if (el.scrollWidth > el.clientWidth) el.scrollLeft = 0;
        }
      };

      const lessonHistory = Array.from(document.querySelectorAll("[role='tab'],[role='button'],button,a")).find((node) =>
        /lesson history|历史/i.test((node.textContent || "").replace(/\\s+/g, " ").trim())
      );
      if (lessonHistory) lessonHistory.click();
      scrollTop();
      setTimeout(scrollTop, 0);
      setTimeout(scrollTop, 500);
      return { scrolled: true };
    })()`,
  );
}

export async function clickCamblyVideoEndpointWithOpenCli(
  chatId: string,
  options: CamblyOpenCliOptions,
): Promise<OpenCliVideoEndpointClickResult> {
  if (!/^[a-f0-9]{24}$/i.test(chatId)) return { clicked: false };
  await openCamblyWithOpenCli(`https://www.cambly.com/api/chats/${chatId}/video`, options);
  return { clicked: true, chatId };
}

export async function resolveCamblyVideoWithOpenCli(
  options: CamblyOpenCliOptions,
): Promise<OpenCliResolvedVideo | undefined> {
  const result = await evalWithOpenCli(
    options,
    `(() => {
      const video = document.querySelector("video");
      const videoUrl = video && (video.currentSrc || video.src) || "";
      const downloadLink = Array.from(document.querySelectorAll("a[href]")).find((anchor) =>
        /\\/api\\/chats\\/[^/]+\\/video/i.test(anchor.href)
      );
      const linkUrl = downloadLink ? downloadLink.href : "";
      const url = videoUrl && !videoUrl.startsWith("blob:") ? videoUrl : linkUrl;
      if (!url) return null;

      let filename = "cambly-lesson.mp4";
      try {
        const path = new URL(url).pathname;
        const tail = path.split("/").filter(Boolean).pop();
        if (tail) filename = tail;
      } catch {}

      filename = filename.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
      if (!/\\.[a-z0-9]{1,8}$/i.test(filename)) filename = \`\${filename || "cambly-lesson"}.mp4\`;

      return {
        url,
        suggestedFilename: filename,
        lessonUrl: linkUrl || undefined,
      };
    })()`,
  );
  return isResolvedVideo(result) ? result : undefined;
}

export function waitForOpenCliDownload(options: CamblyOpenCliOptions): OpenCliDownloadWaiter {
  const args = ["browser", sessionName(options), "wait", "download"];
  const pattern = options.downloadPattern ?? process.env.CAMBLY_DOWNLOAD_PATTERN ?? ".mp4";
  if (pattern) args.push(pattern);
  const timeoutMs = options.downloadTimeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS;
  args.push("--timeout", String(timeoutMs));

  const child = spawn(openCliBin(options), args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let timedOut = false;

  const promise = new Promise<OpenCliDownloadResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      timedOut = true;
      if (!child.killed) child.kill("SIGTERM");
    }, timeoutMs + 1_000);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => reject(wrapOpenCliError(err)));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (signal) {
        reject(
          new Error(
            timedOut
              ? `No download matched ${JSON.stringify(pattern)} within ${timeoutMs}ms`
              : `opencli download wait was canceled by ${signal}`,
          ),
        );
        return;
      }
      const parsed = parseJsonOutput(stdout);
      if (code === 0 && isDownloadResult(parsed)) {
        resolve(parsed);
        return;
      }
      const message = extractOpenCliError(parsed) ?? stderr.trim() ?? stdout.trim();
      reject(new Error(message || `opencli exited with code ${code ?? "unknown"}`));
    });
  });

  return {
    promise,
    cancel: () => {
      if (!child.killed) child.kill("SIGTERM");
    },
  };
}

async function evalWithOpenCli(options: CamblyOpenCliOptions, code: string): Promise<unknown> {
  return runOpenCliJson(options, ["browser", sessionName(options), "eval", code], 60_000);
}

async function runOpenCliJson(
  options: CamblyOpenCliOptions,
  args: string[],
  timeoutMs: number,
): Promise<unknown> {
  const stdout = await runOpenCli(options, args, timeoutMs);
  return parseJsonOutput(stdout);
}

async function runOpenCli(
  options: CamblyOpenCliOptions,
  args: string[],
  timeoutMs: number,
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(openCliBin(options), args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`opencli timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(wrapOpenCliError(err));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `opencli exited with code ${code}`));
    });
  });
}

function sessionName(options: CamblyOpenCliOptions): string {
  const session = options.opencliSession ?? process.env.CAMBLY_OPENCLI_SESSION;
  if (!session?.trim()) {
    throw new Error("--opencli-session or CAMBLY_OPENCLI_SESSION is required for OpenCLI mode.");
  }
  return session.trim();
}

function openCliBin(options: CamblyOpenCliOptions): string {
  return options.opencliBin ?? process.env.CAMBLY_OPENCLI_BIN ?? "opencli";
}

function parseJsonOutput(stdout: string): unknown {
  const text = stdout.trim();
  if (!text) return undefined;
  const exact = tryParseJson(text);
  if (exact.ok) return exact.value;

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const objectValue = tryParseJson(text.slice(start, end + 1));
    if (objectValue.ok) return objectValue.value;
  }

  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    const arrayValue = tryParseJson(text.slice(arrayStart, arrayEnd + 1));
    if (arrayValue.ok) return arrayValue.value;
  }

  return text;
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function extractOpenCliError(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const error = value.error;
  if (typeof error === "string") return error;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return undefined;
}

function wrapOpenCliError(err: Error): Error {
  if ("code" in err && err.code === "ENOENT") {
    return new Error(
      "opencli was not found. Install OpenCLI and its Browser Bridge extension, then retry.",
    );
  }
  return err;
}

function isOpenCliLink(value: unknown): value is { href: string; text: string } {
  return isRecord(value) && typeof value.href === "string" && typeof value.text === "string";
}

function isDownloadResult(value: unknown): value is OpenCliDownloadResult {
  return isRecord(value) && typeof value.downloaded === "boolean";
}

function isClickResult(value: unknown): value is { clicked: boolean; text?: string; url?: string } {
  return isRecord(value) && typeof value.clicked === "boolean";
}

function isResolvedVideo(value: unknown): value is OpenCliResolvedVideo {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    typeof value.suggestedFilename === "string" &&
    (value.lessonUrl === undefined || typeof value.lessonUrl === "string")
  );
}

function isCamblyVideoCandidate(value: unknown): value is OpenCliCamblyVideoCandidate {
  return (
    isRecord(value) &&
    typeof value.chatId === "string" &&
    typeof value.lessonUrl === "string" &&
    typeof value.suggestedFilename === "string" &&
    (value.recordedAt === undefined || typeof value.recordedAt === "string") &&
    (value.tutorId === undefined || typeof value.tutorId === "string")
  );
}

function isNetworkSnapshot(
  value: unknown,
): value is { entries: Array<{ url: string; timestamp?: string }> } {
  return (
    isRecord(value) &&
    Array.isArray(value.entries) &&
    value.entries.every((entry) => isRecord(entry) && typeof entry.url === "string")
  );
}

function extractChatId(value: string): string | undefined {
  try {
    const url = new URL(value);
    const fromQuery = url.searchParams.get("chatId");
    if (fromQuery && /^[a-f0-9]{24}$/i.test(fromQuery)) return fromQuery;

    const fromPath = url.pathname.match(/\/api\/chats\/([a-f0-9]{24})\/video/i)?.[1];
    if (fromPath) return fromPath;
  } catch {
    return undefined;
  }
  return undefined;
}

function compareNetworkEntryDesc(
  left: { timestamp?: string },
  right: { timestamp?: string },
): number {
  return timestampMs(right.timestamp) - timestampMs(left.timestamp);
}

function timestampMs(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
