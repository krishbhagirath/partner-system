import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../apps/web/src/generated/prisma/client";

const envPath =
  ["apps/web/.env.local", ".env.local"]
    .map((path) => resolve(process.cwd(), path))
    .find(existsSync) ?? "apps/web/.env.local";

config({ path: envPath });

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed the database.");
  }

  const email = (process.env.SEED_USER_EMAIL ?? "test@mcmaster.ca").trim().toLowerCase();
  const password = process.env.SEED_USER_PASSWORD ?? "labpartner-test-password";
  const name = process.env.SEED_USER_NAME ?? "Test User";
  const passwordHash = await bcrypt.hash(password, 12);

  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
    }),
  });

  try {
    const user = await db.user.upsert({
      create: {
        displayName: name,
        email,
        name,
        passwordHash,
      },
      update: {
        displayName: name,
        name,
        passwordHash,
      },
      where: {
        email,
      },
    });

    console.log(`Seeded local test user: ${user.email}`);
    console.log(`Password: ${password}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
