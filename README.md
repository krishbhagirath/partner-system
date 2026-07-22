# PartnerUp

A monorepo-style web app for matching McMaster students with lab and tutorial partners.
Students import their Mosaic schedule, mark the sections they want a partner for, browse
classmates in the same sections, and send/accept partner requests.

> Note: the repository folder, npm workspace names (`@labpartner/web`), and package.json
> `name` fields are unchanged to avoid churn in scripts, lockfiles, and deploy configs.
> "PartnerUp" is the user-facing product name only.

## Projects

| Project                               | Path             | Deploys to                                                        |
| ------------------------------------- | ---------------- | ----------------------------------------------------------------- |
| Next.js web app                       | `apps/web`       | Vercel                                                            |
| Scraper worker (Express + Playwright) | `scraper-worker` | GCP VM (see [scraper-worker/README.md](scraper-worker/README.md)) |

## Tech

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma with Supabase hosted PostgreSQL
- Auth.js (credentials + "Continue with Microsoft" via Entra ID, JWT sessions)
- Zod
- ESLint / Prettier

## Local Development

```bash
npm install
cp .env.example apps/web/.env.local   # then fill in real values
npm run db:generate
npx prisma migrate deploy
npm run seed                           # optional local test accounts (dev only)
npm run dev
```

See `.env.example` for every variable. The seed script requires `SEED_USER_EMAIL` and
`SEED_USER_PASSWORD` (there are no default credentials) and refuses to run when
`NODE_ENV=production`.

To run Mosaic imports locally you also need the scraper worker running; see
[scraper-worker/README.md](scraper-worker/README.md).

## Environment Variables (web app)

| Variable                         | Required                                 | Purpose                                                                 |
| -------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`                   | yes (validated at startup in production) | Pooled Supabase connection string used at runtime                       |
| `DIRECT_URL`                     | for migrations                           | Direct Supabase connection string used by Prisma migrate                |
| `AUTH_SECRET`                    | yes (validated at startup in production) | Auth.js session signing secret (`npx auth secret`)                      |
| `NEXT_PUBLIC_APP_URL`            | yes                                      | Public URL of the deployment                                            |
| `SCRAPER_URL`                    | for imports                              | Base URL of the scraper worker                                          |
| `WORKER_SECRET`                  | for imports                              | Shared secret sent to the scraper worker; must match the worker's value |
| `SEED_USER_*`                    | dev only                                 | Local seed accounts for `npm run seed`                                  |
| `AUTH_MICROSOFT_ENTRA_ID_ID`     | for "Continue with Microsoft"            | Application (client) ID from the Azure app registration below           |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | for "Continue with Microsoft"            | Client secret value from the same app registration                      |

Environment validation lives in `apps/web/src/lib/env.ts`; in production the app fails
fast at startup if `AUTH_SECRET` or `DATABASE_URL` is missing. The Microsoft variables
are optional — without them the app runs fine, the Microsoft button just isn't
functional (email/password sign-in is unaffected either way).

## "Continue with Microsoft" Setup (Azure App Registration)

Sign-in is restricted to `@mcmaster.ca` accounts by a check in `apps/web/src/auth.ts`,
enforced _after_ Microsoft authenticates the user — so this works without McMaster IT's
involvement. You register your own free app in your own Microsoft account, configured to
accept sign-ins from any work/school Microsoft account, and the app itself rejects
anything that isn't `@mcmaster.ca`.

1. Go to [portal.azure.com](https://portal.azure.com) and sign in (any Microsoft account
   works for managing the registration — it doesn't need to be your McMaster one,
   though it can be).
2. Search for **"App registrations"** → **New registration**.
3. Name it (e.g. "PartnerUp"). Under **Supported account types**, choose **"Accounts in
   any organizational directory (Any Microsoft Entra ID tenant - Multitenant)"** — this
   is what allows McMaster's tenant specifically without pre-approval, while excluding
   personal outlook.com/hotmail.com accounts.
4. Under **Redirect URI**, select platform **Web** and enter:
   - Local dev: `http://localhost:3000/api/auth/callback/microsoft-entra-id`
   - Production: `https://<your-deployed-domain>/api/auth/callback/microsoft-entra-id`
   - You can add both — an app registration accepts multiple redirect URIs. Add the
     production one once you know your real domain.
5. Click **Register**. On the app's **Overview** page, copy the **Application (client)
   ID** → this is `AUTH_MICROSOFT_ENTRA_ID_ID`.
6. Go to **Certificates & secrets** → **New client secret**. Copy the secret's **Value**
   immediately (it's hidden after you leave the page) → this is
   `AUTH_MICROSOFT_ENTRA_ID_SECRET`.
7. Go to **Token configuration** → **Add optional claim** → token type **ID** → check
   **email** → Add. This ensures the `email` claim is reliably present (the app also
   falls back to `preferred_username` if it's ever missing).
8. Add both values to `apps/web/.env.local` (and to your Vercel project's environment
   variables for production).
9. Restart the dev server, go to `/auth/signin`, and click **Continue with Microsoft** —
   you should land on a real Microsoft login page, sign in with your `@mcmaster.ca`
   account, and land back in the app signed in.

Any email outside `@mcmaster.ca` is rejected after the Microsoft login step with a
message on the sign-in page — this is expected and confirms the domain check is working.

## Deploying the Web App (Vercel)

1. **Database**: create a Supabase project. Note the pooled (`...pooler.supabase.com:6543`)
   and direct (`db....supabase.co:5432`) connection strings.
2. **Migrations**: run against the hosted database from your machine or CI:

   ```bash
   DATABASE_URL="<pooled-url>" DIRECT_URL="<direct-url>" npx prisma migrate deploy
   ```

3. **Vercel project**: import the repo. Set the root directory to the repository root
   (the workspace scripts handle the rest). Build command `npm run build`, install
   command `npm install`.
4. **Environment variables** (Production scope): `DATABASE_URL`, `DIRECT_URL`,
   `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL` (your Vercel URL), `SCRAPER_URL` (the worker's
   public URL), `WORKER_SECRET`. Do **not** set the `SEED_USER_*` variables in
   production.
5. **Deploy**, then verify:
   - `https://<your-app>/api/health` returns `{"ok":true}`
   - `/debug/import-parser` and `POST /api/debug/import-parser` return 404 (they are
     development-only and disabled outside `NODE_ENV=development`)
   - Sign-in, import, sections, and profile flows work end to end.

## Production Notes

- **Do not add a root `app/loading.tsx`**: with Next 16.2.6 production builds, a root
  loading boundary causes server-action responses (Accept/Decline/Save forms) to never
  apply on the client — the buttons hang in their pending state even though the action
  commits. Verified by bisection; dev mode is unaffected, so test any reintroduction
  against `next build` + `next start`.

- **Rate limiting**: `POST /api/import/start` (3 per 10 min per user) and partner
  request create/respond (20 and 30 per min per user) return 429 with `Retry-After`
  when exceeded. Counters are in-memory per server instance
  (`apps/web/src/lib/rate-limit.ts`); swap in a shared store if you need global limits.
- **Logging**: API routes and server actions log failures as single-line JSON via
  `apps/web/src/server/api-error.ts`; unexpected errors return a generic 500 JSON body.
- **Credentials**: MacID passwords are never stored; they are forwarded once to the
  scraper worker over the authenticated `/scrape` call and redacted from error messages.
  Because that call carries real credentials, point `SCRAPER_URL` at HTTPS or a private
  network path in production — not a plain-HTTP address on the public internet.
- **Sign-in throttling**: credentials sign-in is limited to 10 attempts per 5 minutes
  per IP (429 afterwards), and unknown emails cost the same bcrypt time as wrong
  passwords to prevent account enumeration by timing. Registration
  (`POST /api/auth/register`, `@mcmaster.ca` emails only) is limited to 5 attempts per
  15 minutes per IP.

## Database Migrations

The Prisma schema lives in `prisma/schema.prisma`.

```bash
npm run db:migrate -- --name <migration_name>   # local dev (shadow database)
npx prisma migrate deploy                       # hosted/production database
npm run db:generate
npx prisma validate
```

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```
