# LabPartner Platform

A monorepo-style web app for matching McMaster students with lab and tutorial partners.

## Tech

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma with Supabase hosted PostgreSQL
- Zod
- ESLint
- Prettier

## Getting Started

```bash
npm install
cp .env.example .env.local
npm run db:generate
npm run db:migrate -- --name init
npm run dev
```

Copy `.env.example` to `.env.local` and fill in the required local values before running
database commands.

## Database Migrations

The Prisma schema lives in `prisma/schema.prisma`.

```bash
npm run db:migrate -- --name init_lab_partner_schema
npm run db:generate
npx prisma validate
```

## Status

Early development.
