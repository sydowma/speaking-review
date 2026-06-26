#!/usr/bin/env bun
import { cambly } from "./commands/cambly.ts";
import { ingest, resume } from "./commands/ingest.ts";
import { list } from "./commands/list.ts";
import { serve } from "./commands/serve.ts";
import { parseSyncArgs, sync } from "./commands/sync.ts";

const [, , cmd, ...rest] = process.argv;

async function main(): Promise<void> {
  switch (cmd) {
    case "ingest": {
      const file = rest[0];
      if (!file) {
        console.error("usage: speaking-review ingest <file.mp4>");
        process.exit(2);
      }
      const id = await ingest(file);
      console.log(id);
      return;
    }
    case "resume": {
      const id = rest[0];
      if (!id) {
        console.error("usage: speaking-review resume <review-id>");
        process.exit(2);
      }
      await resume(id);
      return;
    }
    case "sync": {
      const opts = parseSyncArgs(rest);
      if (!opts.id || !opts.to) {
        console.error("usage: speaking-review sync <id> --to https://example.com [--token TOKEN]");
        process.exit(2);
      }
      await sync(opts.id, { to: opts.to, token: opts.token });
      return;
    }
    case "cambly":
      await cambly(rest);
      return;
    case "list":
      await list();
      return;
    case "serve":
      await serve();
      return;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      return;
    default:
      console.error(`unknown command: ${cmd}`);
      printHelp();
      process.exit(2);
  }
}

function printHelp(): void {
  console.log(`speaking-review — review English speaking practice recordings

Commands:
  ingest <file>           Process a video/audio file (ffmpeg → whisper → Claude)
  resume <id>             Re-run analysis on an existing review (skips whisper)
  cambly <subcommand>     Import Cambly lesson recordings from a local browser session
  sync <id> --to <url>    Upload an existing review to a remote server
  list                    List all reviews
  serve                   Start the web UI (Vite dev server)

Env:
  ANTHROPIC_API_KEY        required for ingest / resume
  ANTHROPIC_MODEL          default: claude-sonnet-4-6
  WHISPER_MODEL            default: ~/whisper-models/ggml-large-v3.bin
  SPEAKING_REVIEW_TOKEN    bearer token for 'sync' upload (if remote requires it)
`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
