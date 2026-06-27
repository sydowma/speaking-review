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

export interface OpenCliDownloadWaiter {
  promise: Promise<OpenCliDownloadResult>;
  cancel: () => void;
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

export function waitForOpenCliDownload(options: CamblyOpenCliOptions): OpenCliDownloadWaiter {
  const args = ["browser", sessionName(options), "wait", "download"];
  const pattern = options.downloadPattern ?? process.env.CAMBLY_DOWNLOAD_PATTERN ?? ".mp4";
  if (pattern) args.push(pattern);
  args.push("--timeout", String(options.downloadTimeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS));

  const child = spawn(openCliBin(options), args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";

  const promise = new Promise<OpenCliDownloadResult>((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => reject(wrapOpenCliError(err)));
    child.on("close", (code, signal) => {
      if (signal) {
        reject(new Error(`opencli download wait was canceled by ${signal}`));
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
