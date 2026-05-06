// Serves audio.wav with HTTP range support, which wavesurfer + <audio>
// elements rely on for seeking.

import { open } from "node:fs/promises";
import { audioStat } from "../storage.ts";

export async function audioHandler(id: string, req: Request): Promise<Response> {
  const info = await audioStat(id);
  if (!info) return new Response("not found", { status: 404 });

  const range = req.headers.get("range");
  if (range) {
    const m = range.match(/^bytes=(\d+)-(\d*)$/);
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : info.size - 1;
      const length = end - start + 1;
      const handle = await open(info.path, "r");
      const buf = new Uint8Array(length);
      await handle.read(buf, 0, length, start);
      await handle.close();
      return new Response(buf, {
        status: 206,
        headers: {
          "content-type": "audio/wav",
          "content-range": `bytes ${start}-${end}/${info.size}`,
          "accept-ranges": "bytes",
          "content-length": String(length),
        },
      });
    }
  }

  // Full file response. Stream via Bun.file for efficiency.
  return new Response(Bun.file(info.path), {
    headers: {
      "content-type": "audio/wav",
      "content-length": String(info.size),
      "accept-ranges": "bytes",
    },
  });
}
