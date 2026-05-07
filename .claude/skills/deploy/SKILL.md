---
name: deploy
description: Deploy speaking-review to the VPS. Use when the user wants to ship the current branch (Docker rebuild or bare-metal git pull + restart). Walks through the build/upload/restart sequence and verifies the service is healthy.
disable-model-invocation: true
---

# Deploy speaking-review

Two paths exist; pick the one the target VPS uses. Reference: `deploy/README.md`, `deploy/Caddyfile`, `deploy/speaking-review.service`, and the root `Dockerfile`.

## Pre-flight

1. Confirm the working tree is clean and pushed: `git status` and `git log origin/master..HEAD`.
2. Confirm the target host (ask the user if not specified).
3. Confirm `SPEAKING_REVIEW_TOKEN` has not rotated unless intentionally rotating now.

## Path A — Docker

Run on the VPS (or via SSH):

```bash
cd /opt/speaking-review
git pull
docker build -t speaking-review .
docker rm -f speaking-review
docker run -d --name speaking-review \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e SPEAKING_REVIEW_TOKEN=... \
  -v speaking-review-data:/data \
  speaking-review
```

Verify: `docker logs --tail 50 speaking-review` and `curl -fsS https://<domain>/api/health` (or whichever health endpoint exists — check `server/src/index.ts`).

## Path B — Bare metal + systemd

Run on the VPS:

```bash
cd /opt/speaking-review
sudo git pull
sudo -u speaking-review bun install --frozen-lockfile
sudo -u speaking-review bun run --cwd web build
sudo systemctl restart speaking-review
sudo systemctl status speaking-review --no-pager
```

Watch logs: `sudo journalctl -u speaking-review -f`.

## After either path

- Hit the site in a browser; confirm the token-in-localStorage path still works.
- If anything regressed, roll back with `git reset --hard <prev-sha>` on the VPS and rerun the path's build/restart.

## What never to change here

- Don't bypass `--frozen-lockfile`. The deploy must match `bun.lock`.
- Don't run whisper or ffmpeg on the server — those run on the user's Mac during ingest. The server only stores and serves results.
- Don't expose port 3000 publicly. Caddy fronts it on 443.
