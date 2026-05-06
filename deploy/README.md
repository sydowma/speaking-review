# Deployment

Two equivalent paths — pick the one that fits your VPS setup:

- **Docker** (one-line) — easiest if your VPS already runs containers.
- **Bare metal + systemd** (recommended for low-traffic personal use) — fewer moving parts, less RAM.

Both expect Caddy in front for HTTPS (or Nginx, if you prefer).

---

## Prereqs

- A Linux VPS (Hetzner / DigitalOcean / your own — anything with 512MB RAM is plenty)
- A domain pointed at the VPS's public IP (`A` record)
- Caddy installed (`apt install caddy` on Debian/Ubuntu)
- A long random string for `SPEAKING_REVIEW_TOKEN`. Generate one:
  ```bash
  openssl rand -hex 32
  ```

## Path A — Docker

```bash
# On the VPS
git clone <your-fork-url> /opt/speaking-review
cd /opt/speaking-review

docker build -t speaking-review .
docker volume create speaking-review-data

docker run -d --name speaking-review \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e SPEAKING_REVIEW_TOKEN=YOUR_LONG_RANDOM_TOKEN \
  -v speaking-review-data:/data \
  speaking-review
```

## Path B — Bare metal + systemd

```bash
# 1. Install Bun
curl -fsSL https://bun.sh/install | bash    # one-time setup
sudo install -m755 ~/.bun/bin/bun /usr/local/bin/bun

# 2. Add a service user
sudo useradd -r -s /usr/sbin/nologin speaking-review
sudo mkdir -p /opt/speaking-review /var/lib/speaking-review
sudo chown speaking-review:speaking-review /var/lib/speaking-review

# 3. Deploy code
sudo git clone <your-fork-url> /opt/speaking-review
cd /opt/speaking-review
sudo -u speaking-review bun install --frozen-lockfile
sudo -u speaking-review bun run --cwd web build

# 4. Token + service
echo 'SPEAKING_REVIEW_TOKEN=YOUR_LONG_RANDOM_TOKEN' | sudo tee /etc/speaking-review.env
sudo chmod 600 /etc/speaking-review.env

sudo cp deploy/speaking-review.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now speaking-review
sudo systemctl status speaking-review
```

## Caddy reverse proxy (both paths)

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
# edit and replace speaking-review.example.com with your domain
sudo systemctl reload caddy
```

That's it — Caddy fetches a Let's Encrypt cert on first hit.

## Adding reviews

The server doesn't run whisper or Claude itself — those run **on your Mac** during ingest. Then you push the result up:

```bash
# On your Mac, after ingest
speaking-review list                            # find the id
speaking-review sync <id> \
  --to https://speaking-review.example.com \
  --token YOUR_LONG_RANDOM_TOKEN
```

You can also export `SPEAKING_REVIEW_TOKEN=...` and skip the `--token` flag.

## Visiting from a browser

First time: open `https://speaking-review.example.com/?token=YOUR_LONG_RANDOM_TOKEN`. The web app captures the token from the URL, stores it in `localStorage`, and rewrites the URL to drop the token from the address bar. From that point on, the browser is authenticated.

To rotate the token: change `SPEAKING_REVIEW_TOKEN`, restart the server, and re-visit any device with a fresh `?token=...`.

## Storage layout (server side)

```
/var/lib/speaking-review/             (or /data inside Docker)
└── reviews/
    └── <uuid>/
        ├── meta.json
        ├── analysis.json
        ├── audio.wav        (≈ 46 MB per 25-min review)
        └── practice.json    (per-issue practice progress)
```

Back this directory up (`tar czf backup.tar.gz /var/lib/speaking-review/`) and you've got everything.

## Updating

```bash
# Path A: Docker
docker build -t speaking-review . && docker rm -f speaking-review && \
docker run -d ...   # same flags as initial run

# Path B: bare metal
cd /opt/speaking-review && sudo git pull
sudo -u speaking-review bun install --frozen-lockfile
sudo -u speaking-review bun run --cwd web build
sudo systemctl restart speaking-review
```

## Costs

- VPS: $4–5 / mo (Hetzner CPX11, DigitalOcean basic, etc.)
- Domain: ~$10 / yr
- Compute for ingest: free (runs on your Mac)
- Claude API: ≈ $0.02 per 25-min review when using a paid API key (Sonnet 4.6 + prompt caching)
