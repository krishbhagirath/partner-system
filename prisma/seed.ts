import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../apps/web/src/generated/prisma/client";

type SeedUser = {
  email: string;
  password: string;
  name: string;
};

const envPath =
  ["apps/web/.env.local", ".env.local"]
    .map((path) => resolve(process.cwd(), path))
    .find(existsSync) ?? "apps/web/.env.local";

config({ path: envPath });

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed test users in production. This script is for local development only.",
    );
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed the database.");
  }

  const seedUsers = getSeedUsers();

  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
    }),
  });

  try {
    for (const seedUser of seedUsers) {
      const passwordHash = await bcrypt.hash(seedUser.password, 12);
      // Seed accounts are trusted local/test users — skip the email
      // verification gate that real registrations go through.
      const user = await db.user.upsert({
        create: {
          displayName: seedUser.name,
          email: seedUser.email,
          emailVerified: new Date(),
          name: seedUser.name,
          passwordHash,
        },
        update: {
          displayName: seedUser.name,
          emailVerified: new Date(),
          name: seedUser.name,
          passwordHash,
        },
        where: {
          email: seedUser.email,
        },
      });

      console.log(`Seeded local test user: ${user.email}`);
    }
  } finally {
    await db.$disconnect();
  }
}

function getSeedUsers(): SeedUser[] {
  const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "SEED_USER_EMAIL and SEED_USER_PASSWORD are required. Set them in apps/web/.env.local; there are no default seed credentials.",
    );
  }

  const users: SeedUser[] = [
    {
      email,
      name: process.env.SEED_USER_NAME ?? "Test User",
      password,
    },
  ];
  const secondEmail = process.env.SEED_USER_2_EMAIL?.trim().toLowerCase();
  const secondPassword = process.env.SEED_USER_2_PASSWORD;

  if (secondEmail) {
    if (!secondPassword) {
      throw new Error("SEED_USER_2_PASSWORD is required when SEED_USER_2_EMAIL is set.");
    }

    users.push({
      email: secondEmail,
      name: process.env.SEED_USER_2_NAME ?? "Second Test User",
      password: secondPassword,
    });
  }

  assertUniqueEmails(users);

  return users;
}

function assertUniqueEmails(users: SeedUser[]) {
  const emails = new Set<string>();

  for (const user of users) {
    if (emails.has(user.email)) {
      throw new Error(`Seed user emails must be unique: ${user.email}`);
    }

    emails.add(user.email);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
