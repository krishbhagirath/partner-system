# LabPartner Platform

A web app for matching students for labs and tutorials.

## Tech

- Next.js
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL

## Getting Started

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate -- --name init
npm run dev
```

App:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/api/health
```

## Environment Variables

```env
DATABASE_URL=
NEXT_PUBLIC_APP_URL=
```

## Database Migrations

The Prisma schema lives in `prisma/schema.prisma`. The generated Prisma client is written to
`apps/web/src/generated/prisma` and is ignored by Git.

Create a migration after changing the schema:

```bash
npm run db:migrate -- --name init_lab_partner_schema
```

Regenerate the Prisma client without creating a migration:

```bash
npm run db:generate
```

Validate the schema:

```bash
npx prisma validate
```

The shared Prisma client helper is in `apps/web/src/server/db.ts`.

## Status

Early development.
