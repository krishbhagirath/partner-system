# PartnerUp

**Find a lab or tutorial partner at McMaster.**


https://github.com/user-attachments/assets/6438a2b4-6350-4baf-934c-cf033ffd23e9


PartnerUp matches students who share the same labs and tutorials. Import your Mosaic
schedule, mark the sections you want a partner for, see classmates in those exact
sections who are also looking, and send or accept partner requests. No more group-chat
spam or awkward "does anyone need a partner?" posts.

## Features

- **McMaster sign-in** — email/password or "Continue with Microsoft," restricted to
  `@mcmaster.ca` accounts.
- **One-click schedule import** — pulls your labs and tutorials straight from Mosaic.
  Lecture times and personal details are never stored.
- **Mark what you need** — flag the sections you're looking for a partner in.
- **Find classmates** — browse students in your exact section who are also looking, each
  with an optional note about themselves.
- **Requests & matches** — send, accept, or decline partner requests, and view confirmed
  partners with the contact details to reach them.
- **Stay in the loop** — email notifications when your schedule import finishes and when
  you get matched.

## How it works

1. Sign in and import your Mosaic timetable.
2. PartnerUp saves only your labs and tutorials, then asks which ones need a partner.
3. You're matched with classmates by section — same course, component, section, day, and
   time.
4. Send a request; once someone accepts, you both get each other's contact details.

### Privacy & safety

- Your MacID password is **never stored** — it's used once to import your schedule, then
  discarded, and is redacted from all logs.
- Contact details are only shared **after** a match is mutually confirmed.
- Sign-in is limited to verified `@mcmaster.ca` accounts.

## Tech

Next.js (App Router) · TypeScript · Tailwind CSS · Prisma · Supabase PostgreSQL ·
Auth.js · Express + Playwright (schedule scraper) · Resend.
