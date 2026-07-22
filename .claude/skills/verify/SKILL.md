---
name: verify
description: How to run and verify the LabPartner web app end-to-end (auth, fixtures, driving pages and API routes over HTTP).
---

# Verifying LabPartner changes

## Build / launch

- Dev server: `npm run dev` from repo root (Next.js on http://localhost:3000). Check first — one is often already running: `curl http://localhost:3000/api/health` → `{"ok":true}`.
- `npm run build` runs `prisma generate` first, which fails with EPERM on the query-engine DLL while a dev server is running. If the schema didn't change, use `npm run build --workspace @labpartner/web` instead.
- Typecheck: `npx tsc --noEmit` inside `apps/web`.

## Test fixtures

DB is live Supabase (dev). Create throwaway users with a tsx script **placed at the repo root** (scripts outside the repo can't resolve `node_modules`), importing `./apps/web/src/generated/prisma/client` with `PrismaPg` adapter and `dotenv` loading `apps/web/.env.local`. Users need a bcrypt `passwordHash` to sign in. Cross-user section matching is by identity fields (term, courseCode, componentType, sectionCode, dayOfWeek, startTime, endTime) — each user owns their own Section row; times are `1970-01-01T{HH:MM}:00.000Z`. Give each user a `DiscoverableSection` with `isActive: true` to appear in discovery. Use a fake course code like `VERIFY 1AA3` and delete the users afterward (cascades clean everything).

## Known landmine

A root `app/loading.tsx` breaks server-action form responses in **production builds**
(Next 16.2.6): the POST succeeds and commits, the RSC response streams fully, but the
client never applies it — pending buttons hang forever. Dev mode works fine, so this
only shows up under `next build` + `next start`. Removed 2026-07-09 after bisection;
don't re-add without retesting the Accept/Save forms against a prod build.

## Driving the surface

- Sign in with curl: `GET /api/auth/csrf` into a cookie jar, then `POST /api/auth/callback/credentials` with form fields `csrfToken`, `email`, `password` (expect 302). Session check: `GET /api/partner-requests` returns JSON, not 401.
- Partner requests API: `POST /api/partner-requests` `{receiverId, sectionId, message?}` (sectionId is the **sender's** section row); `PATCH /api/partner-requests/:id` `{"status":"ACCEPTED"|"DECLINED"}`.
- Pages: fetch `/sections` and `/profile` with the cookie jar. Strip `<script>` blocks and tags before grepping visible text — Next inlines the RSC flight payload, so raw string counts are ~2x the DOM.
