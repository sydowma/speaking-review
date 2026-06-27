import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { BrowserContext, Download, Page } from "playwright";
import {
  closeCamblyBrowser,
  DEFAULT_CAMBLY_URL,
  openCamblyBrowser,
} from "../importers/cambly/browser.ts";
import {
  clickCamblyVideoEndpointWithOpenCli,
  clickDownloadWithOpenCli,
  listCamblyDownloadableVideosWithOpenCli,
  listCamblyLinksWithOpenCli,
  listRecentCamblyChatIdsWithOpenCli,
  type OpenCliDownloadResult,
  type OpenCliResolvedVideo,
  openCamblyWithOpenCli,
  resetCamblyHistoryScrollWithOpenCli,
  resolveCamblyVideoWithOpenCli,
  usesOpenCli,
  waitForOpenCliDownload,
} from "../importers/cambly/opencli.ts";
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
  profileDir?: string;
  channel?: string;
  cdpUrl?: string;
  opencliSession?: string;
  opencliBin?: string;
  downloadPattern?: string;
  downloadTimeoutMs?: number;
}

interface FetchOptions {
  limit: number;
  analyze: boolean;
  forceAnalyze: boolean;
  forceDownload: boolean;
  strict: boolean;
  urls: string[];
  url: string;
  profileDir?: string;
  channel?: string;
  cdpUrl?: string;
  opencliSession?: string;
  opencliBin?: string;
  downloadPattern?: string;
  downloadTimeoutMs?: number;
}

interface ListOptions {
  limit: number;
  url: string;
  profileDir?: string;
  channel?: string;
  cdpUrl?: string;
  opencliSession?: string;
  opencliBin?: string;
  downloadPattern?: string;
  downloadTimeoutMs?: number;
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
  if (usesOpenCli(options)) {
    await openCamblyWithOpenCli(options.url, options);
    console.error("[cambly] Cambly opened through OpenCLI Browser Bridge.");
    console.error("[cambly] Log in to Cambly in your normal Chrome window, then return here.");
    await waitForEnter("[cambly] Press Enter after login...");
    return;
  }

  const session = await openCamblyBrowser(options.url, options);
  console.error(
    session.browser
      ? "[cambly] Connected to a Chrome DevTools endpoint."
      : "[cambly] Browser opened with a persistent local profile.",
  );
  console.error("[cambly] Log in to Cambly normally, then return here.");
  await waitForEnter("[cambly] Press Enter after login to close the browser session...");
  await closeCamblyBrowser(session);
}

async function camblyList(options: ListOptions): Promise<void> {
  if (usesOpenCli(options)) {
    await camblyListOpenCli(options);
    return;
  }

  const session = await openCamblyBrowser(options.url, options);
  const { page } = session;
  try {
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
      .filter((link) =>
        /lesson|history|record|progress|download/i.test(`${link.text} ${link.href}`),
      )
      .slice(0, options.limit);

    if (candidates.length === 0) {
      console.error("[cambly] No lesson-like links found on the current page.");
      console.error("[cambly] If you are not logged in, run `speaking-review cambly login` first.");
    } else {
      for (const link of candidates) {
        console.log(`${link.text || "(untitled)"}\t${link.href}`);
      }
    }
  } finally {
    await closeCamblyBrowser(session);
  }
}

async function camblyFetch(options: FetchOptions): Promise<void> {
  if (usesOpenCli(options)) {
    await camblyFetchOpenCli(options);
    return;
  }

  await ensureCamblyImportDirs();
  const state = await readCamblyState();
  const session = await openCamblyBrowser(options.url, options);
  const { context, page } = session;

  try {
    if (options.urls.length > 0) {
      await fetchExplicitUrls(page, state, options);
      return;
    }

    await captureManualDownloads(context, state, options);
  } finally {
    await writeCamblyState(state);
    await closeCamblyBrowser(session);
  }
}

async function camblyListOpenCli(options: ListOptions): Promise<void> {
  await openCamblyWithOpenCli(options.url, options);
  const links = await listCamblyLinksWithOpenCli(options);
  const candidates = links
    .filter((link) => /lesson|history|record|progress|download/i.test(`${link.text} ${link.href}`))
    .slice(0, options.limit);

  if (candidates.length === 0) {
    console.error("[cambly] No lesson-like links found on the current OpenCLI browser page.");
    console.error("[cambly] Make sure OpenCLI is attached to a Chrome profile logged into Cambly.");
  } else {
    for (const link of candidates) {
      console.log(`${link.text || "(untitled)"}\t${link.href}`);
    }
  }
}

async function camblyFetchOpenCli(options: FetchOptions): Promise<void> {
  await ensureCamblyImportDirs();
  const state = await readCamblyState();

  try {
    if (options.urls.length > 0) {
      await fetchExplicitUrlsOpenCli(state, options);
      return;
    }

    const processed = await fetchApiVideosOpenCli(state, options);
    if (processed === 0) await captureManualDownloadsOpenCli(state, options);
  } finally {
    await writeCamblyState(state);
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

async function fetchExplicitUrlsOpenCli(
  state: CamblyImportState,
  options: FetchOptions,
): Promise<void> {
  let processed = 0;
  for (const url of options.urls.slice(0, options.limit)) {
    console.error(`[cambly] Opening lesson URL through OpenCLI: ${url}`);
    await openCamblyWithOpenCli(url, options);

    const waiter = waitForOpenCliDownload(options);
    const downloadPromise = settleDownloadWaiter(waiter.promise);
    const click = await clickDownloadWithOpenCli(options);
    if (!click.clicked) {
      const video = await tryResolveOpenCliVideo(options);
      if (video) {
        waiter.cancel();
        await downloadPromise;
        await saveAndMaybeAnalyzeOpenCliVideo(video, state, options);
        processed += 1;
        continue;
      }

      waiter.cancel();
      await downloadPromise;
      const message = "Could not find a visible Download button on the OpenCLI browser page.";
      if (options.strict) throw new Error(message);
      console.error(`[cambly] ${message}`);
      continue;
    }

    await delay(1_000);
    const video = await tryResolveOpenCliVideo(options);
    if (video) {
      waiter.cancel();
      await downloadPromise;
      await saveAndMaybeAnalyzeOpenCliVideo(video, state, options);
      processed += 1;
      continue;
    }

    const download = await downloadPromise;
    if (!download.ok) throw download.error;
    await saveAndMaybeAnalyzeOpenCliDownload(
      download.value,
      sanitizeCamblyUrl(url),
      state,
      options,
    );
    processed += 1;
  }

  console.error(`[cambly] Processed ${processed} lesson URL(s).`);
}

async function fetchApiVideosOpenCli(
  state: CamblyImportState,
  options: FetchOptions,
): Promise<number> {
  await openCamblyWithOpenCli(withCacheBust(options.url), options);
  await delay(2_000);

  const candidates = await listCamblyDownloadableVideosWithOpenCli(options, options.limit);
  if (candidates.length === 0) {
    console.error("[cambly] No downloadable Cambly chat videos found through the API.");
    return 0;
  }

  let processed = 0;
  for (const candidate of candidates) {
    if (processed >= options.limit) break;

    console.error(`[cambly] ${candidate.chatId}: resolving latest downloadable video...`);
    await openCamblyWithOpenCli(candidate.lessonUrl, options);
    await delay(1_500);

    const resolved = await tryResolveOpenCliVideo(options);
    if (!resolved) {
      const message = `Could not resolve video source for Cambly chat ${candidate.chatId}.`;
      if (options.strict) throw new Error(message);
      console.error(`[cambly] ${message}`);
      continue;
    }

    await saveAndMaybeAnalyzeOpenCliVideo(
      {
        url: resolved.url,
        suggestedFilename: candidate.suggestedFilename,
        lessonUrl: candidate.lessonUrl,
      },
      state,
      options,
    );
    processed += 1;
  }

  console.error(`[cambly] Processed ${processed} Cambly API video(s).`);
  return processed;
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

async function captureManualDownloadsOpenCli(
  state: CamblyImportState,
  options: FetchOptions,
): Promise<void> {
  await openCamblyWithOpenCli(withCacheBust(options.url), options);
  await delay(3_000);
  await resetCamblyHistoryScrollWithOpenCli(options).catch(() => undefined);
  await delay(1_000);
  console.error("[cambly] Cambly is open through OpenCLI Browser Bridge.");
  console.error(
    "[cambly] Open Progress / Lesson History in Chrome, then open one lesson detail at a time.",
  );
  console.error(`[cambly] Capturing up to ${options.limit} download(s).`);

  let accepted = 0;
  const attemptedChatIds = new Set<string>();
  for (let i = 0; i < options.limit; i++) {
    const waiter = waitForOpenCliDownload(options);
    const downloadPromise = settleDownloadWaiter(waiter.promise);
    await waitForEnter(
      `[cambly] Open lesson ${i + 1}, click Download if needed, then press Enter here...`,
    );

    try {
      const video = await tryResolveOpenCliVideo(options);
      if (video) {
        waiter.cancel();
        await downloadPromise;
        await saveAndMaybeAnalyzeOpenCliVideo(video, state, options);
        accepted += 1;
        continue;
      }

      const earlyDownload = await waitForSettledDownload(downloadPromise, 500);
      if (earlyDownload) {
        if (!earlyDownload.ok) throw earlyDownload.error;
        await saveAndMaybeAnalyzeOpenCliDownload(earlyDownload.value, undefined, state, options);
        accepted += 1;
        continue;
      }

      const chatId = await tryClickRecentCamblyVideoEndpoint(options, attemptedChatIds);
      const lessonUrl = chatId
        ? sanitizeCamblyUrl(`https://www.cambly.com/api/chats/${chatId}/video`)
        : undefined;
      const download = await downloadPromise;
      if (!download.ok) throw download.error;
      await saveAndMaybeAnalyzeOpenCliDownload(download.value, lessonUrl, state, options);
      accepted += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (options.strict) throw err;
      console.error(`[cambly] Download capture stopped: ${message}`);
      break;
    }
  }

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
  await saveAndMaybeAnalyzeFile(
    {
      suggestedFilename,
      lessonUrl,
      downloadUrl: download.url(),
      saveAs: (targetPath) => download.saveAs(targetPath),
      onDuplicate: () => download.delete().catch(() => undefined),
    },
    state,
    options,
  );
}

async function settleDownloadWaiter(
  promise: Promise<OpenCliDownloadResult>,
): Promise<{ ok: true; value: OpenCliDownloadResult } | { ok: false; error: Error }> {
  try {
    return { ok: true, value: await promise };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

async function tryResolveOpenCliVideo(
  options: FetchOptions,
): Promise<OpenCliResolvedVideo | undefined> {
  try {
    return await resolveCamblyVideoWithOpenCli(options);
  } catch {
    return undefined;
  }
}

async function waitForSettledDownload(
  promise: Promise<{ ok: true; value: OpenCliDownloadResult } | { ok: false; error: Error }>,
  timeoutMs: number,
): Promise<{ ok: true; value: OpenCliDownloadResult } | { ok: false; error: Error } | undefined> {
  return await Promise.race([promise, delay(timeoutMs).then(() => undefined)]);
}

async function tryClickRecentCamblyVideoEndpoint(
  options: FetchOptions,
  attemptedChatIds: Set<string>,
): Promise<string | undefined> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await openCamblyWithOpenCli(withCacheBust(options.url), options);
      await delay(3_000);
      await resetCamblyHistoryScrollWithOpenCli(options).catch(() => undefined);
      await delay(1_000);
    }

    let chatIds: string[];
    try {
      chatIds = await listRecentCamblyChatIdsWithOpenCli(options);
    } catch {
      chatIds = [];
    }

    const chatId = chatIds.find((id) => !attemptedChatIds.has(id));
    if (!chatId) continue;
    attemptedChatIds.add(chatId);

    try {
      const click = await clickCamblyVideoEndpointWithOpenCli(chatId, options);
      if (click.clicked) return chatId;
    } catch {}
  }
  return undefined;
}

async function saveAndMaybeAnalyzeOpenCliDownload(
  download: OpenCliDownloadResult,
  lessonUrl: string | undefined,
  state: CamblyImportState,
  options: FetchOptions,
): Promise<void> {
  if (!download.downloaded || !download.filename) {
    throw new Error(download.error ?? "OpenCLI did not report a completed download filename.");
  }

  const sourcePath = download.filename;
  if (!existsSync(sourcePath)) {
    throw new Error(`OpenCLI download file does not exist: ${sourcePath}`);
  }

  await saveAndMaybeAnalyzeFile(
    {
      suggestedFilename: basename(sourcePath),
      lessonUrl,
      downloadUrl: download.finalUrl ?? download.url ?? sourcePath,
      saveAs: (targetPath) => copyFile(sourcePath, targetPath),
    },
    state,
    options,
  );
}

async function saveAndMaybeAnalyzeOpenCliVideo(
  video: OpenCliResolvedVideo,
  state: CamblyImportState,
  options: FetchOptions,
): Promise<void> {
  await saveAndMaybeAnalyzeFile(
    {
      suggestedFilename: video.suggestedFilename,
      lessonUrl: sanitizeCamblyUrl(video.lessonUrl ?? ""),
      downloadUrl: video.url,
      saveAs: (targetPath) => downloadRemoteFile(video.url, targetPath),
    },
    state,
    options,
  );
}

async function saveAndMaybeAnalyzeFile(
  download: {
    suggestedFilename: string;
    lessonUrl?: string;
    downloadUrl: string;
    saveAs: (targetPath: string) => Promise<void>;
    onDuplicate?: () => Promise<void>;
  },
  state: CamblyImportState,
  options: FetchOptions,
): Promise<void> {
  const lessonId = buildLessonId(
    download.lessonUrl,
    download.suggestedFilename,
    download.downloadUrl,
  );
  const existing = state.lessons[lessonId];

  if (
    existing?.downloadedVideo &&
    existsSync(join(CAMBLY_VIDEOS_DIR, existing.downloadedVideo.replace(/^videos\//, ""))) &&
    !options.forceDownload
  ) {
    console.error(`[cambly] ${lessonId}: already downloaded; keeping existing video.`);
    if (options.analyze) await analyzeExistingLesson(lessonId, state, options);
    await download.onDuplicate?.();
    return;
  }

  const targetPath = join(
    CAMBLY_VIDEOS_DIR,
    `${lessonId}${safeExtension(download.suggestedFilename)}`,
  );
  console.error(`[cambly] ${lessonId}: saving ${download.suggestedFilename}`);
  await download.saveAs(targetPath);

  state.lessons[lessonId] = {
    ...existing,
    provider: "cambly",
    lessonId,
    lessonUrl: download.lessonUrl ?? existing?.lessonUrl,
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

async function downloadRemoteFile(url: string, targetPath: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error("Video download request failed.");
  }

  if (!response.ok) {
    throw new Error(`Video download failed with HTTP ${response.status}.`);
  }
  if (!response.body) {
    throw new Error("Video download returned no body.");
  }

  const body = response.body as unknown as Parameters<typeof Readable.fromWeb>[0];
  await pipeline(Readable.fromWeb(body), createWriteStream(targetPath));
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
  const chatId = [lessonUrl, filename, downloadUrl]
    .filter(isString)
    .map(extractCamblyChatId)
    .find(isString);
  if (chatId) return safeName(chatId);

  if (lessonUrl) {
    const url = new URL(lessonUrl);
    const pathId = url.pathname.split("/").filter(Boolean).reverse().find(isLikelyCamblyLessonId);
    if (pathId) return safeName(pathId);
  }

  const hash = createHash("sha256")
    .update(`${lessonUrl ?? ""}|${filename}|${downloadUrl}`)
    .digest("hex")
    .slice(0, 16);
  return `cambly-${hash}`;
}

function extractCamblyChatId(value: string): string | undefined {
  try {
    const url = new URL(value);
    const queryId = url.searchParams.get("chatId");
    if (queryId && /^[a-f0-9]{24}$/i.test(queryId)) return queryId;

    const pathId = url.pathname.match(/\/api\/chats\/([a-f0-9]{24})\/video/i)?.[1];
    if (pathId) return pathId;
  } catch {
    const filenameId = value.match(/(?:^|_)cambly_([a-f0-9]{24})(?:_|\.|$)/i)?.[1];
    if (filenameId) return filenameId;
  }

  return undefined;
}

function isLikelyCamblyLessonId(part: string): boolean {
  if (!/^[a-z0-9][a-z0-9-]{5,}$/i.test(part)) return false;
  const normalized = safeName(part);
  if (
    new Set([
      "account",
      "api",
      "chats",
      "download",
      "history",
      "lesson",
      "lessons",
      "past-lessons",
      "progress",
      "recording",
      "student",
      "video",
    ]).has(normalized)
  ) {
    return false;
  }
  return /^[a-f0-9]{12,}$/i.test(part) || /\d/.test(part) || part.length >= 16;
}

function isString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
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
  return { ...readBrowserFlags(args), url: readUrlFlag(args) };
}

function parseListArgs(args: string[]): ListOptions {
  let limit = 20;
  const url = readUrlFlag(args);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit") limit = parsePositiveInt(args[++i], "--limit");
  }
  return { ...readBrowserFlags(args), limit, url };
}

function parseFetchArgs(args: string[]): FetchOptions {
  const urls: string[] = [];
  let limit = 10;
  let analyze = false;
  let forceAnalyze = false;
  let forceDownload = false;
  let strict = false;
  let url = DEFAULT_CAMBLY_URL;
  const browser = readBrowserFlags(args);

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
    else if (arg === "--profile-dir") i += 1;
    else if (arg === "--channel") i += 1;
    else if (arg === "--cdp-url") i += 1;
    else if (arg === "--opencli-session") i += 1;
    else if (arg === "--opencli-bin") i += 1;
    else if (arg === "--download-pattern") i += 1;
    else if (arg === "--download-timeout") i += 1;
    else if (arg) throw new Error(`unknown cambly fetch option: ${arg}`);
  }

  return { ...browser, limit, analyze, forceAnalyze, forceDownload, strict, urls, url };
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

function readBrowserFlags(
  args: string[],
): Pick<
  FetchOptions,
  | "profileDir"
  | "channel"
  | "cdpUrl"
  | "opencliSession"
  | "opencliBin"
  | "downloadPattern"
  | "downloadTimeoutMs"
> {
  let profileDir = process.env.CAMBLY_PROFILE_DIR;
  let channel = process.env.CAMBLY_BROWSER_CHANNEL;
  let cdpUrl = process.env.CAMBLY_CDP_URL;
  let opencliSession = process.env.CAMBLY_OPENCLI_SESSION;
  let opencliBin = process.env.CAMBLY_OPENCLI_BIN;
  let downloadPattern = process.env.CAMBLY_DOWNLOAD_PATTERN;
  let downloadTimeoutMs = readOptionalPositiveInt(
    process.env.CAMBLY_DOWNLOAD_TIMEOUT_MS,
    "CAMBLY_DOWNLOAD_TIMEOUT_MS",
  );
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--profile-dir") {
      profileDir = readRequiredValue(args[++i], "--profile-dir");
    } else if (args[i] === "--channel") {
      channel = readRequiredValue(args[++i], "--channel");
    } else if (args[i] === "--cdp-url") {
      cdpUrl = readRequiredValue(args[++i], "--cdp-url");
    } else if (args[i] === "--opencli-session") {
      opencliSession = readRequiredValue(args[++i], "--opencli-session");
    } else if (args[i] === "--opencli-bin") {
      opencliBin = readRequiredValue(args[++i], "--opencli-bin");
    } else if (args[i] === "--download-pattern") {
      downloadPattern = readRequiredValue(args[++i], "--download-pattern");
    } else if (args[i] === "--download-timeout") {
      downloadTimeoutMs = parsePositiveInt(args[++i], "--download-timeout");
    }
  }
  return {
    profileDir,
    channel,
    cdpUrl,
    opencliSession,
    opencliBin,
    downloadPattern,
    downloadTimeoutMs,
  };
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

function readOptionalPositiveInt(value: string | undefined, flag: string): number | undefined {
  if (!value) return undefined;
  return parsePositiveInt(value, flag);
}

function withCacheBust(value: string): string {
  try {
    const url = new URL(value);
    url.searchParams.set("srImport", String(Date.now()));
    return url.toString();
  } catch {
    return value;
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
  cambly fetch [options]               Download lesson videos and optionally analyze them
  cambly analyze-missing [options]     Analyze downloaded lessons without an analysis file

Fetch options:
  --analyze                            Run ingest after each downloaded video
  --no-analyze                         Download only (default)
  --limit N                            Capture up to N downloads (default: 10)
  --url <lesson-url>                   Open a lesson URL and try to click Download
  --history-url <url>                  Override the Cambly history start URL
  --profile-dir <path>                 Use a specific browser user-data directory
  --channel <name>                     Use a Playwright browser channel, e.g. chrome
  --cdp-url <url>                      Connect to an existing remote-debugging Chrome
  --opencli-session <name>             Use OpenCLI Browser Bridge with a normal Chrome session
  --opencli-bin <path>                 OpenCLI executable path (default: opencli)
  --download-pattern <text>            OpenCLI download filename/URL match (default: .mp4)
  --download-timeout <ms>              OpenCLI per-download timeout (default: 120000)
  --force-download                     Save video even if the lesson was downloaded before
  --force-analyze                      Re-run analysis even when analysis already exists
  --strict                             Stop on the first analysis failure

Data:
  Browser profile: ~/.speaking-review/browser/cambly/ by default
  Download state:  ~/.speaking-review/imports/cambly/state.json
  Videos:          ~/.speaking-review/imports/cambly/videos/
`);
}
