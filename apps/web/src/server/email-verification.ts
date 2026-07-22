import "server-only";

import { randomBytes } from "node:crypto";

import { env } from "@/lib/env";
import { sendVerificationEmail } from "@/lib/email";
import { db } from "@/lib/db";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Reuses the standard Auth.js `VerificationToken` table (already in the
// schema for the adapter, otherwise unused) rather than adding a new model.
export async function sendEmailVerification(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  await db.verificationToken.deleteMany({
    where: {
      identifier: normalizedEmail,
    },
  });

  const token = randomBytes(32).toString("hex");

  await db.verificationToken.create({
    data: {
      expires: new Date(Date.now() + TOKEN_TTL_MS),
      identifier: normalizedEmail,
      token,
    },
  });

  const verifyUrl = new URL("/api/auth/verify-email", env.NEXT_PUBLIC_APP_URL);
  verifyUrl.searchParams.set("token", token);

  await sendVerificationEmail(normalizedEmail, verifyUrl.toString());
}

export type ConsumeVerificationTokenResult =
  | { status: "ok" }
  | { status: "invalid" }
  | { status: "expired" };

export async function consumeEmailVerificationToken(
  token: string,
): Promise<ConsumeVerificationTokenResult> {
  const verificationToken = await db.verificationToken.findFirst({
    where: {
      token,
    },
  });

  if (!verificationToken) {
    return { status: "invalid" };
  }

  await db.verificationToken.delete({
    where: {
      identifier_token: {
        identifier: verificationToken.identifier,
        token: verificationToken.token,
      },
    },
  });

  if (verificationToken.expires < new Date()) {
    return { status: "expired" };
  }

  await db.user.updateMany({
    data: {
      emailVerified: new Date(),
    },
    where: {
      email: verificationToken.identifier,
    },
  });

  return { status: "ok" };
}
