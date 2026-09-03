import "server-only";

import bcrypt from "bcryptjs";

import { db } from "@/lib/db";
import { EMAIL_VERIFICATION_ENABLED } from "@/lib/feature-flags";

export class RegistrationError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "RegistrationError";
  }
}

export type RegisterUserInput = {
  displayName: string;
  email: string;
  password: string;
  contactPhone?: string | undefined;
  contactInstagram?: string | undefined;
  contactOther?: string | undefined;
};

export async function registerUser({
  displayName,
  email,
  password,
  contactPhone,
  contactInstagram,
  contactOther,
}: RegisterUserInput) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedDisplayName = displayName.trim();
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    return await db.user.create({
      data: {
        displayName: normalizedDisplayName,
        email: normalizedEmail,
        name: normalizedDisplayName,
        passwordHash,
        contactPhone: contactPhone?.trim() || null,
        contactInstagram: contactInstagram?.trim() || null,
        contactOther: contactOther?.trim() || null,
        // When verification is disabled, mark verified on creation so the field
        // stays consistent and login isn't gated. When enabled, leave it null so
        // the email flow drives verification. See feature-flags.ts.
        emailVerified: EMAIL_VERIFICATION_ENABLED ? null : new Date(),
      },
      select: {
        email: true,
        id: true,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new RegistrationError("An account with this email already exists.", 409);
    }

    throw error;
  }
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
