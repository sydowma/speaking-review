import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import type { BrowserContext, Download, Page } from "playwright";
import { DEFAULT_CAMBLY_URL, openCamblyBrowser } from "../importers/cambly/browser.ts";
import {
  CAMBLY_VIDEOS_DIR,
  ensureCamblyImportDirs,
  readCamblyState,
  toCamblyStatePath,
  writeCamblyState,
} from "../importers/cambly/state.ts";
import type { CamblyImportState } from "../importers/cambly/types.ts";
import { reviewDir } from "../storage.ts";
import { ingest } from "./ingest.ts";

interface LoginOptions {
  url: string;
}

interface FetchOptions {
  limit: number;
  analyze: boolean;
  forceAnalyze: boolean;
  forceDownload: boolean;
  strict: boolean;
  urls: string[];
  url: string;
}

interface ListOptions {
  limit: number;
  url: string;
}

export async function cambly(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  switch (subcommand) {
    case "login":
      await camblyLogin(parseLoginArgs(rest));
      return;
    case "list":
      await camblyList(parseListArgs(rest));
      return;
    case "fetch":
      await camblyFetch(parseFetchArgs(rest));
      return;
    case "analyze-missing":
      await camblyAnalyzeMissing(parseAnalyzeMissingArgs(rest));
      return;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printCamblyHelp();
      return;
    default:
      throw new Error(`unknown cambly command: ${subcommand}`);
  }
}

async function camblyLogin(options: LoginOptions): Promise<void> {
  const { context } = await openCamblyBrowser(options.url);
  console.error("[cambly] Browser opened with a persistent local profile.");
  console.error("[cambly] Log in to Cambly normally, then return here.");
  await waitForEnter("[cambly] Press Enter after login to close the browser...");
  await context.close();
}

async function camblyList(options: ListOptions): Promise<void> {
  const { context, page } = await openCamblyBrowser(options.url);
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);

  const links = await page
    .locator("a")
    .evaluateAll((anchors) =>
      anchors.map((anchor) => ({
        href: (anchor as HTMLAnchorElement).href,
        text: (anchor.textContent ?? "").replace(/\s+/g, " ").trim(),
      })),
    )
    .catch(() => []);

  const candidates = links
    .filter((link) => /lesson|history|record|progress|download/i.test(`${link.text} ${link.href}`))
    .slice(0, options.limit);

  if (candidates.length === 0) {
    console.error("[cambly] No lesson-like links found on the current page.");
    console.error("[cambly] If you are not logged in, run `speaking-review cambly login` first.");
  } else {
    for (const link of candidates) {
      console.log(`${link.text || "(untitled)"}\t${link.href}`);
    }
  }

  await context.close();
}

async function camblyFetch(options: FetchOptions): Promise<void> {
  await ensureCamblyImportDirs();
  const state = await readCamblyState();
  const { context, page } = await openCamblyBrowser(options.url);

  try {
    if (options.urls.length > 0) {
      await fetchExplicitUrls(page, state, options);
      return;
    }

    await captureManualDownloads(context, state, options);
  } finally {
    await writeCamblyState(state);
    await context.close();
  }
}

async function camblyAnalyzeMissing(options: FetchOptions): Promise<void> {
  await ensureCamblyImportDirs();
  const state = await readCamblyState();
  const records = Object.values(state.lessons)
    .filter((record) => record.downloadedVideo)
    .filter(
      (record) => !record.reviewId || !analysisExists(record.reviewId) || options.forceAnalyze,
    )
    .slice(0, options.limit);

  if (records.length === 0) {
    console.error("[cambly] No downloaded lessons need analysis.");
    return;
  }

  for (const record of records) {
    await analyzeExistingLesson(record.lessonId, state, options);
  }
}

async function fetchExplicitUrls(
  page: Page,
  state: CamblyImportState,
  options: FetchOptions,
): Promise<void> {
  let processed = 0;
  for (const url of options.urls.slice(0, options.limit)) {
    console.error(`[cambly] Opening lesson URL: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);

    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await clickFirstDownloadButton(page);
    const download = await downloadPromise;
    await saveAndMaybeAnalyzeDownload(download, page, state, options);
    processed += 1;
  }

  console.error(`[cambly] Processed ${processed} lesson URL(s).`);
}

async function captureManualDownloads(
  context: BrowserContext,
  state: CamblyImportState,
  options: FetchOptions,
): Promise<void> {
  const pending: Array<Promise<void>> = [];
  let accepted = 0;

  const attach = (page: Page): void => {
    page.on("download", (download) => {
      if (accepted >= options.limit) {
        console.error("[cambly] Download limit reached; ignoring extra download.");
        return;
      }
      accepted += 1;
      pending.push(
        saveAndMaybeAnalyzeDownload(download, page, state, options).catch((err) => {
          console.error(err instanceof Error ? err.message : String(err));
          if (options.strict) throw err;
        }),
      );
    });
  };

  for (const page of context.pages()) attach(page);
  context.on("page", attach);

  console.error("[cambly] Cambly is open in a persistent browser profile.");
  console.error("[cambly] Open Progress / Lesson History and click Download on each lesson video.");
  console.error(`[cambly] Capturing up to ${options.limit} download(s).`);
  await waitForEnter("[cambly] Press Enter here when downloads have started or finished...");
  await Promise.allSettled(pending);
  console.error(`[cambly] Captured ${accepted} download(s).`);
}

async function saveAndMaybeAnalyzeDownload(
  download: Download,
  page: Page,
  state: CamblyImportState,
  options: FetchOptions,
): Promise<void> {
  const suggestedFilename = download.suggestedFilename();
  const lessonUrl = sanitizeCamblyUrl(page.url());
  const lessonId = buildLessonId(lessonUrl, suggestedFilename, download.url());
  const existing = state.lessons[lessonId];

  if (
    existing?.downloadedVideo &&
    existsSync(join(CAMBLY_VIDEOS_DIR, existing.downloadedVideo.replace(/^videos\//, ""))) &&
    !options.forceDownload
  ) {
    console.error(`[cambly] ${lessonId}: already downloaded; keeping existing video.`);
    if (options.analyze) await analyzeExistingLesson(lessonId, state, options);
    await download.delete().catch(() => undefined);
    return;
  }

  const targetPath = join(CAMBLY_VIDEOS_DIR, `${lessonId}${safeExtension(suggestedFilename)}`);
  console.error(`[cambly] ${lessonId}: saving ${suggestedFilename}`);
  await download.saveAs(targetPath);

  state.lessons[lessonId] = {
    ...existing,
    provider: "cambly",
    lessonId,
    lessonUrl,
    downloadedVideo: toCamblyStatePath(targetPath),
    status: "downloaded",
    updatedAt: new Date().toISOString(),
    error: undefined,
  };
  await writeCamblyState(state);

  if (options.analyze) {
    await analyzeExistingLesson(lessonId, state, options);
  }
}

async function analyzeExistingLesson(
  lessonId: string,
  state: CamblyImportState,
  options: FetchOptions,
): Promise<void> {
  const record = state.lessons[lessonId];
  if (!record?.downloadedVideo) return;

  if (record.reviewId && analysisExists(record.reviewId) && !options.forceAnalyze) {
    console.error(`[cambly] ${lessonId}: already analyzed as ${record.reviewId}.`);
    return;
  }

  const videoPath = join(CAMBLY_VIDEOS_DIR, record.downloadedVideo.replace(/^videos\//, ""));
  try {
    console.error(`[cambly] ${lessonId}: running speaking review analysis...`);
    const reviewId = await ingest(videoPath, {
      sourceProvider: "cambly",
      sourceUrl: record.lessonUrl,
      externalId: lessonId,
      lessonAt: record.recordedAt,
      tutorName: record.tutorName,
    });
    record.reviewId = reviewId;
    record.status = "analyzed";
    record.updatedAt = new Date().toISOString();
    record.error = undefined;
  } catch (err) {
    record.status = "failed";
    record.updatedAt = new Date().toISOString();
    record.error = err instanceof Error ? err.message : String(err);
    await writeCamblyState(state);
    if (options.strict) throw err;
    console.error(`[cambly] ${lessonId}: analysis failed: ${record.error}`);
    return;
  }

  await writeCamblyState(state);
}

async function clickFirstDownloadButton(page: Page): Promise<void> {
  const locators = [
    page.getByRole("button", { name: /download/i }),
    page.getByRole("link", { name: /download/i }),
    page.getByText(/^download$/i),
  ];

  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const item = locator.nth(i);
      if (await item.isVisible().catch(() => false)) {
        await item.click();
        return;
      }
    }
  }

  throw new Error("Could not find a visible Download button on the lesson page.");
}

function analysisExists(reviewId: string): boolean {
  return existsSync(join(reviewDir(reviewId), "analysis.json"));
}

function buildLessonId(
  lessonUrl: string | undefined,
  filename: string,
  downloadUrl: string,
): string {
  if (lessonUrl) {
    const url = new URL(lessonUrl);
    const pathId = url.pathname
      .split("/")
      .filter(Boolean)
      .reverse()
      .find((part) => /^[a-z0-9][a-z0-9-]{5,}$/i.test(part));
    if (pathId) return safeName(pathId);
  }

  const hash = createHash("sha256")
    .update(`${lessonUrl ?? ""}|${filename}|${downloadUrl}`)
    .digest("hex")
    .slice(0, 16);
  return `cambly-${hash}`;
}

function sanitizeCamblyUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!url.hostname.endsWith("cambly.com")) return undefined;
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

function safeExtension(filename: string): string {
  const ext = extname(filename).toLowerCase();
  if (/^\.[a-z0-9]{1,8}$/.test(ext)) return ext;
  return ".mp4";
}

function safeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseLoginArgs(args: string[]): LoginOptions {
  return { url: readUrlFlag(args) };
}

function parseListArgs(args: string[]): ListOptions {
  let limit = 20;
  const url = readUrlFlag(args);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit") limit = parsePositiveInt(args[++i], "--limit");
  }
  return { limit, url };
}

function parseFetchArgs(args: string[]): FetchOptions {
  const urls: string[] = [];
  let limit = 10;
  let analyze = false;
  let forceAnalyze = false;
  let forceDownload = false;
  let strict = false;
  let url = DEFAULT_CAMBLY_URL;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--limit") limit = parsePositiveInt(args[++i], "--limit");
    else if (arg === "--analyze") analyze = true;
    else if (arg === "--no-analyze") analyze = false;
    else if (arg === "--force-analyze") forceAnalyze = true;
    else if (arg === "--force-download") forceDownload = true;
    else if (arg === "--strict") strict = true;
    else if (arg === "--url") urls.push(readRequiredValue(args[++i], "--url"));
    else if (arg === "--history-url") url = readRequiredValue(args[++i], "--history-url");
    else if (arg) throw new Error(`unknown cambly fetch option: ${arg}`);
  }

  return { limit, analyze, forceAnalyze, forceDownload, strict, urls, url };
}

function parseAnalyzeMissingArgs(args: string[]): FetchOptions {
  const options = parseFetchArgs(args);
  return { ...options, analyze: true, urls: [] };
}

function readUrlFlag(args: string[]): string {
  let url = DEFAULT_CAMBLY_URL;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url" || args[i] === "--history-url") {
      url = readRequiredValue(args[++i], args[i - 1] ?? "--url");
    }
  }
  return url;
}

function readRequiredValue(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function parsePositiveInt(value: string | undefined, flag: string): number {
  const parsed = Number(readRequiredValue(value, flag));
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

async function waitForEnter(prompt: string): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    await rl.question(`${prompt} `);
  } finally {
    rl.close();
  }
}

function printCamblyHelp(): void {
  console.log(`speaking-review cambly — import Cambly lesson recordings

Commands:
  cambly login                         Open a persistent Cambly browser profile
  cambly list [--limit 20]             Print lesson-like links from the current history page
  cambly fetch [options]               Capture lesson video downloads and optionally analyze them
  cambly analyze-missing [options]     Analyze downloaded lessons without an analysis file

Fetch options:
  --analyze                            Run ingest after each downloaded video
  --no-analyze                         Download only (default)
  --limit N                            Capture up to N downloads (default: 10)
  --url <lesson-url>                   Open a lesson URL and try to click Download
  --history-url <url>                  Override the Cambly history start URL
  --force-download                     Save video even if the lesson was downloaded before
  --force-analyze                      Re-run analysis even when analysis already exists
  --strict                             Stop on the first analysis failure

Data:
  Browser profile: ~/.speaking-review/browser/cambly/
  Download state:  ~/.speaking-review/imports/cambly/state.json
  Videos:          ~/.speaking-review/imports/cambly/videos/
`);
}
