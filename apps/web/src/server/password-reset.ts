import "server-only";

import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";

import { db } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { env } from "@/lib/env";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
// Namespaces reset tokens in the shared VerificationToken table so they never
// collide with email-verification tokens (both would otherwise key on email).
const IDENTIFIER_PREFIX = "pwreset:";

/**
 * Best-effort: if an account exists for `email`, create a single-use reset token
 * and email a reset link. Never reveals whether the account exists (the caller
 * always responds the same) to avoid email enumeration. Email delivery to McMaster
 * inboxes is not guaranteed — if it doesn't arrive, it doesn't.
 */
export async function sendPasswordReset(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const identifier = `${IDENTIFIER_PREFIX}${normalizedEmail}`;

  const user = await db.user.findUnique({
    select: { id: true },
    where: { email: normalizedEmail },
  });

  // Clear any old reset tokens for this email regardless (harmless if none).
  await db.verificationToken.deleteMany({ where: { identifier } });

  if (!user) {
    return; // no account — silently do nothing
  }

  const token = randomBytes(32).toString("hex");
  await db.verificationToken.create({
    data: { expires: new Date(Date.now() + TOKEN_TTL_MS), identifier, token },
  });

  const resetUrl = new URL("/auth/reset-password", env.NEXT_PUBLIC_APP_URL);
  resetUrl.searchParams.set("token", token);

  await sendPasswordResetEmail(normalizedEmail, resetUrl.toString());
}

export type ConsumePasswordResetResult = { status: "ok" } | { status: "invalid" } | { status: "expired" };

/** Verifies a reset token and sets the new password. Single-use. */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
): Promise<ConsumePasswordResetResult> {
  const record = await db.verificationToken.findFirst({ where: { token } });

  if (!record || !record.identifier.startsWith(IDENTIFIER_PREFIX)) {
    return { status: "invalid" };
  }

  // Single-use: consume it now, before validating expiry / updating.
  await db.verificationToken.delete({
    where: { identifier_token: { identifier: record.identifier, token: record.token } },
  });

  if (record.expires < new Date()) {
    return { status: "expired" };
  }

  const email = record.identifier.slice(IDENTIFIER_PREFIX.length);
  const passwordHash = await bcrypt.hash(newPassword, 12);

  await db.user.updateMany({ data: { passwordHash }, where: { email } });

  return { status: "ok" };
}
