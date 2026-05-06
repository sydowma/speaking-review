// Spawns Vite dev server in web/ and opens the browser.
// Web reads reviews from ~/.speaking-review/ via a Vite-side endpoint
// (see web/vite.config.ts) so no extra backend is needed.

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dirname, "../../../web");

export async function serve(): Promise<void> {
  console.error(`[serve] starting Vite in ${WEB_DIR}`);
  const child = spawn("bun", ["run", "dev"], {
    cwd: WEB_DIR,
    stdio: "inherit",
  });

  child.on("error", (err) => {
    console.error(`[serve] failed to start: ${err.message}`);
    process.exit(1);
  });

  process.on("SIGINT", () => {
    child.kill("SIGINT");
    process.exit(0);
  });

  child.on("close", (code) => {
    process.exit(code ?? 0);
  });
}
