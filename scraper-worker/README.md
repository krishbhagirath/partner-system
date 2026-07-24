# PartnerUp Scraper Worker

Express + Playwright service that logs into McMaster Mosaic with a student's MacID,
scrapes their weekly schedule, parses lab/tutorial sections, and writes them to the
shared Supabase database. Called by the Next.js app's `POST /api/import/start`.

## Endpoints

| Endpoint       | Auth                     | Purpose                               |
| -------------- | ------------------------ | ------------------------------------- |
| `GET /health`  | none                     | Liveness probe, returns `{"ok":true}` |
| `POST /scrape` | `x-worker-secret` header | Runs one import job                   |

`POST /scrape` is protected by a shared secret (timing-safe comparison) and a basic
global rate limit (10 requests per 10 minutes → 429 with `Retry-After`). It returns
`202` immediately and runs the scrape in the background behind a concurrency cap
(`SCRAPER_MAX_CONCURRENCY`, default 2); extra jobs queue in FIFO order and start as
running slots free up. Job status (`RUNNING`/`SUCCEEDED`/`FAILED`) is written straight
to the database, which the web app polls. On success the worker emails the user that
their schedule has been imported (best-effort — see email vars below).

## Environment Variables

| Variable            | Required                   | Purpose                                                                                                |
| ------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`      | yes (validated at startup) | Pooled Supabase connection string                                                                      |
| `WORKER_SECRET`     | yes (validated at startup) | Shared secret; must match the web app's `WORKER_SECRET`                                                |
| `PORT`              | no (default 8080)          | Listen port; validated at startup                                                                      |
| `SCRAPER_HEADLESS`  | no                         | Headless by default everywhere; set `false` to watch the browser while debugging (slower)              |
| `NODE_ENV`          | yes in production          | `production` disables failure-artifact dumps                                                           |
| `SCRAPER_FULL_TERM` | no                         | `true` scans every week of the term instead of stopping after 4 consecutive weeks with no new sections |
| `SCRAPER_MAX_CONCURRENCY` | no (default 2)       | Max Chromium instances running at once; extra imports queue. Keep low on a small-RAM VM                 |
| `RESEND_API_KEY`    | no                         | Resend API key for the "import complete" email. If unset, the email is skipped (job still succeeds)    |
| `EMAIL_FROM`        | no                         | "From" address for the email, e.g. `PartnerUp <onboarding@resend.dev>`. Required alongside `RESEND_API_KEY` |
| `NEXT_PUBLIC_APP_URL` | no                       | Public app URL; adds a "Go to dashboard" button to the email. Button omitted if unset                  |

Variables are read from the process environment first, then `.env` / `.env.local` in
this directory. Missing `DATABASE_URL` or `WORKER_SECRET` crashes the process at
startup by design.

## Local Development

```bash
npm install
npm run playwright:install   # installs Chromium
npm run dev                  # tsx watch, defaults to port 8080
npm test                     # parser unit tests
```

## Deploying to a GCP VM

1. **Provision** a small VM (e2-small is enough) with Node.js 22+. Open the chosen
   port (default 8080) to the web app only — ideally restrict the firewall rule to
   Vercel egress or front it with a load balancer; the endpoint is secret-protected
   but should not be broadly reachable.
2. **Install**:

   ```bash
   git clone <repo> && cd labPartnerPlatform/scraper-worker
   npm install
   npm run playwright:install    # installs Chromium plus system deps
   npm run build                 # prisma generate + tsc -> dist/
   ```

3. **Configure** `/etc/labpartner-scraper.env` (or a `.env` file in this directory):

   ```env
   NODE_ENV=production
   DATABASE_URL=<pooled supabase url>
   WORKER_SECRET=<same value as the web app>
   PORT=8080
   SCRAPER_HEADLESS=true
   SCRAPER_MAX_CONCURRENCY=2
   # Optional: enables the "your schedule has been imported" email.
   RESEND_API_KEY=<resend api key>
   EMAIL_FROM=PartnerUp <onboarding@resend.dev>
   NEXT_PUBLIC_APP_URL=https://<your-deployed-domain>
   ```

4. **Run as a service** (systemd unit):

   ```ini
   [Unit]
   Description=PartnerUp scraper worker
   After=network-online.target

   [Service]
   WorkingDirectory=/opt/labPartnerPlatform/scraper-worker
   EnvironmentFile=/etc/labpartner-scraper.env
   ExecStart=/usr/bin/node dist/index.js
   Restart=on-failure
   User=labpartner

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo systemctl enable --now labpartner-scraper
   curl http://localhost:8080/health   # {"ok":true}
   ```

5. **Point the web app at it**: set `SCRAPER_URL=http://<vm-ip>:8080` and the matching
   `WORKER_SECRET` in the Vercel environment.

## Production Behavior

- Logs are single-line JSON (`level`, `step`, `jobId`, `timestamp`) — friendly to
  Cloud Logging. Credentials are redacted from error messages and never logged.
- Failure screenshots/HTML dumps under `/tmp` are written only outside
  `NODE_ENV=production`.
- The service updates `ImportJob` status through every stage, so the web app can poll
  progress even if the HTTP response is lost.
- `/scrape` enqueues the job and returns `202` right away; at most
  `SCRAPER_MAX_CONCURRENCY` scrapes run concurrently and the rest wait in FIFO order.
- On a successful import the worker emails the user (when `RESEND_API_KEY`/`EMAIL_FROM`
  are set). Email failures are logged and never fail the job — the sections are already
  saved by the time the email is attempted.
