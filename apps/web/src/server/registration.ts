import "server-only";

import bcrypt from "bcryptjs";

import { db } from "@/lib/db";

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
};

export async function registerUser({ displayName, email, password }: RegisterUserInput) {
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
