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

## Status

Early development.