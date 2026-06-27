import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import { ROOT } from "../../storage.ts";

export const DEFAULT_CAMBLY_URL = process.env.CAMBLY_HISTORY_URL ?? "https://www.cambly.com/";

export const DEFAULT_CAMBLY_PROFILE_DIR =
  process.env.CAMBLY_PROFILE_DIR ?? join(ROOT, "browser", "cambly");

export interface CamblyBrowserOptions {
  profileDir?: string;
  channel?: string;
  cdpUrl?: string;
}

export interface CamblyBrowserSession {
  browser?: Browser;
  context: BrowserContext;
  page: Page;
  ownsPage?: boolean;
}

export async function openCamblyBrowser(
  url = DEFAULT_CAMBLY_URL,
  options: CamblyBrowserOptions = {},
): Promise<CamblyBrowserSession> {
  const { chromium } = await import("playwright");
  const cdpUrl = options.cdpUrl ?? process.env.CAMBLY_CDP_URL;
  if (cdpUrl) {
    const browser = await chromium.connectOverCDP(cdpUrl);
    const context = browser.contexts()[0];
    if (!context) {
      await browser.close().catch(() => undefined);
      throw new Error("Connected Chrome did not expose a default browser context.");
    }
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    return { browser, context, page, ownsPage: true };
  }

  const profileDir = options.profileDir ?? DEFAULT_CAMBLY_PROFILE_DIR;
  await mkdir(profileDir, { recursive: true });

  try {
    const context = await chromium.launchPersistentContext(profileDir, {
      acceptDownloads: true,
      channel: options.channel ?? process.env.CAMBLY_BROWSER_CHANNEL,
      headless: process.env.CAMBLY_HEADLESS === "1",
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url, { waitUntil: "domcontentloaded" });
    return { context, page };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Executable doesn't exist")) {
      throw new Error(
        "Playwright browser is not installed. Run `bunx playwright install chromium` and retry.",
      );
    }
    if (message.includes("正在现有的浏览器会话中打开") || message.includes("ProcessSingleton")) {
      throw new Error(
        `Browser profile is already in use: ${profileDir}. Close that browser completely, then retry.`,
      );
    }
    throw err;
  }
}

export async function closeCamblyBrowser(session: CamblyBrowserSession): Promise<void> {
  if (session.browser) {
    if (session.ownsPage && !session.page.isClosed()) {
      await session.page.close().catch(() => undefined);
    }
    await session.browser.close({ reason: "Cambly import finished" }).catch(() => undefined);
    return;
  }

  await session.context.close();
}
