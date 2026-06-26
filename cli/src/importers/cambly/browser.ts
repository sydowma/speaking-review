import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserContext, Page } from "playwright";
import { ROOT } from "../../storage.ts";

export const DEFAULT_CAMBLY_URL =
  process.env.CAMBLY_HISTORY_URL ?? "https://www.cambly.com/app/student/progress";

export const CAMBLY_PROFILE_DIR = join(ROOT, "browser", "cambly");

export interface CamblyBrowserSession {
  context: BrowserContext;
  page: Page;
}

export async function openCamblyBrowser(url = DEFAULT_CAMBLY_URL): Promise<CamblyBrowserSession> {
  const { chromium } = await import("playwright");
  await mkdir(CAMBLY_PROFILE_DIR, { recursive: true });

  try {
    const context = await chromium.launchPersistentContext(CAMBLY_PROFILE_DIR, {
      acceptDownloads: true,
      channel: process.env.CAMBLY_BROWSER_CHANNEL,
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
    throw err;
  }
}
